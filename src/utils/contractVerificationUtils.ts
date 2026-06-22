/**
 * Pure utility functions for SafeDelay contract verification.
 * These have no React dependencies and are extracted from useAutoContractVerification.
 */

import { Network } from 'cashscript';
import { sha256 } from '@cashscript/utils';
import { binToHex } from '@bitauth/libauth';
import { NETWORK_ERROR_PATTERNS } from '../types/contractVerification';

/**
 * Check if an error is a transient network error from the Electrum provider.
 */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const msg = String(e).toLowerCase();
  return NETWORK_ERROR_PATTERNS.some(p => msg.includes(p));
}

/**
 * Map app-level network names to cashscript Network enum values.
 */
export function toCashScriptNetwork(network: 'mainnet' | 'testnet' | 'chipnet'): Network {
  switch (network) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
    default: return Network.TESTNET3;
  }
}

/**
 * Convert a BCH address to its script hash (reversed sha256 of the locking bytecode).
 * Used for Electrum scripthash queries.
 */
export async function addressToScripthash(address: string): Promise<string> {
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
export async function isP2SHAddress(address: string): Promise<boolean> {
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

/**
 * Decode a SafeDelay funding transaction to extract contract parameters.
 * SafeDelay deployments embed constructor args in the OP_RETURN output:
 * [artifactHash(32 bytes)][ownerPKH(20 bytes)][lockEndBlock(8 bytes, big-endian)]
 */
export function decodeSafeDelayFundingTx(
  txHex: string,
): { ownerPkh: string; lockEndBlock: number } | null {
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

/**
 * Parse a variable-length integer from a hex string at the given offset.
 */
export function parseVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return byte;
  if (byte === 0xfd) return parseInt(hex.slice(offset + 2, offset + 6), 16);
  if (byte === 0xfe) return parseInt(hex.slice(offset + 2, offset + 10), 16);
  return parseInt(hex.slice(offset + 2, offset + 18), 16);
}

/**
 * Skip past a variable-length integer in a hex string and return the new offset.
 */
export function skipVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return offset + 2;
  if (byte === 0xfd) return offset + 6;
  if (byte === 0xfe) return offset + 10;
  return offset + 18;
}
