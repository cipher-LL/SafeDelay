import type { Utxo } from 'cashscript';
/**
 * SafeDelay Contract Types
 *
 * TypeScript definitions for the SafeDelay time-locked wallet contract.
 */
/**
 * Configuration for deploying SafeDelay contract
 */
export interface SafeDelayConfig {
    ownerPublicKeyHash: string;
    lockEndBlock: number;
}
/**
 * Parameters for deposit function
 */
export interface DepositParams {
    depositorPrivateKey: string;
    depositorAddress: string;
}
/**
 * Parameters for withdraw function
 */
export interface WithdrawParams {
    ownerPrivateKey: string;
    ownerAddress: string;
    withdrawAmount: bigint;
}
/**
 * Parameters for cancel function
 */
export interface CancelParams {
    ownerPrivateKey: string;
    ownerAddress: string;
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
            inputs: Array<{
                name: string;
                type: string;
            }>;
        };
        withdraw: {
            inputs: Array<{
                name: string;
                type: string;
            }>;
        };
        cancel: {
            inputs: Array<{
                name: string;
                type: string;
            }>;
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
export declare function calculateLockBlocks(days: number, blocksPerDay?: number): number;
/**
 * Helper to check if lock has expired
 * @param currentBlock Current block height
 * @param lockEndBlock Lock expiration block
 * @returns True if funds can be withdrawn
 */
export declare function isLockExpired(currentBlock: number, lockEndBlock: number): boolean;
import type { SafeDelayArtifact } from './SafeDelayArtifact.js';
import type { SafeDelayMultiSigArtifact } from './SafeDelayMultiSigArtifact.js';
import type { SafeDelayStreamingArtifact } from './SafeDelayStreamingArtifact.js';
import type { SafeDelay_NFTArtifact } from './SafeDelay_NFTArtifact.js';
import type { CrowdFundArtifact } from './CrowdFundArtifact.js';
export type { SafeDelayArtifact, SafeDelayMultiSigArtifact, SafeDelayStreamingArtifact, SafeDelay_NFTArtifact, CrowdFundArtifact };
//# sourceMappingURL=index.d.ts.map