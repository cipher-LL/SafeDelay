// Shared utility functions for Dashboard sub-components

export type Network = 'mainnet' | 'testnet' | 'chipnet';

export function getExplorerUrl(network: Network, txHash: string): string {
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/transaction/${txHash}`;
  }
  return `https://chipnet.blockchair.com/bitcoin-cash/transaction/${txHash}`;
}

export function getExplorerAddressUrl(network: Network, addr: string): string {
  const clean = addr.replace(/^(bchtest:|bitcoincash:)/, '');
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/address/${clean}`;
  }
  return `https://chipnet.blockchair.com/bitcoin-cash/address/${clean}`;
}

export function getTimeRemaining(lockEnd: number, current: number): string {
  const blocksRemaining = lockEnd - current;
  if (blocksRemaining <= 0) return 'Unlocked';
  const days = Math.floor(blocksRemaining / 144);
  if (days === 0) return `${blocksRemaining} blocks`;
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function estimateUnlockDateFromBlocks(
  lockEndBlock: number,
  currentBlock: number | undefined
): string | null {
  if (currentBlock === undefined) return null;
  const blocksRemaining = lockEndBlock - currentBlock;
  if (blocksRemaining <= 0) return null;
  const daysRemaining = blocksRemaining / 144;
  const estDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
  return estDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeAgo(timestamp: number): string {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
