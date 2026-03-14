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
 * Configuration for deploying SafeDelayMultiSig contract
 */
export interface SafeDelayMultiSigConfig {
    owner1: string;
    owner2: string;
    owner3: string;
    threshold: number;
    lockEndBlock: number;
}
/**
 * Parameters for SafeDelayMultiSig deposit function
 */
export interface SafeDelayMultiSigDepositParams {
    depositorPrivateKey: string;
    depositorAddress: string;
}
/**
 * Parameters for SafeDelayMultiSig withdraw function
 * Requires M-of-N signatures from the 3 owners
 */
export interface SafeDelayMultiSigWithdrawParams {
    privateKey1: string;
    privateKey2: string;
    privateKey3: string;
    owner1Address: string;
    withdrawAmount: bigint;
}
/**
 * Parameters for SafeDelayMultiSig cancel function
 * Any single owner can cancel anytime
 */
export interface SafeDelayMultiSigCancelParams {
    ownerPrivateKey: string;
    ownerAddress: string;
}
/**
 * Parameters for SafeDelayMultiSig extend function
 * Requires M-of-N signatures
 */
export interface SafeDelayMultiSigExtendParams {
    privateKey1: string;
    privateKey2: string;
    privateKey3: string;
    owner1Address: string;
    newLockEndBlock: number;
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
        extend: {
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
//# sourceMappingURL=index.d.ts.map