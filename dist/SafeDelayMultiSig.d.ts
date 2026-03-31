/**
 * SafeDelayMultiSig Contract Wrapper
 *
 * A multi-signature time-locked wallet requiring M-of-N signatures.
 * Supports extend and cancel operations.
 */
import type { SafeDelayMultiSigArtifact } from './types/index.js';
import type { SafeDelayNetwork } from './SafeDelay.js';
/**
 * Configuration for SafeDelayMultiSig contract
 */
export interface SafeDelayMultiSigConfig {
    /** Array of M public key hashes required (40 hex chars each) */
    publicKeyHashes: string[];
    /** Number of signatures required (M) */
    requiredSignatures: number;
    /** Block height when lock expires */
    lockEndBlock: number;
}
export declare class SafeDelayMultiSig {
    private contract;
    private network;
    private provider;
    private config;
    constructor(network?: SafeDelayNetwork);
    /**
     * Connect to an existing SafeDelayMultiSig contract
     * @param artifact - SafeDelayMultiSig artifact
     * @param config - Contract configuration (publicKeyHashes, requiredSignatures, lockEndBlock)
     */
    connect(artifact: SafeDelayMultiSigArtifact, config: SafeDelayMultiSigConfig): void;
    /**
     * Connect using a path to the artifact JSON file
     */
    connectFromPath(artifactPath: string, config: SafeDelayMultiSigConfig): void;
    getAddress(): string;
    getBalance(): Promise<bigint>;
    getUtxos(): Promise<import("cashscript").Utxo[]>;
    /**
     * Deposit funds (anyone can deposit)
     * @param depositorKey - WIF private key of depositor
     * @param amount - Amount in satoshis
     */
    deposit(depositorKey: string, amount: bigint): Promise<string>;
    /**
     * Withdraw funds (requires M-of-N signatures)
     * @param keys - Array of WIF private keys (M or more)
     * @param amount - Amount in satoshis
     * @param recipientAddress - Optional recipient
     */
    withdraw(keys: string[], amount: bigint, recipientAddress?: string): Promise<string>;
    /**
     * Extend the lock period
     * @param keys - Array of WIF private keys (M or more)
     * @param newLockEndBlock - New lock expiration block
     */
    extend(keys: string[], newLockEndBlock: number): Promise<string>;
    /**
     * Cancel and refund (requires M-of-N signatures)
     * @param keys - Array of WIF private keys (M or more)
     */
    cancel(keys: string[]): Promise<string>;
    isLockExpired(): Promise<boolean>;
    getRemainingBlocks(): Promise<number>;
    getCurrentBlock(): Promise<number>;
    getConfig(): SafeDelayMultiSigConfig | null;
    private requireConnected;
}
//# sourceMappingURL=SafeDelayMultiSig.d.ts.map