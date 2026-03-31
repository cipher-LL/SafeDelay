/**
 * SafeDelay_NFT Contract Wrapper
 *
 * A time-locked wallet designed for NFT holders.
 * Allows depositing BCH onto NFTs with time-locked withdrawals.
 */
import type { SafeDelay_NFTArtifact } from './types/index.js';
import type { SafeDelayNetwork } from './SafeDelay.js';
/**
 * Configuration for SafeDelay_NFT contract
 */
export interface SafeDelay_NFTConfig {
    /** User's public key hash for withdrawals */
    userPublicKeyHash: string;
    /** Emergency public key hash */
    emergencyPublicKeyHash: string;
    /** Recovery public key hash (cold storage, no timelock) */
    recoverPublicKeyHash: string;
    /** Default number of blocks to wait before withdrawal enabled */
    blockDelay: number;
}
/**
 * SafeDelay_NFT: Time-locked wallet for NFTs
 *
 * Features:
 * - 🎨 Deposit BCH onto NFTs
 * - ⏱️ Time-locked withdrawals (initial blockDelay applies)
 * - 🔓 Extend lock period
 * - 🚨 Emergency withdraw without delay
 * - 🔐 Recover to cold storage
 */
export declare class SafeDelay_NFT {
    private contract;
    private network;
    private provider;
    private config;
    constructor(network?: SafeDelayNetwork);
    connect(artifact: SafeDelay_NFTArtifact, config: SafeDelay_NFTConfig): void;
    connectFromPath(artifactPath: string, config: SafeDelay_NFTConfig): void;
    getAddress(): string;
    getBalance(): Promise<bigint>;
    getUtxos(): Promise<import("cashscript").Utxo[]>;
    /**
     * Deposit BCH onto a new NFT
     * @param depositorKey - WIF private key of depositor
     */
    deposit(depositorKey: string): Promise<string>;
    /**
     * Extend the lock period
     * @param userKey - WIF private key of user
     * @param additionalBlocks - Additional blocks to add
     */
    extend(userKey: string, additionalBlocks: number): Promise<string>;
    /**
     * Start the withdrawal process
     * @param userKey - WIF private key of user
     */
    startWithdraw(userKey: string): Promise<string>;
    /**
     * Withdraw funds after lock expires
     * @param userKey - WIF private key of user
     * @param amount - Amount in satoshis
     */
    withdraw(userKey: string, amount: bigint): Promise<string>;
    /**
     * Emergency withdraw without time lock
     * @param userKey - WIF private key of user
     * @param emergencyAddress - Emergency address to send funds
     */
    emergencyWithdraw(userKey: string, emergencyAddress: string): Promise<string>;
    /**
     * Recover funds to cold storage (no timelock)
     * @param userKey - WIF private key of user
     * @param coldAddress - Cold storage address
     */
    recover(userKey: string, coldAddress: string): Promise<string>;
    getCurrentBlock(): Promise<number>;
    getConfig(): SafeDelay_NFTConfig | null;
    private requireConnected;
}
//# sourceMappingURL=SafeDelay_NFT.d.ts.map