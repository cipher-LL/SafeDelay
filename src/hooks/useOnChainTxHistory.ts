import { useCallback } from 'react';
import { ElectrumNetworkProvider } from 'cashscript';
import { addressToScripthash, parseVarInt, skipVarInt, toCashScriptNetwork, addressToLockScriptHex } from '../utils/safeDelayUtils';

export interface OnChainTx {
  txHash: string;
  blockHeight: number;
  /** 'deposit' | 'withdraw' | 'cancel' | 'send' | 'receive' | 'unknown' */
  type: 'deposit' | 'withdraw' | 'cancel' | 'send' | 'receive' | 'unknown';
  /** Amount in BCH (estimated for some types) */
  amount: number;
  timestamp: number;
  /** Whether this transaction was already in localStorage */
  isLocalOnly: boolean;
}

/**
 * Estimate timestamp from block height.
 * BCH block time is ~10 minutes on average.
 */
function estimateTimestamp(blockHeight: number, currentBlock: number, currentTime: number): number {
  const blocksDiff = Math.max(0, currentBlock - blockHeight);
  const secondsDiff = blocksDiff * 10 * 60;
  return currentTime - secondsDiff;
}

/**
 * Fetch on-chain transaction history for a contract address.
 * Returns transactions parsed from raw hex, with type classification.
 *
 * Classification logic for SafeDelay:
 * - send/receive: standard BCH UTXO flow (no contract function call)
 * - deposit: BCH received by contract with no apparent contract function call
 * - withdraw: BCH sent FROM contract (contract UTXO spent)
 * - cancel: similar to withdraw, but typically smaller amounts (no actual fund movement
 *   difference in pure BCH terms - cancel just returns all funds)
 *
 * The key insight: if the contract appears as an INPUT (UTXO being spent),
 * funds are leaving → withdraw/cancel.
 * If contract appears as an OUTPUT (new UTXO created), funds are arriving → deposit.
 */
export function useOnChainTxHistory() {
  const fetchHistory = useCallback(async (
    address: string,
    network: 'mainnet' | 'testnet' | 'chipnet',
    knownTxHashes?: Set<string>
  ): Promise<OnChainTx[]> => {
    const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

    // Get current block height for timestamp estimation
    const currentBlock = await provider.getBlockHeight();
    const currentTime = Date.now();

    // Get scripthash for this address
    const scripthash = await addressToScripthash(address);

    // Fetch transaction history from Electrum
    // Returns list of { height, tx_hash, fee? } for this scripthash
    const historyResult = await provider.performRequest(
      'blockchain.scripthash.get_history',
      scripthash
    );

    if (!historyResult || !Array.isArray(historyResult)) {
      return [];
    }

    const history = historyResult as Array<{ height: number; tx_hash: string; fee?: number }>;

    const txs: OnChainTx[] = [];

    for (const entry of history) {
      const txHash = entry.tx_hash;

      // Skip already-known local transactions
      if (knownTxHashes && knownTxHashes.has(txHash)) {
        continue;
      }

      let type: OnChainTx['type'] = 'unknown';
      let amount = 0;

      try {
        // Fetch the raw transaction hex
        const txHex = await provider.getRawTransaction(txHash);

        // Parse to determine transaction type and amount
        const parsed = parseTxType(txHex, address);
        type = parsed.type;
        amount = parsed.amount;
      } catch {
        // If we can't fetch/parse, mark as unknown
        type = 'unknown';
      }

      txs.push({
        txHash,
        blockHeight: entry.height,
        type,
        amount,
        timestamp: estimateTimestamp(entry.height, currentBlock, currentTime),
        isLocalOnly: false,
      });
    }

    // Sort by block height descending (most recent first)
    txs.sort((a, b) => b.blockHeight - a.blockHeight);

    return txs;
  }, []);

  return { fetchHistory };
}

/**
 * Parse a transaction to determine its SafeDelay type and amount.
 */
