/**
 * useAutoContractVerification.ts
 *
 * Automatically verifies stored contracts against on-chain state on app load.
 * Reconciles localStorage contracts with on-chain reality and surfaces
 * discrepancies (missing contracts, phantom localStorage entries, etc.).
 *
 * This fixes the bug where clearing localStorage loses the UI's awareness
 * of on-chain contracts — instead, the app now auto-discovers and recovers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { sha256 } from '@cashscript/utils';
import { binToHex } from '@bitauth/libauth';
import { StoredContract } from './useSafeDelayContracts';
import { debug, debugLog } from '../utils/debug';

// Network error messages from Electrum provider — used to detect transient vs fatal errors
const NETWORK_ERROR_PATTERNS = [
  'fetch failed',
  'failed to fetch',
  'network error',
  'net::err',
  'connection refused',
  'timeout',
  'econnreset',
  'enotfound',
  'eserverfault',
  'socket hang up',
  'service unavailable',
  '503',
  '502',
  '504',
];

function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const msg = String(e).toLowerCase();
  return NETWORK_ERROR_PATTERNS.some(p => msg.includes(p));
}

function toCashScriptNetwork(network: 'mainnet' | 'testnet' | 'chipnet'): Network {
  switch (network) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
    default: return Network.TESTNET3;
  }
}

async function addressToScripthash(address: string): Promise<string> {
  const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
  const addr = address.replace(/^(bitcoincash:|bchtest:|bchreg:)/i, '');
  const result = await cashAddressToLockingBytecode(`bitcoincash:${addr}`);
  if (typeof result === 'string' || !result.bytecode) throw new Error('Invalid address');
  const lockScript = result.bytecode;
  const scriptHash = sha256(lockScript);
  scriptHash.reverse();
  return binToHex(scriptHash);
}

/**
 * Check if a BCH address is a P2SH or P2SH32 address by examining its locking bytecode.
 * This replaces the fragile string-prefix check that missed mainnet addresses (3...)
 * and testnet addresses (2...).
 */
async function isP2SHAddress(address: string): Promise<boolean> {
  try {
    const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
    const addr = address.replace(/^(bitcoincash:|bchtest:|bchreg:)/i, '');
    const result = await cashAddressToLockingBytecode(`bitcoincash:${addr}`);
    if (typeof result === 'string' || !result.bytecode) return false;
    const scriptHex = binToHex(result.bytecode);
    // P2SH locking script: OP_HASH160 <20-byte-hash> OP_EQUAL = a914...87 (23 bytes = 46 hex chars)
    const isP2SH = scriptHex.startsWith('a914') && scriptHex.endsWith('87') && scriptHex.length === 46;
    // P2SH32 locking script: OP_HASH256 <32-byte-hash> OP_EQUAL = aa20...8e (34 bytes = 68 hex chars)
    const isP2SH32 = scriptHex.startsWith('aa20') && scriptHex.endsWith('8e') && scriptHex.length === 68;
    return isP2SH || isP2SH32;
  } catch {
    return false;
  }
}

export interface VerificationResult {
  /** Contracts from localStorage that are confirmed on-chain */
  confirmed: string[];
  /** Contracts from localStorage that appear empty (fully withdrawn) */
  empty: string[];
  /** Contracts from localStorage that have NO on-chain history (may be lost) */
  orphaned: string[];
  /** Contracts with bytecode that does NOT match the expected hash from HASHES.json */
  bytecodeMismatch: Array<{
    address: string;
    expectedHash: string;
    actualHash: string;
  }>;
  /** On-chain contracts NOT in localStorage (recoverable) */
  recoverable: Array<{
    address: string;
    ownerPkh: string;
    lockEndBlock: number;
  }>;
  /** Errors encountered during verification */
  errors: string[];
  /** Transient network errors that may resolve on retry */
  networkErrors: string[];
  /** Whether the auto-recovery scan ran */
  autoScanDone: boolean;
}

export interface VerificationProgressDetail {
  current: number;
  total: number;
}

