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

export const CONTRACT_ADDRESSES: Record<'mainnet' | 'chipnet' | 'testnet', NetworkAddresses> = {
  mainnet: {
    // TODO: Deploy SafeDelayManager to mainnet and fill this in.
    // Run: node scripts/deploy-manager.mjs --sp-pkh <your_pkh> --network mainnet
    safeDelayManager: '',
    serviceProviderPkh: '',
  },
  chipnet: {
    // TODO: Deploy SafeDelayManager to chipnet and fill this in.
    // Run: node scripts/deploy-manager.mjs --sp-pkh <your_pkh> --network chipnet
    safeDelayManager: '',
    serviceProviderPkh: '',
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
