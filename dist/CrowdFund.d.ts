/**
 * CrowdFund Contract Wrapper
 *
 * A crowdfunding contract where creators set a funding goal and deadline.
 * If the goal is met by the deadline, the creator can withdraw.
 * If not, backers can reclaim their deposits.
 */
import type { CrowdFundArtifact } from './types/index.js';
import type { SafeDelayNetwork } from './SafeDelay.js';
/**
 * Configuration for CrowdFund contract
 */
export interface CrowdFundConfig {
    /** Creator's public key hash */
    creatorPublicKeyHash: string;
    /** Minimum amount to succeed (satoshis) */
    fundingGoal: number;
    /** Block height when campaign ends */
    deadline: number;
}
/**
 * Campaign status based on current state
 */
export type CrowdFundStatus = 'active' | 'succeeded' | 'failed';
/**
 * CrowdFund: Crowdfunding with goal and deadline
 *
 * Features:
 * - 🎯 Creator sets a funding goal and deadline
 * - 💰 Backers contribute to fund the campaign
 * - ✅ If goal met by deadline → creator withdraws
 * - ❌ If goal not met by deadline → backers can reclaim
 */
export declare class CrowdFund {
    private contract;
    private network;
    private provider;
    private config;
    constructor(network?: SafeDelayNetwork);
    /**
     * Connect to an existing CrowdFund contract
     * @param artifact - CrowdFund artifact
     * @param config - Contract configuration (creatorPkh, fundingGoal, deadline)
     */
    connect(artifact: CrowdFundArtifact, config: CrowdFundConfig): void;
    /**
     * Connect using a path to the artifact JSON file
     */
    connectFromPath(artifactPath: string, config: CrowdFundConfig): void;
    getAddress(): string;
    getBalance(): Promise<bigint>;
    getUtxos(): Promise<import("cashscript").Utxo[]>;
    /**
     * Contribute to the campaign
     * @param backerKey - WIF private key of backer
     * @param amount - Amount in satoshis to contribute
     * @returns Transaction ID
     */
    contribute(backerKey: string, amount: bigint): Promise<string>;
    /**
     * Withdraw funds (creator only, only if goal met by deadline)
     * @param creatorKey - WIF private key of creator
     * @returns Transaction ID
     */
    withdraw(creatorKey: string): Promise<string>;
    /**
     * Refund contributions (backers only, only if goal NOT met by deadline)
     * Note: Simplified implementation - anyone can trigger refund for all
     * @param initiatorKey - WIF private key of anyone initiating refund
     * @returns Transaction ID
     */
    refund(initiatorKey: string): Promise<string>;
    /**
     * Get the current campaign status
     */
    getStatus(): Promise<CrowdFundStatus>;
    /**
     * Check if goal has been reached
     */
    isGoalReached(): Promise<boolean>;
    /**
     * Get funding progress as a percentage
     */
    getProgress(): Promise<number>;
    /**
     * Get remaining time in blocks
     */
    getRemainingBlocks(): Promise<number>;
    getCurrentBlock(): Promise<number>;
    getConfig(): CrowdFundConfig | null;
    private requireConnected;
}
//# sourceMappingURL=CrowdFund.d.ts.map