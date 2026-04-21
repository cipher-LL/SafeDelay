/**
 * SafeDelay Contract Addresses
 *
 * These addresses are the deployed SafeDelayManager registry contracts.
 * Each service provider deploys their own manager with their SP PKH.
 *
 * DEPLOYMENT:
 *   chipnet:  node scripts/deploy-manager.mjs --sp-pkh <pkh> --network chipnet
 *   mainnet:  node scripts/deploy-manager.mjs --sp-pkh <pkh> --network mainnet
 *
 * After deploying, update the addresses below and commit.
 */

export interface NetworkAddresses {
  /** SafeDelayManager P2SH32 registry contract address. Empty string = not deployed. */
  safeDelayManager: string;
  /** Service Provider PKH used when deploying the manager (for UI hint). */
  serviceProviderPkh: string;
}

// SP PKH derived from wallet address: bitcoincash:qqhsm5etvc47ejepu2mjaqg6trmqt08ntuhsea7xa5
// Run: node scripts/deploy-manager.mjs --sp-pkh 2f0dd32b662beccb21e2b72e811a58f605bcf35f --network mainnet
export const CONTRACT_ADDRESSES: Record<'mainnet' | 'chipnet' | 'testnet', NetworkAddresses> = {
  mainnet: {
    safeDelayManager: 'bitcoincash:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca',
    serviceProviderPkh: '2f0dd32b662beccb21e2b72e811a58f605bcf35f',
  },
  chipnet: {
    safeDelayManager: 'bchtest:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca',
    serviceProviderPkh: '2f0dd32b662beccb21e2b72e811a58f605bcf35f',
  },
  testnet: {
    safeDelayManager: '',
    serviceProviderPkh: '',
  },
};

/**
 * Get the SafeDelayManager address for the given network.
 * Returns empty string if not deployed.
 */
export function getManagerAddress(network: 'mainnet' | 'chipnet' | 'testnet'): string {
  return CONTRACT_ADDRESSES[network]?.safeDelayManager ?? '';
}

/**
 * Get the service provider PKH for the given network.
 */
export function getServiceProviderPkh(network: 'mainnet' | 'chipnet' | 'testnet'): string {
  return CONTRACT_ADDRESSES[network]?.serviceProviderPkh ?? '';
}

/**
 * Returns true if the SafeDelayManager is deployed on the given network.
 */
export function isManagerDeployed(network: 'mainnet' | 'chipnet' | 'testnet'): boolean {
  const addr = getManagerAddress(network);
  return addr.length > 0 && !addr.startsWith('TODO');
}
