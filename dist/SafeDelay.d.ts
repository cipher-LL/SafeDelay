/**
 * SafeDelay Contract Wrapper
 *
 * Time-locked wallet where funds are locked until a specified block height.
 * The owner can extend the lock at any time, but cannot shorten it.
 * After the lock expires, the owner can withdraw freely.
 *
 * @example
 * ```typescript
 * import { SafeDelay } from 'safedelay';
 *
 * const safeDelay = new SafeDelay({ network: 'mainnet' });
 * safeDelay.connect(artifact, {
 *   ownerPublicKeyHash: '...',
 *   lockEndBlock: 850000
 * });
 *
 * // Check if lock has expired
 * const expired = await safeDelay.isLockExpired();
 *
 * // Withdraw after lock expires
 * if (expired) {
 *   const txid = await safeDelay.withdraw(ownerKey, 100000n);
 * }
 * ```
 */
import type { SafeDelayArtifact } from './types/index.js';
/**
 * Network supported by SafeDelay
 */
export type SafeDelayNetwork = 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' | 'mocknet' | 'regtest';
/**
 * Configuration for connecting to an existing SafeDelay contract
 */
export interface SafeDelayConfig {
    /** Owner's public key hash (40 hex chars / 20 bytes) */
    ownerPublicKeyHash: string;
    /** Block height when lock expires */
    lockEndBlock: number;
}
/**
 * SafeDelay: Simple time-locked wallet contract
 *
 * Features:
 * - ⏱️ Time-locked withdrawals (funds locked until block height)
 * - 💰 Flexible deposits (anyone can deposit)
 * - 🔓 Extend lock (owner can extend at any time)
 * - 🚫 Cancel (owner can cancel and refund everything)
 */
export declare class SafeDelay {
    private contract;
    private network;
    private provider;
    private config;
    /**
     * Create a new SafeDelay wrapper instance
     * @param options - Configuration options
     */
    constructor(options?: {
        network?: SafeDelayNetwork;
    });
    /**
     * Connect to an existing SafeDelay contract on-chain
     * @param artifact - SafeDelay artifact (can be imported from 'safedelay/artifacts/SafeDelay')
     * @param config - Contract configuration (ownerPKH, lockEndBlock)
     */
    connect(artifact: SafeDelayArtifact, config: SafeDelayConfig): void;
    /**
     * Connect using a path to the artifact JSON file
     * @param artifactPath - Path to SafeDelay.artifact.json
     * @param config - Contract configuration
     */
    connectFromPath(artifactPath: string, config: SafeDelayConfig): void;
    /**
     * Get the contract's P2PKH address
     */
    getAddress(): string;
    /**
     * Get total balance held by the contract
     */
    getBalance(): Promise<bigint>;
    /**
     * Get all UTXOs held by the contract
     */
    getUtxos(): Promise<import("cashscript").Utxo[]>;
    /**
     * Deposit funds into the contract (anyone can deposit)
     * @param depositorKey - WIF private key of depositor
     * @param amount - Amount in satoshis
     * @param recipientAddress - Optional recipient (defaults to contract address)
     * @returns Transaction details
     */
    deposit(depositorKey: string, amount: bigint, recipientAddress?: string): Promise<{
        txid: string;
    }>;
    /**
     * Extend the lock period (one-way, can only increase)
     * @param ownerKey - WIF private key of owner
     * @param newLockEndBlock - New lock expiration block (must be > current)
     * @returns Transaction details
     */
    extend(ownerKey: string, newLockEndBlock: number): Promise<{
        txid: string;
    }>;
    /**
     * Start the withdrawal process (sets a flag, actual withdraw comes after)
     * @param ownerKey - WIF private key of owner
     * @returns Transaction details
     */
    startWithdraw(ownerKey: string): Promise<{
        txid: string;
    }>;
    /**
     * Withdraw funds from the contract (after lock + startWithdraw)
     * @param ownerKey - WIF private key of owner
     * @param amount - Amount in satoshis
     * @param recipientAddress - Optional recipient (defaults to owner from key)
     * @returns Transaction details
     */
    withdraw(ownerKey: string, amount: bigint, recipientAddress?: string): Promise<{
        txid: string;
    }>;
    /**
     * Emergency withdraw without time lock (to emergency address)
     * @param ownerKey - WIF private key of owner
     * @param recipientAddress - Emergency address to send funds
     * @returns Transaction details
     */
    emergencyWithdraw(ownerKey: string, recipientAddress: string): Promise<{
        txid: string;
    }>;
    /**
     * Recover funds to cold storage address (no timelock)
     * @param ownerKey - WIF private key of owner
     * @param recipientAddress - Cold storage address
     * @returns Transaction details
     */
    recover(ownerKey: string, recipientAddress: string): Promise<{
        txid: string;
    }>;
    /**
     * Cancel the contract and refund all funds to owner
     * @param ownerKey - WIF private key of owner
     * @returns Transaction details
     */
    cancel(ownerKey: string): Promise<{
        txid: string;
    }>;
    /**
     * Check if the lock period has expired
     */
    isLockExpired(): Promise<boolean>;
    /**
     * Get remaining blocks until lock expires
     */
    getRemainingBlocks(): Promise<number>;
    /**
     * Get the current block height
     */
    getCurrentBlock(): Promise<number>;
    /**
     * Get the contract configuration
     */
    getConfig(): SafeDelayConfig | null;
    private requireConnected;
}
/**
 * Calculate the lock end block from a date
 * @param targetDate - Date when lock should expire
 * @param network - Network to check current block from
 * @returns Block height estimate
 */
export declare function calculateLockEndBlockFromDate(targetDate: Date, network?: SafeDelayNetwork): Promise<number>;
/**
 * Calculate lock end block from days from now
 * @param days - Number of days to lock
 * @param currentBlock - Current block height (optional, will fetch if not provided)
 * @param network - Network to check current block from
 */
export declare function calculateLockEndBlockFromDays(days: number, currentBlock?: number, network?: SafeDelayNetwork): Promise<number>;
//# sourceMappingURL=SafeDelay.d.ts.map