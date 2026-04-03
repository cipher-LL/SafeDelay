/**
 * SafeDelayManagerLibrary.ts
 *
 * Helper functions for working with SafeDelayManager contracts.
 * Provides address computation, UTXO parsing, and registry management.
 */

import * as libauth from '@bitauth/libauth';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CreateDelayParams, SafeDelayManagerEntry, SafeDelayManagerUtxo } from '../types/index.js';
import type { Utxo } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARTIFACTS_DIR = join(__dirname, '..', '..', 'dist');

// Network prefixes
export type Network = 'mainnet' | 'chipnet' | 'testnet';
const NETWORK_PREFIXES: Record<Network, 'bitcoincash' | 'bchtest' | 'bchreg'> = {
  mainnet: 'bitcoincash',
  chipnet: 'bchtest',
  testnet: 'bchtest',
};

/**
 * Load SafeDelayManager artifact
 */
export function loadManagerArtifact(artifactsDir: string = DEFAULT_ARTIFACTS_DIR) {
  const path = join(artifactsDir, 'SafeDelayManager.artifact.json');
  if (!existsSync(path)) {
    throw new Error(`SafeDelayManager artifact not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Load SafeDelay bytecode artifact (for child address computation)
 */
export function loadSafeDelayArtifact(artifactsDir: string = DEFAULT_ARTIFACTS_DIR) {
  const path = join(artifactsDir, 'SafeDelay.artifact.json');
  if (!existsSync(path)) {
    throw new Error(`SafeDelay artifact not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Compute a SafeDelay address from ownerPKH and lockEndBlock
 *
 * This matches the deploy-contract.mjs address computation.
 */
export function computeSafeDelayAddress(
  ownerPkh: string,
  lockEndBlock: number,
  network: Network = 'chipnet',
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR
): string {
  const safeDelayArtifact = loadSafeDelayArtifact(artifactsDir);
  const bytecodeHex = safeDelayArtifact.debug?.bytecode;
  if (!bytecodeHex) {
    throw new Error('No SafeDelay bytecode found in artifact');
  }

  // Encode ownerPKH (20 bytes little-endian)
  const ownerPkhBytes = Uint8Array.from(
    Buffer.from(ownerPkh.replace(/^0x/, '').padStart(40, '0'), 'hex')
  );

  // Encode lockEndBlock using libauth's VM number encoding
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
 * Compute SafeDelayManager contract address from serviceProviderPkh
 */
export function computeManagerAddress(
  serviceProviderPkh: string,
  network: Network = 'chipnet',
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR
): string {
  const artifact = loadManagerArtifact(artifactsDir);
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) {
    throw new Error('No SafeDelayManager bytecode found in artifact');
  }

  // Encode serviceProviderPkh (20 bytes little-endian)
  const spPkhBytes = Uint8Array.from(
    Buffer.from(serviceProviderPkh.replace(/^0x/, '').padStart(40, '0'), 'hex')
  );

  // Build redeem script: spPkh_le + ManagerBytecode
  const redeemScript = new Uint8Array([
    ...[...spPkhBytes].reverse(),                 // spPkh little-endian
    ...Buffer.from(bytecodeHex, 'hex')             // Manager bytecode
  ]);

  const hash = libauth.hash256(redeemScript);
  const lockingBytecode = libauth.encodeLockingBytecodeP2sh32(hash);
  const result = libauth.lockingBytecodeToCashAddress({
    prefix: NETWORK_PREFIXES[network],
    bytecode: lockingBytecode,
  });

  return typeof result === 'string' ? result : result.address;
}

/**
 * Parse a SafeDelayManager NFT UTXO's commitment to extract registered delays
 *
 * Commitment format: [entry1_pkh(20)][entry1_lockEndBlock(8)][entry2_pkh(20)][entry2_lockEndBlock(8)]...
 */
export function parseManagerCommitment(commitment: Uint8Array): SafeDelayManagerEntry[] {
  const entries: SafeDelayManagerEntry[] = [];
  const commitmentHex = Buffer.from(commitment).toString('hex');

  // Commitment is just sequential entries
  // Each entry: 20 bytes ownerPkh + 8 bytes lockEndBlock (big-endian)
  const ENTRY_SIZE = 28; // 20 + 8 bytes
  let offset = 0;

  while (offset + ENTRY_SIZE <= commitment.length) {
    // Extract ownerPkh (20 bytes) as hex
    const pkhHex = commitmentHex.slice(offset * 2, (offset + 20) * 2);
    // Extract lockEndBlock (8 bytes big-endian)
    const lockEndBlockBytes = commitment.slice(offset + 20, offset + 28);
    let lockEndBlock = 0;
    for (let i = 0; i < 8; i++) {
      lockEndBlock = lockEndBlock * 256 + lockEndBlockBytes[i];
    }

    entries.push({
      ownerPkh: pkhHex,
      lockEndBlock,
    });

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
 * Convert a BCH address to PKH (for serviceProviderPkh in manager)
 */
export function addressToPkh(address: string): string {
  const result = libauth.cashAddressToLockingBytecode(address);
  if (typeof result === 'string') {
    throw new Error(`Invalid address: ${result}`);
  }
  // P2PKH locking bytecode: 0x76 0xa9 0x14 <20 bytes pkh> 0x88 0xac
  // PKH is at bytes 3-22 (after OP_DUP, OP_HASH160, PUSH_20)
  const pkh = result.bytecode.slice(3, 23);
  return Buffer.from(pkh).toString('hex');
}

/**
 * Register a new SafeDelay in the manager
 *
 * This is a helper that builds the transaction data for calling createDelay.
 * The actual transaction must be signed and broadcast via an Electrum RPC.
 *
 * @param _params - createDelay parameters
 * @param _managerUtxo - The current manager UTXO
 * @param _feeUtxo - A BCH UTXO to pay the fee
 * @param _network - Network (chipnet/mainnet)
 * @returns Transaction hex and details
 */
export async function buildCreateDelayTx(
  _params: CreateDelayParams,
  _managerUtxo: SafeDelayManagerUtxo,
  _feeUtxo: Utxo,
  _network: Network = 'chipnet'
): Promise<{
  txHex: string;
  managerInputIndex: number;
  feeInputIndex: number;
}> {
  // This would use cashscript's TransactionBuilder
  // For now, return structure - actual implementation would use Contract class
  throw new Error('buildCreateDelayTx not yet implemented - use CashScript Contract class directly');
}

/**
 * Scan the blockchain for all SafeDelayManager UTXOs
 *
 * @param managerAddress - The manager contract address
 * @param electrumUrl - Electrum RPC URL
 * @returns Array of manager UTXOs with parsed registry data
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
      // This is an NFT - SafeDelayManager UTXO
      const commitmentBytes = Buffer.from(utxo.nftCommitment || '', 'hex');
      const entries = parseManagerCommitment(commitmentBytes);

      utxos.push({
        ...utxo,
        tokenCategory: utxo.tokenCategory,
        amount: BigInt(utxo.value),
        managerData: {
          serviceProviderPkh: '', // From contract, not UTXO
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
 *
 * @param managerAddress - The manager contract address
 * @param electrumUrl - Electrum RPC URL
 * @param network - Network for address computation
 * @returns All registered SafeDelays with computed addresses
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
      // Compute the SafeDelay address for this entry
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
