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
 * Contract artifact interface (from compiled .json artifact)
 */
export interface SafeDelayArtifact {
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