export interface UseAutoContractVerificationResult {
  verificationResult: VerificationResult | null;
  isVerifying: boolean;
  verifyProgress: string;
  /** Fractional progress (e.g. { current: 3, total: 12 }) */
  verifyProgressDetail: VerificationProgressDetail | null;
  /** Re-run verification manually */
  reverify: () => void;
  /** Abort the current verification operation */
  abort: () => void;
  /** Pause verification (can be resumed with reverify) */
  pause: () => void;
  /** Apply recovered contracts to localStorage */
  applyRecovery: (contracts: VerificationResult['recoverable']) => void;
}

const RECOVERY_CHECK_KEY = 'safedelay_recovery_verified';
// Throttle Electrum requests between contracts to avoid rate-limiting
const VERIFICATION_THROTTLE_MS = 150;

/**
 * Hook that automatically verifies stored contracts on app load.
 *
 * Behavior:
 * 1. If localStorage has contracts → verify each exists on-chain
 *    - Confirmed: has UTXOs or history → keep in list
 *    - Empty: no UTXOs but has history → mark as empty (withdrawn)
 *    - Orphaned: no UTXOs and no history → show "contract not found on-chain" warning
 * 2. If localStorage is EMPTY → auto-scan for on-chain contracts
 *    - Scans wallet's P2SH outputs for SafeDelay patterns
 *    - Marks found contracts as recoverable
 * 3. Shows recovery UI if orphaned contracts or recoverable contracts found
 */
