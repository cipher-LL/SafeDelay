/**
 * SafeDelay Contract TypeScript Wrapper
 * @ts-nocheck
 *
 * Type-safe interface for SafeDelay time-locked wallet contracts.
 * Provides autocomplete-friendly API for deposit, withdraw, cancel, and extend operations.
 *
 * Contract: SafeDelay
 * Purpose: Time-locked wallet where funds can only be withdrawn after lockEndBlock
 *
 * Security model:
 * - Single owner identified by ownerPKH (hash160 of owner's public key)
 * - No other withdrawal possible — only owner can access funds after lock expires
 * - Owner can cancel anytime to recover funds
 * - Lock can only be extended (one-way — cannot shorten lock period)
 *
 * Usage:
 *   import { getSafeDelay, deposit, withdraw, cancel, extend } from './safeDelayContract';
 *
 *   // Get contract instance at a deployed SafeDelay address
 *   const safeDelay = getSafeDelay(network, safeDelayAddress, ownerPKH, lockEndBlock);
 *
 *   // Deposit (anyone can deposit — extends lock but keeps existing lockEndBlock)
 *   await deposit(network, ownerPKH, lockEndBlock, safeDelayAddress, amountBCH);
 *
 *   // Withdraw after lock expires
 *   await withdraw(network, ownerPKH, lockEndBlock, safeDelayAddress, amountBCH);
 *
 *   // Cancel anytime (owner gets all funds back)
 *   await cancel(network, ownerPKH, lockEndBlock, safeDelayAddress);
 *
 *   // Extend lock period (one-way, cannot shorten)
 *   await extend(network, ownerPKH, lockEndBlock, newLockEndBlock, safeDelayAddress);
 */

import ElectrumNetworkProvider from 'cashscript/dist/network/ElectrumNetworkProvider.js';
import { Contract, Utxo } from 'cashscript';
import * as libauth from '@bitauth/libauth';

import safeDelayArtifact from '../artifacts/SafeDelay.artifact.json';
import { Network, hasWalletProvider, getWalletAddress, getWalletPubkey, parseBCH } from './wallet';

// =============================================================================
// Types
// =============================================================================

export interface ContractCallResult {
  txid?: string;
  error?: string;
}

export interface SafeDelayConfig {
  ownerPKH: string;     // hex string (40 chars, no 0x prefix)
  lockEndBlock: number; // block height when lock expires
}

type CashScriptNetwork = 'mainnet' | 'testnet3';

function toCashScriptNetwork(network: Network): CashScriptNetwork {
  return network === 'mainnet' ? 'mainnet' : 'testnet3';
}

function getProvider(network: Network): ElectrumNetworkProvider {
  return new ElectrumNetworkProvider(toCashScriptNetwork(network));
}

/**
 * Convert hex string to Uint8Array bytes20 for CashScript
 */
function hexToBytes20(hex: string): Uint8Array {
  const cleanHex = hex.replace(/^0x/, '').padStart(40, '0');
  return Uint8Array.from(Buffer.from(cleanHex, 'hex'));
}

/**
 * Parse a cash address to its pubkey hash (hash160)
 */
export function addressToPubkeyHash(address: string): Uint8Array {
  const result = libauth.cashAddressToLockingBytecode(address);
  if (typeof result === 'string') throw new Error('Invalid address: ' + result);
  const bytecode = result.bytecode;
  // P2PKH locking bytecode is 25 bytes: OP_DUP + OP_HASH160 + 20 bytes + OP_EQUALVERIFY + OP_CHECKSIG
  // The PKH is at bytecode[3..22] (bytes 3-22 inclusive, 20 bytes total)
  if (bytecode.length === 25) {
    return bytecode.slice(3, 23);
  }
  // Raw bytes20 case (for contracts)
  return bytecode.slice(0, 20);
}

/**
 * Get wallet UTXOs for a given address
 */
