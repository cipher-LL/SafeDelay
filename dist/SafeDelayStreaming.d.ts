/**
 * SafeDelayStreaming Contract Wrapper
 *
 * A streaming time-lock that releases funds gradually over time.
 * The recipient can claim released funds at any time, and the creator can cancel to refund.
 */
import type { SafeDelayStreamingArtifact } from './types/index.js';
import type { SafeDelayNetwork } from './SafeDelay.js';
/**
 * Configuration for SafeDelayStreaming contract
 */
export interface SafeDelayStreamingConfig {
    /** Creator's public key hash (funds source, can cancel) */
    creatorPublicKeyHash: string;
    /** Recipient's public key hash (receives released funds) */
    recipientPublicKeyHash: string;
    /** Block height when streaming starts */
    lockEndBlock: number;
    /** Blocks between each release */
    releaseInterval: number;
    /** Total number of releases */
    numReleases: number;
    /** Total amount being streamed (satoshis) */
    totalAmount: number;
}
/**
 * SafeDelayStreaming: Gradual fund release over time
 *
 * Features:
 * - 💰 Creator funds the contract with a total amount
 * - 📈 Funds release incrementally based on releaseInterval
 * - 🎁 Recipient can claim released (but unclaimed) funds at any time
 * - 🚫 Creator can cancel to refund unclaimed funds
 */
export declare class SafeDelayStreaming {
    private contract;
    private network;
    private provider;
    private config;
    constructor(network?: SafeDelayNetwork);
    /**
     * Connect to an existing SafeDelayStreaming contract
     * @param artifact - SafeDelayStreaming artifact
     * @param config - Contract configuration
     */
    connect(artifact: SafeDelayStreamingArtifact, config: SafeDelayStreamingConfig): void;
    /**
     * Connect using a path to the artifact JSON file
     */
    connectFromPath(artifactPath: string, config: SafeDelayStreamingConfig): void;
    getAddress(): string;
    getBalance(): Promise<bigint>;
    getUtxos(): Promise<import("cashscript").Utxo[]>;
    /**
     * Claim released funds
     * @param recipientKey - WIF private key of recipient
     * @param amount - Amount in satoshis to claim
     * @returns Transaction ID
     */
    claim(recipientKey: string, amount: bigint): Promise<string>;
    /**
     * Cancel and refund unclaimed funds to creator
     * @param creatorKey - WIF private key of creator
     * @returns Transaction ID
     */
    cancel(creatorKey: string): Promise<string>;
    /**
     * Extend the streaming period
     * @param creatorKey - WIF private key of creator
     * @param newLockEndBlock - New lock end block
     */
    extend(creatorKey: string, newLockEndBlock: number): Promise<string>;
    /**
     * Calculate how much has been released so far
     */
    getReleasedAmount(): Promise<bigint>;
    /**
     * Get remaining unclaimed amount
     */
    getUnclaimedAmount(): Promise<bigint>;
    getCurrentBlock(): Promise<number>;
    getConfig(): SafeDelayStreamingConfig | null;
    private requireConnected;
}
//# sourceMappingURL=SafeDelayStreaming.d.ts.map