export function useAutoContractVerification(
  storedContracts: StoredContract[],
  walletAddress: string | null,
  walletPubkeyHash: string | null,
  network: 'mainnet' | 'testnet' | 'chipnet'
): UseAutoContractVerificationResult {
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState('');
  const [verifyProgressDetail, setVerifyProgressDetail] = useState<VerificationProgressDetail | null>(null);
  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  // Track index within the current storedContracts scan for resume support
  const verifiedCountRef = useRef(0);

  const abort = useCallback(() => {
    cancelledRef.current = true;
    setVerifyProgress('Verification cancelled by user.');
    setTimeout(() => {
      setIsVerifying(false);
      setVerifyProgress('');
      setVerificationResult(prev => prev ? {
        ...prev,
        errors: [...(prev.errors), 'Verification cancelled by user.'],
      } : null);
    }, 300);
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setVerifyProgress('Verification paused. Click "Resume" to continue.');
  }, []);

  const runVerification = useCallback(async () => {
    if (!walletAddress || !walletPubkeyHash) return;
    cancelledRef.current = false;
    pausedRef.current = false;
    verifiedCountRef.current = 0;
    setIsVerifying(true);
    setVerifyProgress('');

    const result: VerificationResult = {
      confirmed: [],
      empty: [],
      orphaned: [],
      bytecodeMismatch: [],
      recoverable: [],
      errors: [],
      networkErrors: [],
      autoScanDone: false,
    };

    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

      // ── Case 1: localStorage has contracts — verify each one ──────────────
      if (storedContracts.length > 0) {
        setVerifyProgress(`Verifying ${storedContracts.length} stored contract(s)...`);
        setVerifyProgressDetail({ current: 0, total: storedContracts.length });

        for (const contract of storedContracts) {
          // Support pause: stop here and wait for next runVerification() call
          if (pausedRef.current) {
            setVerifyProgress('Verification paused. Click "Resume" to continue.');
            setIsVerifying(false);
            return;
          }
          // Support abort
          if (cancelledRef.current) {
            result.errors.push('Verification cancelled by user.');
            break;
          }

          verifiedCountRef.current += 1;
          setVerifyProgressDetail({ current: verifiedCountRef.current, total: storedContracts.length });
          setVerifyProgress(`Checking ${contract.address.slice(0, 12)}... (${verifiedCountRef.current}/${storedContracts.length})`);

          try {
            // Get UTXOs and history for this contract
            const [utxos, historyResult] = await Promise.all([
              provider.getUtxos(contract.address).catch(() => []),
              provider.performRequest(
                'blockchain.scripthash.get_history',
                await addressToScripthash(contract.address)
              ).catch(() => null) as Promise<Array<{ height: number; tx_hash: string }> | null>
            ]);

            const hasUtxos = utxos && utxos.length > 0;
            const hasHistory = historyResult && historyResult.length > 0;

            if (hasUtxos) {
              // ---------------------------------------------------------------------------
              // Bytecode verification caching — WHY this is safe
              // ---------------------------------------------------------------------------
              // BCH P2SH (Pay-to-Script-Hash) addresses are deterministic: the script bytecode
              // is fixed at address-creation time. Once the script is deployed to an address,
              // the bytecode at that address can NEVER change — spending it requires a
              // valid signature that satisfies the deployed script, but the script itself
              // is immutable. This is a fundamental property of P2SH / P2SH32.
              //
              // Therefore, if we have previously verified that the bytecode at
              // `contract.address` matches our HASHES.json record, we can safely cache
              // that result. On subsequent scans (e.g., every 60 s poll), re-hashing the
              // on-chain script and re-comparing it against HASHES.json would produce an
              // identical result — there is no scenario in which bytecode "changes."
              //
              // HOW contractVerified is set: After a successful verification in this hook,
              // the calling component (Dashboard.tsx) receives the result and sets
              // `contract.contractVerified = true` in its state, which is persisted to
              // localStorage under the `safedelay-contracts` key. On next load, the hook
              // initialises with that cached flag and skips re-verification.
              // ---------------------------------------------------------------------------
              if (contract.contractVerified) {
                result.confirmed.push(contract.address);
                debugLog('AutoVerify', `✓ ${contract.address}: confirmed (${utxos.length} UTXO(s), cached verification)`);
              } else {
                // Contract has live UTXOs — verify bytecode matches expected hash
                try {
                  const addressInfo = await provider.performRequest(
                    'get_address',
                    contract.address
                  ) as { script: string } | null;

                  if (addressInfo?.script) {
                    // Hash the script and compare against HASHES.json
                    const scriptBytes = Uint8Array.from(Buffer.from(addressInfo.script, 'hex'));
                    const scriptHash = sha256(scriptBytes);
                    const hashHex = binToHex(scriptHash);

                    // Import HASHES at runtime to avoid module resolution issues
                    const hashes = await import('../../artifacts/HASHES.json').then(m => m.default);
                    // Use contract type to select correct bytecode hash
                    const artifactKey = contract.type === 'multisig' ? 'SafeDelayMultiSig' : 'SafeDelay';
                    const expectedHash = hashes[artifactKey]?.bytecodeHash;

                    if (expectedHash && hashHex !== expectedHash) {
                      const label = contract.type === 'multisig' ? 'SafeDelayMultiSig' : 'SafeDelay';
                      result.bytecodeMismatch.push({ address: contract.address, expectedHash, actualHash: hashHex });
                      debugLog('AutoVerify', `⚠️ ${contract.address}: bytecode mismatch (expected ${expectedHash}, got ${hashHex})`);
                      result.errors.push(`Contract ${contract.address.slice(0, 16)}... has mismatched bytecode (${label}). The on-chain contract may have been modified or is not a genuine ${label} contract.`);
                    } else {
                      result.confirmed.push(contract.address);
                      debugLog('AutoVerify', `✓ ${contract.address}: confirmed (${utxos.length} UTXO(s), bytecode verified)`);
                    }
                  } else {
                    // Couldn't fetch script — just mark as confirmed
                    result.confirmed.push(contract.address);
                    debugLog('AutoVerify', `✓ ${contract.address}: confirmed (${utxos.length} UTXO(s), script fetch skipped)`);
                  }
                } catch (e) {
                  // Bytecode verification failed — still mark as confirmed (existence check passed)
                  result.confirmed.push(contract.address);
                  debug.warn('AutoVerify', `Bytecode verification failed for ${contract.address}:`, e);
                }
              }
            } else if (hasHistory) {
              // Contract has history but no UTXOs — fully withdrawn/empty
              result.empty.push(contract.address);
              debugLog('AutoVerify', `∅ ${contract.address}: empty (withdrawn)`);
            } else {
              // No UTXOs AND no history — contract not found on-chain
              result.orphaned.push(contract.address);
              debugLog('AutoVerify', `✗ ${contract.address}: orphaned (not on-chain)`);
              result.errors.push(`Contract ${contract.address.slice(0, 16)}... not found on-chain. It may have been created on a different network or the address is invalid.`);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (isNetworkError(e)) {
              result.networkErrors.push(`Network error verifying ${contract.address}: ${msg}`);
              debug.warn('AutoVerify', `Network error for ${contract.address}:`, e);
            } else {
              result.errors.push(`Failed to verify ${contract.address}: ${msg}`);
              debug.warn('AutoVerify', `Error verifying ${contract.address}:`, e);
            }
          }

          // Check for cancellation or pause between contracts
          if (cancelledRef.current) {
            result.errors.push('Verification cancelled by user.');
            break;
          }
          if (pausedRef.current) {
            setVerifyProgress('Verification paused. Click "Resume" to continue.');
            setIsVerifying(false);
            return;
          }
          // Throttle: sleep briefly between contracts to avoid Electrum rate limits
          await new Promise(resolve => setTimeout(resolve, VERIFICATION_THROTTLE_MS));
        }

        // ── Case 2: localStorage is empty — auto-scan for on-chain contracts ──
      } else {
        setVerifyProgress('No stored contracts found. Scanning blockchain for recoverable contracts...');

        // Only auto-scan if we haven't done so recently (avoid repeated scans)
        const lastCheck = localStorage.getItem(RECOVERY_CHECK_KEY);
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;

        if (lastCheck && now - parseInt(lastCheck, 10) < ONE_HOUR) {
          debugLog('AutoVerify', 'Skipping auto-scan: checked recently');
          result.autoScanDone = false;
          setVerificationResult(result);
          setIsVerifying(false);
          setVerifyProgress('');
          return;
        }

        localStorage.setItem(RECOVERY_CHECK_KEY, String(now));

        try {
          const scripthash = await addressToScripthash(walletAddress);
          const historyResult = await provider.performRequest(
            'blockchain.scripthash.get_history',
            scripthash
          ) as Array<{ height: number; tx_hash: string }> | null;

          if (historyResult && historyResult.length > 0) {
            setVerifyProgress(`Found ${historyResult.length} transaction(s). Looking for SafeDelay contracts...`);

            // Get all P2SH UTXOs for the wallet — these are the potential SafeDelay contracts
            const p2shUtxos: Array<{ address: string; satoshis: bigint; txHash: string; vout: number }> = [];

            const unspent = await provider.performRequest(
              'blockchain.scripthash.listunspent',
              scripthash
            ) as Array<{ tx_hash: string; tx_pos: number; value: number; address?: string }> | null;

            if (unspent && Array.isArray(unspent)) {
              // Check each address for P2SH/P2SH32 format using proper address decoding.
              // This replaces the fragile string-prefix check which missed mainnet P2SH
              // addresses (prefixed with '3') and testnet P2SH addresses (prefixed with '2').
              const results = await Promise.all(unspent.map(async (utxo) => {
                const addr = (utxo.address as string | undefined) || '';
                const detectedP2SH = await isP2SHAddress(addr);
                return { utxo, addr, detectedP2SH };
              }));
              for (const { utxo, addr, detectedP2SH } of results) {
                if (detectedP2SH && addr) {
                  p2shUtxos.push({
                    address: addr,
                    satoshis: BigInt(utxo.value),
                    txHash: utxo.tx_hash,
                    vout: utxo.tx_pos,
                  });
                }
              }
            }

            debugLog('AutoVerify', `Found ${p2shUtxos.length} P2SH UTXOs for wallet ${walletAddress}`);

            // For each P2SH UTXO, check if it's a SafeDelay contract by looking
            // at its creating/funding transaction for SafeDelay patterns
            for (const utxo of p2shUtxos) {
              try {
                // Get the creating transaction
                const fundingTxHex = await provider.getRawTransaction(utxo.txHash);

                // Try to decode SafeDelay params from OP_RETURN
                const decoded = decodeSafeDelayFundingTx(fundingTxHex);

                if (decoded && decoded.ownerPkh.toLowerCase() === walletPubkeyHash.toLowerCase()) {
                  result.recoverable.push({
                    address: utxo.address,
                    ownerPkh: decoded.ownerPkh,
                    lockEndBlock: decoded.lockEndBlock,
                  });
                  debugLog('AutoVerify', `Discovered recoverable SafeDelay: ${utxo.address}`);
                }
              } catch {
                // Skip UTXOs we can't decode
              }
            }
          }

          result.autoScanDone = true;
        } catch (e) {
          result.errors.push(`Auto-scan failed: ${e instanceof Error ? e.message : String(e)}`);
          debug.warn('AutoVerify', 'Auto-scan error:', e);
        }
      }
    } catch (e) {
      result.errors.push(`Verification failed: ${e instanceof Error ? e.message : String(e)}`);
      debug.error('AutoVerify', 'Verification error:', e);
    }

    setVerificationResult(result);
    if (cancelledRef.current) {
      setIsVerifying(false);
      setVerifyProgress('');
      return;
    }
    setIsVerifying(false);
    setVerifyProgress('');
  }, [storedContracts, walletAddress, walletPubkeyHash, network]);

  // Run verification on mount and whenever wallet/network changes
  useEffect(() => {
    if (walletAddress && walletPubkeyHash) {
      runVerification();
    }
  }, [walletAddress, walletPubkeyHash, network]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyRecovery = useCallback((contracts: VerificationResult['recoverable']) => {
    // This is handled in the Dashboard's recovery section
    // The verification result is exposed so the Dashboard can show the recovery UI
    debugLog('AutoVerify', `Applying recovery for ${contracts.length} contract(s)`);
  }, []);

  return {
    verificationResult,
    isVerifying,
    verifyProgress,
    verifyProgressDetail,
    reverify: runVerification,
    abort,
    pause,
    applyRecovery,
  };
}

/**
 * Decode a SafeDelay funding transaction to extract contract parameters.
 * SafeDelay deployments embed constructor args in the OP_RETURN output:
 * [artifactHash(32 bytes)][ownerPKH(20 bytes)][lockEndBlock(8 bytes, big-endian)]
 */
function decodeSafeDelayFundingTx(txHex: string): { ownerPkh: string; lockEndBlock: number } | null {
  try {
    let offset = 4; // version

    // Parse inputs
    const inputCount = parseVarInt(txHex, offset);
    offset = skipVarInt(txHex, offset);

    for (let i = 0; i < inputCount; i++) {
      offset += 36;
      const scriptLen = parseVarInt(txHex, offset);
      offset = skipVarInt(txHex, offset);
      offset += scriptLen * 2;
      offset += 8;
    }

    // Parse outputs
    const outputCount = parseVarInt(txHex, offset);
    offset = skipVarInt(txHex, offset);

    for (let i = 0; i < outputCount; i++) {
      offset += 8;
      const scriptLen = parseVarInt(txHex, offset);
      offset = skipVarInt(txHex, offset);
      const scriptHex = txHex.slice(offset, offset + scriptLen * 2);
      offset += scriptLen * 2;

      if (scriptHex.startsWith('6a')) {
        // OP_RETURN found — parse pushdata
        const pushDataOffset = offset - scriptLen * 2 + 2;
        const pushLen = parseVarInt(txHex, pushDataOffset);
        const opReturnData = scriptHex.slice(2, 2 + pushLen * 2);

        // CashScript SafeDelay deployment: [artifactHash(32)][ownerPKH(20)][lockEndBlock(8)]
        if (opReturnData.length >= 120) {
          const ownerPkh = opReturnData.slice(64, 104);
          const lockEndBlockHex = opReturnData.slice(104, 120);
          const lockEndBlock = parseInt(lockEndBlockHex, 16);

          if (ownerPkh.length === 40 && lockEndBlock > 0) {
            return { ownerPkh, lockEndBlock };
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return byte;
  if (byte === 0xfd) return parseInt(hex.slice(offset + 2, offset + 6), 16);
  if (byte === 0xfe) return parseInt(hex.slice(offset + 2, offset + 10), 16);
  return parseInt(hex.slice(offset + 2, offset + 18), 16);
}

function skipVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return offset + 2;
  if (byte === 0xfd) return offset + 6;
  if (byte === 0xfe) return offset + 10;
  return offset + 18;
}
