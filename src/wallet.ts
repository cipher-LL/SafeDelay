/**
 * SafeDelay Wallet Integration
 * @ts-nocheck
 */

export type Network = 'mainnet' | 'chipnet' | 'testnet';

export interface WalletInfo {
  address: string;
  pubkey: Uint8Array | null;
  walletType: 'extension' | 'none';
}

export async function hasWalletProvider() {
  return !!(window.cashscript && (window.cashscript as any).getAddress);
}

export async function getWalletAddress() {
  if (!window.cashscript) return null;
  try {
    return await (window.cashscript as any).getAddress();
  } catch {
    return null;
  }
}

export async function getWalletPubkey() {
  if (!window.cashscript) return null;
  try {
    return await (window.cashscript as any).getPubkey();
  } catch {
    return null;
  }
}

export async function getCurrentWalletInfo() {
  const address = await getWalletAddress();
  const pubkey = await getWalletPubkey();
  return {
    address: address ?? '',
    pubkey,
    walletType: address ? 'extension' : 'none',
  };
}

export function parseBCH(bchString: string): bigint {
  const num = parseFloat(bchString);
  if (isNaN(num) || num <= 0) throw new Error('Invalid BCH amount: ' + bchString);
  const sats = Math.round(num * 1e8);
  return BigInt(sats);
}

export function formatBCH(sats: bigint): string {
  return (Number(sats) / 1e8).toFixed(8);
}