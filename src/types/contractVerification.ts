/**
 * Types for contract auto-verification (useAutoContractVerification hook).
 */

// Network error messages from Electrum provider — used to detect transient vs fatal errors
export const NETWORK_ERROR_PATTERNS = [
  'fetch failed',
  'failed to fetch',
  'network error',
  'net::err',
  'connection refused',
  'timeout',
  'econnreset',
  'enotfound',
  'eserverfault',
  'socket hang up',
  'service unavailable',
  '503',
  '502',
  '504',
];

/** LocalStorage key for tracking last auto-scan time (1-hour cooldown) */
export const RECOVERY_CHECK_KEY = 'safedelay_recovery_verified';

/** Throttle Electrum requests between contracts to avoid rate-limiting (ms) */
export const VERIFICATION_THROTTLE_MS = 150;

export interface VerificationResult {
  /** Contracts from localStorage that are confirmed on-chain */
  confirmed: string[];
  /** Contracts from localStorage that appear empty (fully withdrawn) */
  empty: string[];
  /** Contracts from localStorage that have NO on-chain history (may be lost) */
  orphaned: string[];
  /** Contracts with bytecode that does NOT match the expected hash from HASHES.json */
  bytecodeMismatch: Array<{
    address: string;
    expectedHash: string;
    actualHash: string;
  }>;
  /** On-chain contracts NOT in localStorage (recoverable) */
  recoverable: Array<{
    address: string;
    ownerPkh: string;
    lockEndBlock: number;
  }>;
  /** Errors encountered during verification */
  errors: string[];
  /** Transient network errors that may resolve on retry */
  networkErrors: string[];
  /** Whether the auto-recovery scan ran */
  autoScanDone: boolean;
}

export interface VerificationProgressDetail {
  current: number;
  total: number;
}

export interface UseAutoContractVerificationResult {
  verificationResult: VerificationResult | null;
  isVerifying: boolean;
  verifyProgress: string;
  /** Fractional progress (e.g. { current: 3, total: 12 }) */
  verifyProgressDetail: VerificationProgressDetail | null;
  /** Re-run verification manually */
  reverify: () => void;
  /** Abort the current verification operation */
  abort: () => void;
  /** Pause verification (can be resumed with reverify) */
  pause: () => void;
  /** Apply recovered contracts to localStorage */
  applyRecovery: (contracts: VerificationResult['recoverable']) => void;
}