function parseTxType(txHex: string, contractAddress: string): { type: OnChainTx['type']; amount: number } {
  // Compute the expected P2PKH locking script for the contract address
  const contractLockScript = addressToLockScriptHex(contractAddress);
  try {
    // Basic tx structure: version(4) + inputs + outputs + locktime(4)
    let offset = 4; // version

    // --- Parse inputs ---
    const inputCount = parseVarInt(txHex, offset);
    offset = skipVarInt(txHex, offset);

    // Collect input data
    for (let i = 0; i < inputCount; i++) {
      offset += 36; // previous txid (32) + vout (4)
      const scriptLen = parseVarInt(txHex, offset);
      offset = skipVarInt(txHex, offset);
      offset += scriptLen;
      offset += 4; // sequence
    }

    // --- Parse outputs ---
    const outputCount = parseVarInt(txHex, offset);
    offset = skipVarInt(txHex, offset);

    let totalOut = BigInt(0);
    const outputs: Array<{ satoshis: bigint; scriptHex: string }> = [];

    for (let i = 0; i < outputCount; i++) {
      // Read satoshis (little-endian 8 bytes)
      const satoshisHex = txHex.slice(offset, offset + 16)
        .split('').reverse().join('')
        .padStart(16, '0');
      const satoshis = BigInt('0x' + satoshisHex);
      totalOut += satoshis;
      offset += 8;

      const scriptLen = parseVarInt(txHex, offset);
      offset = skipVarInt(txHex, offset);
      const scriptHex = txHex.slice(offset, offset + scriptLen * 2);
      outputs.push({ satoshis, scriptHex });
      offset += scriptLen;
    }

    // --- Determine type based on output patterns ---

    // SafeDelay contract functions are encoded in the contract's locking script.
    // When the contract UTXO is SPENT (contract as input), the UNLOCKING script
    // in this tx reveals which function was called.
    // But we don't have the locking script content here, so we use output patterns.

    // SafeDelay withdraw/cancel behavior:
    // - First output is the owner address (P2PKH: 76a914...88ac) or refund address
    // - The amount sent to owner is the withdraw/cancel amount
    // - If there's a 2nd output back to contract, it's unclaimed change
    // - If no 2nd output, full balance was withdrawn

    // SafeDelay deposit behavior:
    // - Output is directly to the contract P2PKH address
    // - No special function call needed - just sending BCH
    // - Total output value = deposit amount

    // Detection approach:
    // 1. If only 1 output and it's not to the contract address → withdraw/cancel
    //    (funds going TO owner, not staying in contract)
    // 2. If 2+ outputs with significant value to contract address → deposit
    // 3. Use script patterns to distinguish withdraw vs cancel

    // Check if any output goes to the contract (deposit)
    const contractOutputs = outputs.filter(o =>
      o.scriptHex.length === contractLockScript.length &&
      o.scriptHex === contractLockScript
    );

    const contractOutAmount = contractOutputs.reduce((sum, o) => sum + o.satoshis, BigInt(0));

    // Check if this looks like a contract function call
    // Contract function calls (withdraw/cancel) typically:
    // - Spend the contract UTXO (we can't easily detect this without prev tx)
    // - Send most/all funds to a non-contract P2PKH address (the owner)

    // First output to non-contract address with significant value
    const firstOut = outputs[0];

    if (outputs.length === 1 && firstOut && firstOut.satoshis > BigInt(546)) {
      // Single significant output - could be withdraw/cancel sending all to owner
      // OR a simple deposit to a different address (not our contract)
      // Without more context, we classify based on whether it looks like the owner address

      // Check if output looks like owner address pattern (P2PKH to known prefix)
      // Owner address would be a P2PKH output (76a914...88ac)
      if (firstOut.scriptHex.startsWith('76a914') && firstOut.scriptHex.endsWith('88ac') && firstOut.scriptHex !== contractLockScript) {
        // Owner address outputs are withdraw/cancel (funds leaving contract)
        return {
          type: 'withdraw',
          amount: Number(firstOut.satoshis) / 100000000,
        };
      }
    }

    if (outputs.length >= 2) {
      // Multi-output tx: likely a withdraw/cancel with change back to contract
      // OR a deposit followed by other txs
      // If first output is to owner (non-contract) and there's a contract output:
      const firstIsOwner = firstOut.scriptHex.startsWith('76a914') && firstOut.scriptHex.endsWith('88ac');

      if (firstIsOwner && contractOutAmount > BigInt(0)) {
        // First output to owner + remaining to contract = withdraw with change
        return {
          type: 'withdraw',
          amount: Number(firstOut.satoshis) / 100000000,
        };
      }
    }

    // If we see outputs going to contract address, it's a deposit
    if (contractOutAmount > BigInt(546)) {
      return {
        type: 'deposit',
        amount: Number(contractOutAmount) / 100000000,
      };
    }

    return { type: 'unknown', amount: Number(totalOut) / 100000000 };
  } catch {
    return { type: 'unknown', amount: 0 };
  }
}
