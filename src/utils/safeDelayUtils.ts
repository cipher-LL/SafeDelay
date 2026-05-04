/**
 * Shared utilities for SafeDelay frontend
 */

import { Network } from 'cashscript';
import { sha256 } from '@cashscript/utils';
import { binToHex } from '@bitauth/libauth';

/**
 * Convert our network string to CashScript Network enum
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
 * Get the hex encoding of a P2PKH locking script for an address.
 */
export function addressToLockScriptHex(address: string): string {
  const addr = address.replace(/^(bitcoincash:|bchtest:|bchreg:)/, '');
  try {
    const decoded = base58Decode(addr);
    if (decoded.length < 25) return '';
    const pubKeyHashHex = binToHex(decoded.slice(1, -4));
    return `76a914${pubKeyHashHex}88ac`;
  } catch {
    return '';
  }
}

/**
 * Decode a base58check address to raw bytes.
 */
export function base58Decode(address: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const Base58Map: { [key: string]: number } = {};
  for (let i = 0; i < ALPHABET.length; i++) {
    Base58Map[ALPHABET[i]] = i;
  }

  let leadingZeros = 0;
  for (let i = 0; i < address.length && address[i] === '1'; i++) {
    leadingZeros++;
  }

  const result: number[] = [];
  for (let i = leadingZeros; i < address.length; i++) {
    let carry = Base58Map[address[i]];
    if (carry === undefined) throw new Error(`Invalid base58 character: ${address[i]}`);

    for (let j = 0; j < result.length; j++) {
      carry += result[j] * 58;
      result[j] = carry & 0xff;
      carry = Math.floor(carry / 256);
    }
    while (carry > 0) {
      result.push(carry & 0xff);
      carry = Math.floor(carry / 256);
    }
  }

  const resultBytes = new Uint8Array(leadingZeros + result.length);
  for (let i = 0; i < result.length; i++) {
    resultBytes[leadingZeros + i] = result[i];
  }
  return resultBytes;
}

/**
 * Convert a BCH address to an Electrum-compatible scripthash (hex, reversed SHA256 of locking script)
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
 * Parse a VarInt from a hex string at the given offset.
 * Returns the parsed value and advances the offset.
 */
export function parseVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return byte;
  if (byte === 0xfd) return parseInt(hex.slice(offset + 2, offset + 6), 16);
  if (byte === 0xfe) return parseInt(hex.slice(offset + 2, offset + 10), 16);
  return parseInt(hex.slice(offset + 2, offset + 18), 16);
}

/**
 * Skip past a VarInt in a hex string, returning the new offset.
 */
export function skipVarInt(hex: string, offset: number): number {
  const byte = parseInt(hex.slice(offset, offset + 2), 16);
  if (byte < 0xfd) return offset + 2;
  if (byte === 0xfd) return offset + 6;
  if (byte === 0xfe) return offset + 10;
  return offset + 18;
}