export async function getWalletUtxos(network: Network, address: string): Promise<Utxo[]> {
  const provider = getProvider(network);
  return provider.getUtxos(address);
}

/**
 * Get total wallet BCH balance from UTXOs
 */
export async function getWalletBalance(network: Network, address: string): Promise<bigint> {
  const utxos = await getWalletUtxos(network, address);
  return utxos.reduce((sum: bigint, u: Utxo) => sum + BigInt(u.satoshis), 0n);
}

// =============================================================================
// Contract Instantiation
// =============================================================================

/**
 * Get a SafeDelay contract instance at a deployed address.
 *
 * @param network - 'mainnet' or 'chipnet'
 * @param safeDelayAddress - The deployed SafeDelay contract address (P2SH32)
 * @param ownerPKH - Owner's public key hash as hex string (40 chars)
 * @param lockEndBlock - The block height when the lock expires
 */
export function getSafeDelayContract(
  network: Network,
  safeDelayAddress: string,
  ownerPKH: string,
  lockEndBlock: number
): Contract {
  const provider = getProvider(network);
  const ownerBytes = hexToBytes20(ownerPKH);

  const contract = new Contract(
    safeDelayArtifact as any,
    [ownerBytes, BigInt(lockEndBlock)],
    { provider }
  );

  // Override the contract address to use the deployed one
  (contract as any).address = safeDelayAddress;

  return contract;
}

// =============================================================================
// Deposit
// =============================================================================

/**
 * Deposit BCH into a SafeDelay time-locked wallet.
 *
 * Anyone can deposit — the funds are added to the contract balance.
 * The lockEndBlock is NOT reset — existing lock period is preserved.
 *
 * @param network - Network (mainnet/chipnet)
 * @param ownerPKH - Owner's PKH as hex string (for validation)
 * @param lockEndBlock - Current lock end block
 * @param safeDelayAddress - Deployed SafeDelay contract address
 * @param amountBCH - Amount to deposit in BCH string (e.g., "0.5")
 */
