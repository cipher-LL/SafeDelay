import { Utxo } from 'cashscript';

/**
 * SafeDelay Contract Types
 * 
 * TypeScript definitions for the SafeDelay time-locked wallet contract.
 */

/**
 * Configuration for deploying SafeDelay contract
 */
export interface SafeDelayConfig {
  ownerPublicKeyHash: string;  // 40 hex chars (20 bytes) - owner's p2pkh address without prefix
  lockEndBlock: number;         // Block height when lock expires
}

/**
 * Parameters for deposit function
 */
export interface DepositParams {
  depositorPrivateKey: string;  // WIF format
  depositorAddress: string;     // CashAddress format
}

/**
 * Parameters for withdraw function
 */
export interface WithdrawParams {
  ownerPrivateKey: string;      // WIF format
  ownerAddress: string;         // CashAddress format
  withdrawAmount: bigint;       // Amount in satoshis
}

/**
 * Parameters for cancel function
 */
export interface CancelParams {
  ownerPrivateKey: string;      // WIF format
  ownerAddress: string;         // CashAddress format
}

/**
 * SafeDelay UTXO with metadata
 */
export interface SafeDelayUtxo extends Utxo {
  safeDelayData: {
    ownerPKH: string;
    lockEndBlock: number;
  };
}

/**
 * Configuration for deploying SafeDelayMultiSig contract
 */
export interface SafeDelayMultiSigConfig {
  owner1: string;    // 40 hex chars (20 bytes) - first owner's p2pkh address without prefix
  owner2: string;    // 40 hex chars (20 bytes) - second owner's p2pkh address without prefix
  owner3: string;    // 40 hex chars (20 bytes) - third owner's p2pkh address without prefix
  threshold: number; // Required signatures (2 or 3)
  lockEndBlock: number; // Block height when lock expires
}

/**
 * Parameters for SafeDelayMultiSig deposit function
 */
export interface SafeDelayMultiSigDepositParams {
  depositorPrivateKey: string;  // WIF format
  depositorAddress: string;     // CashAddress format
}

/**
 * Parameters for SafeDelayMultiSig withdraw function
 * Requires M-of-N signatures from the 3 owners
 */
export interface SafeDelayMultiSigWithdrawParams {
  privateKey1: string;     // WIF format - must be owner1
  privateKey2: string;     // WIF format - can be owner2 or owner3
  privateKey3: string;     // WIF format - can be owner2 or owner3
  owner1Address: string;  // CashAddress format for owner1
  withdrawAmount: bigint; // Amount in satoshis
}

/**
 * Parameters for SafeDelayMultiSig cancel function
 * Any single owner can cancel anytime
 */
export interface SafeDelayMultiSigCancelParams {
  ownerPrivateKey: string;  // WIF format - any of the 3 owners
  ownerAddress: string;     // CashAddress format
}

/**
 * Parameters for SafeDelayMultiSig extend function
 * Requires M-of-N signatures
 */
export interface SafeDelayMultiSigExtendParams {
  privateKey1: string;      // WIF format - must be owner1
  privateKey2: string;      // WIF format - can be owner2 or owner3
  privateKey3: string;      // WIF format - can be owner2 or owner3
  owner1Address: string;    // CashAddress format for owner1
  newLockEndBlock: number;  // New lock end block (must be > current)
}

/**
 * SafeDelayMultiSig UTXO with metadata
 */
export interface SafeDelayMultiSigUtxo extends Utxo {
  safeDelayMultiSigData: {
    owner1: string;
    owner2: string;
    owner3: string;
    threshold: number;
    lockEndBlock: number;
  };
}

/**
 * Contract artifact interface for SafeDelayMultiSig
 */
export interface SafeDelayMultiSigArtifact {
  name: string;
  constructorInputs: Array<{
    name: string;
    type: string;
  }>;
  functions: {
    deposit: {
      inputs: Array<{ name: string; type: string }>;
    };
    withdraw: {
      inputs: Array<{ name: string; type: string }>;
    };
    cancel: {
      inputs: Array<{ name: string; type: string }>;
    };
    extend: {
      inputs: Array<{ name: string; type: string }>;
    };
  };
}

/**
 * Events emitted by SafeDelay (for off-chain tracking)
 */
export interface SafeDelayEvent {
  type: 'deposit' | 'withdraw' | 'cancel';
  blockHeight: number;
  txHash: string;
  amount?: bigint;
}

/**
 * Helper to calculate lock duration in blocks
 * @param days Number of days to lock
 * @param blocksPerDay Average blocks per day (default: 144)
 * @returns Number of blocks to add to current height
 */
export function calculateLockBlocks(days: number, blocksPerDay: number = 144): number {
  return days * blocksPerDay;
}

/**
 * Helper to check if lock has expired
 * @param currentBlock Current block height
 * @param lockEndBlock Lock expiration block
 * @returns True if funds can be withdrawn
 */
export function isLockExpired(currentBlock: number, lockEndBlock: number): boolean {
  return currentBlock >= lockEndBlock;
}

// ============================================================
// SafeDelayManager Types
// ============================================================

/**
 * Configuration for deploying SafeDelayManager contract
 */
export interface SafeDelayManagerConfig {
  serviceProviderPublicKeyHash: string;  // 40 hex chars (20 bytes)
}

/**
 * Parameters for createDelay function
 */
export interface CreateDelayParams {
  ownerPublicKeyHash: string;    // 40 hex chars (20 bytes) - owner's p2pkh address without prefix
  lockEndBlock: number;          // Block height when lock expires
  feeSats: bigint;               // Fee to service provider in sats
}

/**
 * SafeDelayManager UTXO with registry data
 */
export interface SafeDelayManagerUtxo extends Utxo {
  managerData: {
    serviceProviderPkh: string;
    delayCount: number;
    delays: Array<{
      ownerPkh: string;
      lockEndBlock: number;
    }>;
  };
}

/**
 * A registered SafeDelay entry in the manager
 */
export interface SafeDelayManagerEntry {
  ownerPkh: string;       // 40 hex chars (20 bytes)
  lockEndBlock: number;  // Block height
  address?: string;      // Computed SafeDelay address (off-chain)
}

/**
 * Artifact type for SafeDelayManager
 */
export interface SafeDelayManagerArtifact {
  contractName: string;
  constructorInputs: Array<{ name: string; type: string }>;
  abi: Array<{
    name: string;
    inputs: Array<{ name: string; type: string }>;
  }>;
  bytecode: string;
  compiler: { name: string; version: string };
}
