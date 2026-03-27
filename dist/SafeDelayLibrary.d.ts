/**
 * SafeDelayLibrary - TypeScript library for SafeDelay contract
 */
import type { SafeDelayConfig, SafeDelayUtxo } from './types/index.js';
/**
 * SafeDelay Library Configuration
 */
export interface SafeDelayLibraryConfig {
    network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' | 'mocknet' | 'regtest';
}
/**
 * Main SafeDelay Library class
 */
export declare class SafeDelayLibrary {
    private contract;
    private network;
    private provider;
    private config;
    constructor(config: SafeDelayLibraryConfig);
    /**
     * Connect to an existing SafeDelay contract
     * @param artifactPath Path to the compiled contract artifact
     * @param config Contract configuration (ownerPKH, lockEndBlock)
     */
    connect(artifactPath: string, config: SafeDelayConfig): Promise<void>;
    /**
     * Create a new SafeDelay contract from compiled artifact
     * @param artifactPath Path to compiled SafeDelay.artifact.json
     * @param config Contract configuration
     * @returns The contract address and details
     */
    create(artifactPath: string, config: SafeDelayConfig): Promise<{
        address: string;
        lockEndBlock: number;
    }>;
    /**
     * Get contract address
     */
    getAddress(): string;
    /**
     * Get the contract balance
     */
    getBalance(): Promise<bigint>;
    /**
     * Get contract UTXOs
     */
    getUtxos(): Promise<SafeDelayUtxo[]>;
    /**
     * Deposit funds into the contract
     * @param depositorKey WIF private key of depositor
     */
    deposit(depositorKey: string): Promise<string>;
    /**
     * Withdraw funds from the contract (after lock expires)
     * @param ownerKey WIF private key of owner
     * @param amount Amount in satoshis
     * @param recipientAddress Optional recipient address (defaults to owner)
     */
    withdraw(ownerKey: string, amount: bigint, recipientAddress?: string): Promise<string>;
    /**
     * Cancel and refund all funds
     * @param ownerKey WIF private key of owner
     */
    cancel(ownerKey: string): Promise<string>;
    /**
     * Check if the lock has expired
     */
    isLockExpired(): Promise<boolean>;
    /**
     * Get remaining lock time in blocks
     */
    getRemainingBlocks(): Promise<number>;
}
/**
 * Helper function to calculate lock end block
 * @param days Number of days to lock
 * @param currentBlock Current block height
 * @param blocksPerDay Average blocks per day (default: 144 for BCH)
 */
export declare function calculateLockEndBlock(days: number, currentBlock: number, blocksPerDay?: number): number;
/**
 * Parse BCH amount from decimal to satoshis
 */
export declare function toSatoshis(bchAmount: number): bigint;
/**
 * Format satoshis to BCH decimal
 */
export declare function toBCH(satoshis: bigint): number;
/**
 * Get current block height from Electrum
 */
export declare function getCurrentBlock(network?: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' | 'mocknet' | 'regtest'): Promise<number>;
//# sourceMappingURL=SafeDelayLibrary.d.ts.map