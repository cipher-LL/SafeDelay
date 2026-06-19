// Shared types for Dashboard sub-components
// Note: Import from hooks for actual definitions where available

export interface TimeLock {
  address: string;
  balance: number;
  lockEndBlock: number;
  currentBlock: number;
  type: 'single' | 'multisig';
  owners?: string[];
  ownerPkh?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'cancel' | 'create';
  amount: number;
  timestamp: number;
  txHash: string;
  contractAddress: string;
}

export interface PendingTx {
  id: string;
  contractAddress: string;
  type: 'withdraw' | 'cancel' | 'deposit' | 'extend';
  amount?: number;
  lockEndBlock?: number;
  status: 'confirm' | 'broadcasting' | 'confirming' | 'confirmed' | 'success' | 'error';
  txHash?: string;
  error?: string;
  warning?: string;
}

export type SortOption = 'date' | 'amount' | 'unlock';
export type TxFilterType = 'all' | 'deposit' | 'withdraw' | 'cancel' | 'create';
export type NavigateTab = 'create' | 'multisig' | 'dashboard' | 'manager';

// BytecodeMismatch from useAutoContractVerification
export interface BytecodeMismatch {
  address: string;
  expectedHash: string;
  actualHash: string;
}