export async function deposit(
  network: Network,
  ownerPKH: string,
  lockEndBlock: number,
  safeDelayAddress: string,
  amountBCH: string
): Promise<ContractCallResult> {
  try {
    const amountSats = parseBCH(amountBCH);
    if (amountSats < 1000n) {
      return { error: 'Minimum deposit is 0.00001 BCH' };
    }

    const hasWallet = await hasWalletProvider();
    if (!hasWallet || !window.cashscript) {
      return { error: 'CashScript wallet provider not available. Please install CashScript browser extension.' };
    }

    const walletAddress = await getWalletAddress();
    if (!walletAddress) return { error: 'Wallet not connected' };

    const provider = getProvider(network);

    // Get wallet UTXOs for funding
    const walletUtxos = await provider.getUtxos(walletAddress);
    if (walletUtxos.length === 0) return { error: 'Wallet has no UTXOs' };

    // Get SafeDelay contract UTXOs (for covenant)
    const contractUtxos = await provider.getUtxos(safeDelayAddress);
    if (contractUtxos.length === 0) {
      return { error: 'SafeDelay contract not found or has no balance' };
    }

    // Instantiate the contract
    const safeDelay = getSafeDelayContract(network, safeDelayAddress, ownerPKH, lockEndBlock);

    // Build deposit transaction using CashScript extension API
    const depositTx = (safeDelay as any).unlock.deposit();

    const tx = depositTx
      .from([contractUtxos[0], walletUtxos[0]])
      .withAmount(amountSats);

    const txid = await (tx as any).send();
    return { txid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Deposit failed' };
  }
}

// =============================================================================
// Withdraw
// =============================================================================

/**
 * Withdraw BCH from SafeDelay after lock has expired.
 *
 * Only the owner can withdraw, and only after lockEndBlock has been reached.
 *
 * @param network - Network (mainnet/chipnet)
 * @param ownerPKH - Owner's PKH as hex string
 * @param lockEndBlock - Current lock end block (must be <= current block)
 * @param safeDelayAddress - Deployed SafeDelay contract address
 * @param withdrawAmountBCH - Amount to withdraw in BCH string
 */
export async function withdraw(
  network: Network,
  ownerPKH: string,
  lockEndBlock: number,
  safeDelayAddress: string,
  withdrawAmountBCH: string
): Promise<ContractCallResult> {
  try {
    const withdrawSats = parseBCH(withdrawAmountBCH);
    if (withdrawSats < 1000n) {
      return { error: 'Minimum withdrawal is 0.00001 BCH' };
    }

    const hasWallet = await hasWalletProvider();
    if (!hasWallet || !window.cashscript) {
      return { error: 'CashScript wallet provider not available' };
    }

    const walletAddress = await getWalletAddress();
    if (!walletAddress) return { error: 'Wallet not connected' };

    // Verify wallet matches owner
    const walletPkh = addressToPubkeyHash(walletAddress);
    const walletPkhHex = Array.from(walletPkh).map(b => b.toString(16).padStart(2, '0')).join('');
    const ownerHexClean = ownerPKH.toLowerCase().replace(/^0x/, '');
    if (walletPkhHex !== ownerHexClean) {
      return { error: 'Connected wallet is not the SafeDelay owner' };
    }

    const provider = getProvider(network);

    // Get contract UTXOs
    const contractUtxos = await provider.getUtxos(safeDelayAddress);
    if (contractUtxos.length === 0) {
      return { error: 'SafeDelay has no balance' };
    }

    // Get wallet UTXOs for fee
    const walletUtxos = await provider.getUtxos(walletAddress);
    if (walletUtxos.length === 0) return { error: 'Wallet has no UTXOs for fee' };

    // Get wallet pubkey for signing
    const pubkey = await getWalletPubkey();
    if (!pubkey) return { error: 'Could not get wallet public key' };

    const safeDelay = getSafeDelayContract(network, safeDelayAddress, ownerPKH, lockEndBlock);

    // Build withdraw transaction
    const withdrawTx = (safeDelay as any).unlock.withdraw(pubkey);

    const tx = withdrawTx
      .from([contractUtxos[0], walletUtxos[0]])
      .withHardcodedLockTime(lockEndBlock);

    const txid = await (tx as any).send();
    return { txid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Withdraw failed' };
  }
}

// =============================================================================
// Cancel
// =============================================================================

/**
 * Cancel the SafeDelay and recover all funds.
 *
 * Owner can cancel anytime — before or after lock expiration.
 * All funds are returned to the owner's P2PKH address.
 *
 * @param network - Network (mainnet/chipnet)
 * @param ownerPKH - Owner's PKH as hex string
 * @param lockEndBlock - Current lock end block
 * @param safeDelayAddress - Deployed SafeDelay contract address
 */
export async function cancel(
  network: Network,
  ownerPKH: string,
  lockEndBlock: number,
  safeDelayAddress: string
): Promise<ContractCallResult> {
  try {
    const hasWallet = await hasWalletProvider();
    if (!hasWallet || !window.cashscript) {
      return { error: 'CashScript wallet provider not available' };
    }

    const walletAddress = await getWalletAddress();
    if (!walletAddress) return { error: 'Wallet not connected' };

    // Verify wallet matches owner
    const walletPkh = addressToPubkeyHash(walletAddress);
    const walletPkhHex = Array.from(walletPkh).map(b => b.toString(16).padStart(2, '0')).join('');
    const ownerHexClean = ownerPKH.toLowerCase().replace(/^0x/, '');
    if (walletPkhHex !== ownerHexClean) {
      return { error: 'Connected wallet is not the SafeDelay owner' };
    }

    const provider = getProvider(network);

    // Get contract UTXOs
    const contractUtxos = await provider.getUtxos(safeDelayAddress);
    if (contractUtxos.length === 0) {
      return { error: 'SafeDelay has no balance' };
    }

    // Get wallet UTXOs for fee
    const walletUtxos = await provider.getUtxos(walletAddress);
    if (walletUtxos.length === 0) return { error: 'Wallet has no UTXOs for fee' };

    // Get wallet pubkey for signing
    const pubkey = await getWalletPubkey();
    if (!pubkey) return { error: 'Could not get wallet public key' };

    const safeDelay = getSafeDelayContract(network, safeDelayAddress, ownerPKH, lockEndBlock);

    // Build cancel transaction
    const cancelTx = (safeDelay as any).unlock.cancel(pubkey);

    const tx = cancelTx
      .from([contractUtxos[0], walletUtxos[0]]);

    const txid = await (tx as any).send();
    return { txid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Cancel failed' };
  }
}

// =============================================================================
// Extend
// =============================================================================

/**
 * Extend the lock period to a later block height.
 *
 * This is a ONE-WAY operation: newLockEndBlock MUST be > lockEndBlock.
 * The lock period can only be extended, never shortened.
 *
 * Note: This function withdraws ALL funds. Owner must redeposit into
 * a new SafeDelay instance with the extended lock period.
 *
 * @param network - Network (mainnet/chipnet)
 * @param ownerPKH - Owner's PKH as hex string
 * @param lockEndBlock - Current lock end block
 * @param newLockEndBlock - New (extended) lock end block — must be > lockEndBlock
 * @param safeDelayAddress - Deployed SafeDelay contract address
 */
export async function extend(
  network: Network,
  ownerPKH: string,
  lockEndBlock: number,
  newLockEndBlock: number,
  safeDelayAddress: string
): Promise<ContractCallResult> {
  try {
    // Validate one-way extension
    if (newLockEndBlock <= lockEndBlock) {
      return { error: 'New lock end block must be greater than current lock end block (one-way extension)' };
    }

    const hasWallet = await hasWalletProvider();
    if (!hasWallet || !window.cashscript) {
      return { error: 'CashScript wallet provider not available' };
    }

    const walletAddress = await getWalletAddress();
    if (!walletAddress) return { error: 'Wallet not connected' };

    // Verify wallet matches owner
    const walletPkh = addressToPubkeyHash(walletAddress);
    const walletPkhHex = Array.from(walletPkh).map(b => b.toString(16).padStart(2, '0')).join('');
    const ownerHexClean = ownerPKH.toLowerCase().replace(/^0x/, '');
    if (walletPkhHex !== ownerHexClean) {
      return { error: 'Connected wallet is not the SafeDelay owner' };
    }

    const provider = getProvider(network);

    // Get contract UTXOs
    const contractUtxos = await provider.getUtxos(safeDelayAddress);
    if (contractUtxos.length === 0) {
      return { error: 'SafeDelay has no balance' };
    }

    // Get wallet UTXOs for fee
    const walletUtxos = await provider.getUtxos(walletAddress);
    if (walletUtxos.length === 0) return { error: 'Wallet has no UTXOs for fee' };

    // Get wallet pubkey for signing
    const pubkey = await getWalletPubkey();
    if (!pubkey) return { error: 'Could not get wallet public key' };

    const safeDelay = getSafeDelayContract(network, safeDelayAddress, ownerPKH, lockEndBlock);

    // Build extend transaction
    const extendTx = (safeDelay as any).unlock.extend(pubkey, BigInt(newLockEndBlock));

    const tx = extendTx
      .from([contractUtxos[0], walletUtxos[0]]);

    const txid = await (tx as any).send();
    return { txid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Extend failed' };
  }
}

// =============================================================================
// SafeDelayManager (Registry)
// =============================================================================

import safeDelayManagerArtifact from '../artifacts/SafeDelayManager.artifact.json';

/**
 * Get a SafeDelayManager contract instance at a deployed address.
 *
 * @param network - Network (mainnet/chipnet)
 * @param managerAddress - Deployed SafeDelayManager contract address
 * @param serviceProviderPkh - Service provider's PKH used when deploying
 */
export function getSafeDelayManagerContract(
  network: Network,
  managerAddress: string,
  serviceProviderPkh: string
): Contract {
  const provider = getProvider(network);
  const spBytes = hexToBytes20(serviceProviderPkh);

  const contract = new Contract(
    safeDelayManagerArtifact as any,
    [spBytes],
    { provider }
  );

  // Override to deployed address
  (contract as any).address = managerAddress;

  return contract;
}

/**
 * Register a new SafeDelay in the manager (creates entry in NFT commitment).
 *
 * User must:
 * 1. Deploy a SafeDelay contract with ownerPKH and lockEndBlock
 * 2. Fund the SafeDelay with initial BCH
 * 3. Call createDelay to register in the manager
 *
 * @param network - Network
 * @param managerAddress - Deployed SafeDelayManager address
 * @param serviceProviderPkh - SP's PKH (for fee validation)
 * @param ownerPKH - New SafeDelay owner's PKH
 * @param lockEndBlock - New SafeDelay's lock end block (8 bytes big-endian)
 * @param feeSats - Fee to service provider in satoshis
 */
export async function createDelayRegistration(
  network: Network,
  managerAddress: string,
  serviceProviderPkh: string,
  ownerPKH: string,
  lockEndBlock: number,
  feeSats: number
): Promise<ContractCallResult> {
  try {
    const hasWallet = await hasWalletProvider();
    if (!hasWallet || !window.cashscript) {
      return { error: 'CashScript wallet provider not available' };
    }

    const walletAddress = await getWalletAddress();
    if (!walletAddress) return { error: 'Wallet not connected' };

    const provider = getProvider(network);

    // Get manager UTXOs
    const managerUtxos = await provider.getUtxos(managerAddress);
    if (managerUtxos.length === 0) {
      return { error: 'SafeDelayManager not found' };
    }

    // Get wallet UTXOs for fee
    const walletUtxos = await provider.getUtxos(walletAddress);
    if (walletUtxos.length === 0) return { error: 'Wallet has no UTXOs' };

    const manager = getSafeDelayManagerContract(network, managerAddress, serviceProviderPkh);

    // Encode lockEndBlock as 8 bytes big-endian
    const lockEndBlockBytes = new Uint8Array(8);
    let lockBe = BigInt(lockEndBlock);
    for (let i = 7; i >= 0; i--) {
      lockEndBlockBytes[i] = Number(lockBe & 0xffn);
      lockBe >>= 8n;
    }

    const ownerBytes = hexToBytes20(ownerPKH);

    // Build createDelay transaction
    const createTx = (manager as any).unlock.createDelay(ownerBytes, lockEndBlockBytes, BigInt(feeSats));

    const tx = createTx
      .from([managerUtxos[0], walletUtxos[0]]);

    const txid = await (tx as any).send();
    return { txid };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Create delay registration failed' };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the current block height from Electrum
 */
export async function getCurrentBlockHeight(network: Network): Promise<number> {
  const provider = getProvider(network);
  const electrum = (provider as any).electrum;
  const header = await electrum.request('blockchain.headers.subscribe', []);
  return header.height;
}

/**
 * Check if a SafeDelay lock has expired (current block >= lockEndBlock)
 */
export async function isLockExpired(network: Network, lockEndBlock: number): Promise<boolean> {
  const currentBlock = await getCurrentBlockHeight(network);
  return currentBlock >= lockEndBlock;
}

/**
 * Get SafeDelay contract balance
 */
export async function getSafeDelayBalance(
  network: Network,
  safeDelayAddress: string
): Promise<bigint> {
  const provider = getProvider(network);
  const utxos = await provider.getUtxos(safeDelayAddress);
  return utxos.reduce((sum: bigint, u: Utxo) => sum + BigInt(u.satoshis), 0n);
}