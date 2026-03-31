/**
 * SocialRecovery Contract Wrapper
 *
 * A SafeDelay variant that supports social recovery — allowing backup keys
 * to recover funds after a grace period if the primary owner loses access.
 *
 * NOTE: This wrapper requires the SocialRecovery.cash contract to be fixed
 * (the bytes20[5] array syntax is not valid in CashScript 0.12).
 * See src/types/SocialRecoveryArtifact.ts for details.
 */
import type { SocialRecoveryArtifact } from './types/index.js';
import type { SafeDelayNetwork } from './SafeDelay.js';
/**
 * Configuration for SocialRecovery contract
 */
export interface SocialRecoveryConfig {
    /** Current owner public key hash */
    ownerPublicKeyHash: string;
    /** Pending new owner (0 if no pending recovery) */
    newOwnerPublicKeyHash?: string;
    /** Block when recovery period starts (0 if not proposed) */
    recoveryStartBlock?: number;
    /** Number of blocks required after recovery proposal */
    recoveryDelay: number;
    /** Number of backup signatures required (M) */
    requiredSignatures: number;
    /** Backup signer 1 */
    backupPKH1: string;
    /** Backup signer 2 */
    backupPKH2: string;
    /** Backup signer 3 */
    backupPKH3: string;
    /** Backup signer 4 (can be 0 if < 4 signers) */
    backupPKH4?: string;
    /** Backup signer 5 (can be 0 if < 5 signers) */
    backupPKH5?: string;
}
/**
 * SocialRecovery: Time-locked wallet with social recovery
 *
 * Security model:
 * - Primary owner has full control
 * - Backup signers can propose recovery to a new owner after delay
 * - Recovery requires M-of-N backup signatures after recoveryDelay blocks
 * - Owner can cancel any pending recovery
 * - Backups cannot steal — only propose recovery
 */
export declare class SocialRecovery {
    private contract;
    private network;
    private provider;
    private config;
    constructor(network?: SafeDelayNetwork);
    /**
     * Connect to an existing SocialRecovery contract
     * @param artifact - SocialRecovery artifact
     * @param config - Contract configuration
     */
    connect(artifact: SocialRecoveryArtifact, config: SocialRecoveryConfig): void;
    /**
     * Connect using a path to the artifact JSON file
     */
    connectFromPath(artifactPath: string, config: SocialRecoveryConfig): void;
    getAddress(): string;
    getBalance(): Promise<bigint>;
    getUtxos(): Promise<import("cashscript").Utxo[]>;
    /**
     * Deposit funds (anyone can deposit)
     * @param depositorKey - WIF private key of depositor
     */
    deposit(depositorKey: string): Promise<string>;
    /**
     * Withdraw funds (owner only)
     * @param ownerKey - WIF private key of owner
     * @param amount - Amount in satoshis
     */
    withdraw(ownerKey: string, amount: bigint): Promise<string>;
    /**
     * Cancel and refund all funds (owner only)
     * @param ownerKey - WIF private key of owner
     */
    cancel(ownerKey: string): Promise<string>;
    /**
     * Propose recovery to a new owner (any backup signer)
     * @param backupKey - WIF private key of backup signer
     * @param newOwner - New owner public key hash
     */
    proposeRecovery(backupKey: string, newOwner: string): Promise<string>;
    /**
     * Execute recovery after delay (M-of-N backups)
     * @param backupKeys - Array of WIF private keys for M backups
     */
    executeRecovery(backupKeys: string[]): Promise<string>;
    /**
     * Cancel pending recovery (owner only)
     * @param ownerKey - WIF private key of owner
     */
    cancelRecovery(ownerKey: string): Promise<string>;
    /**
     * Transfer ownership directly (owner only)
     * @param ownerKey - WIF private key of current owner
     * @param newOwner - New owner public key hash
     */
    transferOwnership(ownerKey: string, newOwner: string): Promise<string>;
    getCurrentBlock(): Promise<number>;
    getConfig(): SocialRecoveryConfig | null;
    private requireConnected;
}
//# sourceMappingURL=SocialRecovery.d.ts.map