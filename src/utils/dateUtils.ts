/**
 * dateUtils.ts
 *
 * Shared date/time utilities for SafeDelay contracts.
 */

/**
 * Estimate the unlock date for a time-locked SafeDelay contract.
 * Returns null if the lock has already ended, current block is unknown,
 * or the remaining time exceeds 60 days (to avoid misleading far-future dates).
 */
export function estimateUnlockDate(
  lockEndBlock: number,
  currentBlock: number | undefined
): string | null {
  if (currentBlock == null || lockEndBlock <= currentBlock) return null;
  const blocksRemaining = lockEndBlock - currentBlock;
  const daysRemaining = blocksRemaining / 144;
  if (daysRemaining > 60) return null; // Sentinel: don't show misleading far-future dates
  return new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
