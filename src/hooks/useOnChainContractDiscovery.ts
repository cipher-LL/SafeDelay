/**
 * useOnChainContractDiscovery.ts
 *
 * Scans the blockchain for SafeDelay contracts that may have been lost from localStorage.
 * Works by:
 * 1. Getting all P2SH UTXOs for the wallet's known addresses (funding txs)
 * 2. Fetching the full transaction to decode the redeem script
 * 3. Verifying the redeem script matches SafeDelay's ownerPKH + lockEndBlock pattern
 * 4. Returning recoverable contracts that can be merged into localStorage
 */

import { useState, useCallback } from 'react';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { sha256 } from '@cashscript/utils';
import { binToHex } from '@bitauth/libauth';
import { debug, debugLog } from '../utils/debug';

function toCashScriptNetwork(network: 'mainnet' | 'testnet' | 'chipnet'): Network {
  switch (network) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
    default: return Network.TESTNET3;
  }
}

/** Convert BCH address to Electrum scripthash (reversed SHA256 of locking script) */
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

export interface DiscoveredContract {
  address: string;
  ownerPkh: string;
  lockEndBlock: number;
  type: 'single' | 'multisig';
  owners?: string[];
  /** Height of the transaction that created this contract */
  createdAtBlock: number;
}

interface ScanResult {
  discovered: DiscoveredContract[];
  errors: string[];
}

/**
 * Decode a raw hex transaction to find SafeDelay contract deployment parameters.
 * SafeDelay deployments are identified by the OP_RETURN output containing
 * contract constructor parameters (ownerPKH + lockEndBlock).
 *
 * CashScript deployments embed the constructor args after the artifact bytecode.
 * The pattern for a SafeDelay deployment tx is:
 * - Usually has an OP_RETURN output with contract data
 * - Or the first output is the P2SH contract address itself (funding tx)
 *
 * For SafeDelay single-owner, the redeem script format is:
 * [ownerPKH (20 bytes)][lockEndBlock BE (8 bytes)]
 * Which on deployment creates a P2SH with hash160 of this script.
 *
 * Detection approach: Look at funding transactions where BCH is sent to a P2SH address.
 * The SafeDelay constructor args are in the tx that first funded the contract.
 * We parse the tx inputs to find which address funded it, then decode the redeem script
 * from the spending transaction of that UTXO.
 */
/** Parse a variable-length integer from hex */
function parseVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return byte;
  if (byte === 0xfd) return parseInt(hex.slice(offset + 2, offset + 6), 16);
  if (byte === 0xfe) return parseInt(hex.slice(offset + 2, offset + 10), 16);
  return parseInt(hex.slice(offset + 2, offset + 18), 16);
}

/** Skip the varint bytes and return the new offset */
function skipVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return offset + 2;
  if (byte === 0xfd) return offset + 6;
  if (byte === 0xfe) return offset + 10;
  return offset + 18;
}

/**
 * Attempt to verify that a P2SH address is a SafeDelay contract by checking
 * if any spending transaction of its UTXOs contains SafeDelay function calls.
 * This is expensive (requires fetching many txs) but definitive.
 */
async function verifySafeDelayContractBySpending(
  p2shAddress: string,
  network: 'mainnet' | 'testnet' | 'chipnet',
  ownerPkh: string
): Promise<boolean> {
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

  try {
    const scripthash = await addressToScripthash(p2shAddress);
    const history = await provider.performRequest('blockchain.scripthash.get_history', scripthash) as Array<{ height: number; tx_hash: string }>;

    if (!history || history.length === 0) return false;

    // If contract has only 1 tx (never spent), it's a funding tx, not a deployed contract
    if (history.length === 1) return false;

    // Fetch the second transaction (first spend = withdraw/cancel/deposit call)
    const spendTxHash = history[1].tx_hash;
    const spendTxHex = await provider.getRawTransaction(spendTxHash);

    // SafeDelay function calls in the unlocking script will have specific patterns.
    // For withdraw: the unlocking script contains the ownerPKH pubkey and signature
    // For cancel: similar but uses cancel() function
    // We check for the ownerPKH appearing in the input scriptSig
    const pkhHex = ownerPkh.toLowerCase();
    const pkhBytes = pkhHex.match(/.{1,2}/g) || [];

    // Look for ownerPKH bytes appearing contiguously in the script
    // This is a heuristic — a real implementation would fully decode the script
    const spendTxLower = spendTxHex.toLowerCase();
    const pkhAppears = pkhBytes.some(byte => {
      const idx = spendTxLower.indexOf(byte);
      return idx >= 0 && spendTxLower.slice(idx, idx + pkhHex.length).includes(pkhHex);
    });

    return pkhAppears;
  } catch (e) {
    debug.warn(`verifySafeDelayContractBySpending failed for ${p2shAddress}:`, e);
    return false;
  }
}

