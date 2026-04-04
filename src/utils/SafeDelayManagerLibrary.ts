/**
 * SafeDelayManagerLibrary.ts (Browser-compatible)
 *
 * Helper functions for SafeDelayManager registry contracts.
 * Browser-safe: no fs/path imports.
 */

import * as libauth from '@bitauth/libauth';
import type { SafeDelayManagerEntry, SafeDelayManagerUtxo } from '../types/index.js';

// Network prefixes
export type Network = 'mainnet' | 'chipnet' | 'testnet';
const NETWORK_PREFIXES: Record<Network, 'bitcoincash' | 'bchtest' | 'bchreg'> = {
  mainnet: 'bitcoincash',
  chipnet: 'bchtest',
  testnet: 'bchtest',
};

// ─── SafeDelay Bytecode ───────────────────────────────────────────────────────
// SafeDelay contract bytecode (hex) - used for child address computation.
// This is the compiled SafeDelay contract's base bytecode (without constructor args).
// Loaded once at module level for browser compatibility.
let _safeDelayBytecode: string | null = null;

/**
 * Set the SafeDelay bytecode (hex) for address computation.
 * Call this once at app startup with the bytecode from the artifact.
 */
export function setSafeDelayBytecode(bytecodeHex: string) {
  _safeDelayBytecode = bytecodeHex;
}

/**
 * Compute a SafeDelay address from ownerPKH and lockEndBlock.
 *
 * SafeDelay address = hash256(ownerPKH_le || lockEndBlock_le || SafeDelayBytecode)
 */
export function computeSafeDelayAddress(
  ownerPkh: string,
  lockEndBlock: number,
  network: Network = 'chipnet'
): string {
  if (!_safeDelayBytecode) {
    throw new Error('SafeDelay bytecode not set. Call setSafeDelayBytecode() first.');
  }

  const bytecodeHex = _safeDelayBytecode;

  // Encode ownerPKH (20 bytes little-endian)
  const ownerPkhBytes = Uint8Array.from(
    Buffer.from(ownerPkh.replace(/^0x/, '').padStart(40, '0'), 'hex')
  );

  // Encode lockEndBlock as CashScript VM number (little-endian)
  const lockEndBlockVmNumber = libauth.bigIntToVmNumber(BigInt(lockEndBlock));

  // Build redeem script: ownerPKH_le + lockEndBlock_le + SafeDelayBytecode
  const redeemScript = new Uint8Array([
    ...[...ownerPkhBytes].reverse(),              // ownerPKH little-endian
    ...[...lockEndBlockVmNumber].reverse(),       // lockEndBlock little-endian
    ...Buffer.from(bytecodeHex, 'hex')             // SafeDelay bytecode
  ]);

  // Compute hash256
  const hash = libauth.hash256(redeemScript);

  // Build P2SH32 address
  const lockingBytecode = libauth.encodeLockingBytecodeP2sh32(hash);
  const result = libauth.lockingBytecodeToCashAddress({
    prefix: NETWORK_PREFIXES[network],
    bytecode: lockingBytecode,
  });

  return typeof result === 'string' ? result : result.address;
}

/**
 * Parse a SafeDelayManager NFT UTXO's commitment to extract registered delays.
 *
 * Commitment format: [entry1_pkh(20)][entry1_lockEndBlock(8)][entry2_pkh(20)][entry2_lockEndBlock(8)]...
 */
export function parseManagerCommitment(commitment: Uint8Array): SafeDelayManagerEntry[] {
  const entries: SafeDelayManagerEntry[] = [];
  const commitmentHex = Buffer.from(commitment).toString('hex');
  const ENTRY_SIZE = 28; // 20 + 8 bytes
  let offset = 0;

  while (offset + ENTRY_SIZE <= commitment.length) {
    const pkhHex = commitmentHex.slice(offset * 2, (offset + 20) * 2);
    const lockEndBlockBytes = commitment.slice(offset + 20, offset + 28);
    let lockEndBlock = 0;
    for (let i = 0; i < 8; i++) {
      lockEndBlock = lockEndBlock * 256 + lockEndBlockBytes[i];
    }

    entries.push({ ownerPkh: pkhHex, lockEndBlock });
    offset += ENTRY_SIZE;
  }

  return entries;
}

/**
 * Encode lockEndBlock as 8 bytes big-endian (for createDelay function)
 */
export function encodeLockEndBlockBytes(lockEndBlock: number): Uint8Array {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(lockEndBlock), 0);
  return buf;
}

/**
 * Convert a BCH address to PKH
 */
export function addressToPkh(address: string): string {
  const result = libauth.cashAddressToLockingBytecode(address);
  if (typeof result === 'string') {
    throw new Error(`Invalid address: ${result}`);
  }
  const bytecodeArr = Array.from(result.bytecode);
  if (bytecodeArr[1] === 0xa9 && bytecodeArr[0] === 0x76 && bytecodeArr[22] === 0x88) {
    const pkh = bytecodeArr.slice(3, 23);
    return (pkh as number[]).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  if (bytecodeArr[0] === 0xa9 && bytecodeArr[22] === 0x87) {
    const hash = bytecodeArr.slice(2, 22);
    return (hash as number[]).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error(`Could not decode address: ${address}`);
}

/**
 * Scan the blockchain for all SafeDelayManager UTXOs
 */
export async function getManagerUtxos(
  managerAddress: string,
  electrumUrl: string
): Promise<SafeDelayManagerUtxo[]> {
  const resp = await fetch(electrumUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'get_address_utxos',
      params: [managerAddress, 0, 100],
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);

  const utxos: SafeDelayManagerUtxo[] = [];
  for (const utxo of data.result) {
    if (utxo.tokenCategory && utxo.tokenCategory !== '0x') {
      const commitmentBytes = Buffer.from(utxo.nftCommitment || '', 'hex');
      const entries = parseManagerCommitment(commitmentBytes);

      utxos.push({
        ...utxo,
        tokenCategory: utxo.tokenCategory,
        amount: BigInt(utxo.value),
        managerData: {
          serviceProviderPkh: '',
          delayCount: entries.length,
          delays: entries,
        },
      } as SafeDelayManagerUtxo);
    }
  }

  return utxos;
}

/**
 * Get all SafeDelay entries across all manager UTXOs
 */
export async function getAllManagerDelays(
  managerAddress: string,
  electrumUrl: string,
  network: Network = 'chipnet'
): Promise<SafeDelayManagerEntry[]> {
  const utxos = await getManagerUtxos(managerAddress, electrumUrl);
  const allEntries: SafeDelayManagerEntry[] = [];

  for (const utxo of utxos) {
    for (const entry of utxo.managerData.delays) {
      const address = computeSafeDelayAddress(entry.ownerPkh, entry.lockEndBlock, network);
      allEntries.push({
        ownerPkh: entry.ownerPkh,
        lockEndBlock: entry.lockEndBlock,
        address,
      });
    }
  }

  return allEntries;
}
