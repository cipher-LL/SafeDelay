/**
 * Helper to calculate lock duration in blocks
 * @param days Number of days to lock
 * @param blocksPerDay Average blocks per day (default: 144)
 * @returns Number of blocks to add to current height
 */
export function calculateLockBlocks(days, blocksPerDay = 144) {
    return days * blocksPerDay;
}
/**
 * Helper to check if lock has expired
 * @param currentBlock Current block height
 * @param lockEndBlock Lock expiration block
 * @returns True if funds can be withdrawn
 */
export function isLockExpired(currentBlock, lockEndBlock) {
    return currentBlock >= lockEndBlock;
}
//# sourceMappingURL=index.js.map