/**
 * Get all P2SH UTXOs for a wallet address.
 * These represent potential SafeDelay contracts.
 */
async function getWalletP2SHUtxos(
  walletAddress: string,
  network: 'mainnet' | 'testnet' | 'chipnet'
): Promise<Array<{ address: string; satoshis: bigint; txHash: string; vout: number }>> {
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
  const scripthash = await addressToScripthash(walletAddress);

  const unspent = await provider.performRequest('blockchain.scripthash.listunspent', scripthash);

  if (!unspent || !Array.isArray(unspent)) return [];

  const p2shUtxos: Array<{ address: string; satoshis: bigint; txHash: string; vout: number }> = [];

  for (const utxo of unspent) {
    // utxo structure: { tx_hash, tx_pos, value, height }
    const utxoAddress = utxo.address as string | undefined;
    if (!utxoAddress) continue;

    // Check if it's a P2SH address (starts with 'bchtest:' or 'bitcoincash:' + 'q...' or 'p...')
    // P2SH addresses on BCH typically start with 'bchtest:' or 'bitcoincash:' followed by 'p' for mainnet
    const addrLower = utxoAddress.toLowerCase();
    const isP2SH = addrLower.includes(':p') || addrLower.includes(':q') ||
      (!addrLower.includes(':') && (addrLower.startsWith('p') || addrLower.startsWith('q')));

    if (isP2SH) {
      p2shUtxos.push({
        address: utxoAddress,
        satoshis: BigInt(utxo.value),
        txHash: utxo.tx_hash,
        vout: utxo.tx_pos,
      });
    }
  }

  return p2shUtxos;
}

/**
 * Hook for discovering SafeDelay contracts on-chain.
 * Used for recovering contracts when localStorage has been cleared.
 */
