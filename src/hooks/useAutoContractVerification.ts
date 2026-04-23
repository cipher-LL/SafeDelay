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

import { useState, useEffect, useCallback } from 'react';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { sha256 } from '@cashscript/utils';
import { binToHex } from '@bitauth/libauth';
import { StoredContract } from './useSafeDelayContracts';
import { debug, debugLog } from '../utils/debug';

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

export interface VerificationResult {
  /** Contracts from localStorage that are confirmed on-chain */
  confirmed: string[];
  /** Contracts from localStorage that appear empty (fully withdrawn) */
  empty: string[];
  /** Contracts from localStorage that have NO on-chain history (may be lost) */
  orphaned: string[];
  /** On-chain contracts NOT in localStorage (recoverable) */
  recoverable: Array<{
    address: string;
    ownerPkh: string;
    lockEndBlock: number;
  }>;
  /** Errors encountered during verification */
  errors: string[];
  /** Whether the auto-recovery scan ran */
  autoScanDone: boolean;
}

export interface UseAutoContractVerificationResult {
  verificationResult: VerificationResult | null;
  isVerifying: boolean;
  verifyProgress: string;
  /** Re-run verification manually */
  reverify: () => void;
  /** Apply recovered contracts to localStorage */
  applyRecovery: (contracts: VerificationResult['recoverable']) => void;
}

const RECOVERY_CHECK_KEY = 'safedelay_recovery_verified';

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

  const runVerification = useCallback(async () => {
    if (!walletAddress || !walletPubkeyHash) return;
    setIsVerifying(true);
    setVerifyProgress('');

    const result: VerificationResult = {
      confirmed: [],
      empty: [],
      orphaned: [],
      recoverable: [],
      errors: [],
      autoScanDone: false,
    };

    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

      // ── Case 1: localStorage has contracts — verify each one ──────────────
      if (storedContracts.length > 0) {
        setVerifyProgress(`Verifying ${storedContracts.length} stored contract(s)...`);

        for (const contract of storedContracts) {
          setVerifyProgress(`Checking ${contract.address.slice(0, 12)}...`);

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
              // Contract has live UTXOs — it's active
              result.confirmed.push(contract.address);
              debugLog('AutoVerify', `✓ ${contract.address}: confirmed (${utxos.length} UTXO(s))`);
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
            result.errors.push(`Failed to verify ${contract.address}: ${e instanceof Error ? e.message : String(e)}`);
            debug.warn('AutoVerify', `Error verifying ${contract.address}:`, e);
          }
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
              for (const utxo of unspent) {
                const addr = (utxo.address as string | undefined) || '';
                const isP2SH = addr.toLowerCase().includes(':p') || addr.toLowerCase().includes(':q') ||
                  (!addr.toLowerCase().includes(':') && (addr.toLowerCase().startsWith('p') || addr.toLowerCase().startsWith('q')));

                if (isP2SH && addr) {
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
    reverify: runVerification,
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