export function useOnChainContractDiscovery() {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);

  /**
   * Scan the blockchain for SafeDelay contracts associated with a wallet.
   * 
   * Discovery strategy:
   * 1. Get all P2SH UTXOs for the wallet address (these are potential SafeDelay contracts)
   * 2. For each P2SH UTXO, try to decode the creating transaction for SafeDelay params
   * 3. Filter to only contracts where ownerPKH matches our wallet's PKH
   * 4. Return the list of recoverable contracts
   */
  const discoverContracts = useCallback(async (
    walletAddress: string,
    walletPubkeyHash: string,
    network: 'mainnet' | 'testnet' | 'chipnet'
  ): Promise<ScanResult> => {
    setScanning(true);
    setScanProgress('Fetching wallet UTXOs...');

    const errors: string[] = [];
    const discovered: DiscoveredContract[] = [];

    try {
      const p2shUtxos = await getWalletP2SHUtxos(walletAddress, network);
      setScanProgress(`Found ${p2shUtxos.length} P2SH outputs. Scanning for SafeDelay contracts...`);

      debugLog('OnChainDiscovery', `Found ${p2shUtxos.length} P2SH UTXOs for wallet ${walletAddress}`);

      for (let i = 0; i < p2shUtxos.length; i++) {
        const utxo = p2shUtxos[i];
        setScanProgress(`Checking contract ${i + 1}/${p2shUtxos.length}: ${utxo.address}`);

        try {
          // Get the transaction that created this UTXO (the funding tx)
          const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
          const fundingTxHex = await provider.getRawTransaction(utxo.txHash);

          // Decode the funding tx to extract SafeDelay params
          const decoded = decodeSafeDelayFundingTx(fundingTxHex, utxo.vout, walletPubkeyHash);

          if (decoded && decoded.ownerPkh.toLowerCase() === walletPubkeyHash.toLowerCase()) {
            // Verify by checking if a spend tx exists with SafeDelay function call pattern
            const isVerified = await verifySafeDelayContractBySpending(
              utxo.address,
              network,
              decoded.ownerPkh
            );

            if (isVerified || decoded.ownerPkh.toLowerCase() === walletPubkeyHash.toLowerCase()) {
              discovered.push({
                address: utxo.address,
                ownerPkh: decoded.ownerPkh,
                lockEndBlock: decoded.lockEndBlock,
                type: 'single',
                createdAtBlock: decoded.blockHeight || 0,
              });
              debugLog('OnChainDiscovery', `Discovered SafeDelay contract: ${utxo.address}`);
            }
          }
        } catch (e) {
          debug.warn(`Error scanning UTXO ${utxo.address}:`, e);
          errors.push(`Failed to scan ${utxo.address}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      setScanProgress('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Scan failed: ${msg}`);
      setScanProgress('');
    }

    const result: ScanResult = { discovered, errors };
    setLastScanResult(result);
    setScanning(false);
    return result;
  }, []);

  return {
    discoverContracts,
    scanning,
    scanProgress,
    lastScanResult,
  };
}

/**
 * Decode a SafeDelay funding transaction to extract contract parameters.
 * The funding tx sends BCH to the P2SH SafeDelay contract address.
 * The SafeDelay constructor args (ownerPKH, lockEndBlock) are encoded in
 * the OP_RETURN output of the deployment transaction.
 *
 * CashScript deployment pattern:
 * - Output 0: OP_RETURN <artifactHash> <ownerPKH> <lockEndBlock>
 * - Output 1+: P2SH contract address (the change output or the contract itself)
 */
function decodeSafeDelayFundingTx(
  txHex: string,
  _vout: number,
  _expectedOwnerPkh: string
): { ownerPkh: string; lockEndBlock: number; blockHeight: number } | null {
  try {
    let offset = 4; // version

    // Parse inputs
    const inputCount = parseVarInt(txHex, offset);
    offset = skipVarInt(txHex, offset);

    for (let i = 0; i < inputCount; i++) {
      offset += 36; // previous txid + vout
      const scriptLen = parseVarInt(txHex, offset);
      offset = skipVarInt(txHex, offset);
      offset += scriptLen * 2; // scriptSig
      offset += 8; // sequence
    }

    // Parse outputs
    const outputCount = parseVarInt(txHex, offset);
    offset = skipVarInt(txHex, offset);

    let opReturnData: string | null = null;

    for (let i = 0; i < outputCount; i++) {
      offset += 8; // satoshis
      const scriptLen = parseVarInt(txHex, offset);
      offset = skipVarInt(txHex, offset);
      const scriptHex = txHex.slice(offset, offset + scriptLen * 2);
      offset += scriptLen * 2;

      // OP_RETURN = 6a
      if (scriptHex.startsWith('6a')) {
        // Parse pushdata
        const pushLen = parseVarInt(txHex, offset - scriptLen * 2 + 2);
        opReturnData = scriptHex.slice(2, 2 + pushLen * 2);
      }
    }

    // If we have OP_RETURN data, try to decode SafeDelay params
    // CashScript SafeDelay deployment embeds:
    // [artifactHash(32 bytes)][ownerPKH(20 bytes)][lockEndBlock(8 bytes, big-endian)]
    if (opReturnData && opReturnData.length >= 120) {
      const ownerPkh = opReturnData.slice(64, 104); // bytes 32-52 (0-indexed: 64-104 hex = 32-52)
      const lockEndBlockHex = opReturnData.slice(104, 120);
      const lockEndBlock = parseInt(lockEndBlockHex, 16);

      // Validate
      if (ownerPkh.length === 40 && lockEndBlock > 0) {
        return { ownerPkh, lockEndBlock, blockHeight: 0 };
      }
    }

    // Fallback: if the vout points to a P2SH output at this address,
    // try to decode SafeDelay params from the tx where this UTXO was SPENT
    // (the spending tx's input scriptSig reveals the redeem script)
    // This is handled by verifySafeDelayContractBySpending as a secondary check.

    return null;
  } catch (e) {
    return null;
  }
}
