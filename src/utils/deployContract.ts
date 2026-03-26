import { Contract } from 'cashscript';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load compiled contract artifact
function getContractArtifact(contractName: string) {
  const artifactPath = resolve(__dirname, `../artifacts/${contractName}.artifact.json`);
  return JSON.parse(readFileSync(artifactPath, 'utf8'));
}

// Interface for deployment options
export interface DeployOptions {
  ownerPubkeyHash: string; // hex string (40 chars = 20 bytes)
  lockEndBlock: number;    // number of blocks from now
  network: 'mainnet' | 'testnet' | 'chipnet';
}

// Interface for deployment result
export interface DeployResult {
  contractAddress: string;
  contract: Contract;
}

// Deploy a SafeDelay contract
export async function deploySafeDelay(options: DeployOptions): Promise<DeployResult> {
  const { ownerPubkeyHash, lockEndBlock, network } = options;
  
  // Get current block height
  // In production, fetch from network; here we estimate
  const currentBlockHeight = getEstimatedBlockHeight(network);
  const actualLockEndBlock = currentBlockHeight + lockEndBlock;
  
  // Create contract instance from artifact
  const artifact = getContractArtifact('SafeDelay');
  
  const contract = new Contract(
    artifact,
    [
      ownerPubkeyHash,           // bytes20 - public key hash as hex string
      BigInt(actualLockEndBlock) // int - lock end block as BigInt
    ],
    { 
      // @ts-expect-error - CashScript expects network through provider
      network,
      // No provider needed just to generate address
      provider: undefined 
    }
  );
  
  console.log('Deploying SafeDelay contract...');
  console.log('  Owner PKH:', ownerPubkeyHash);
  console.log('  Current block:', currentBlockHeight);
  console.log('  Lock ends at block:', actualLockEndBlock);
  console.log('  Contract address:', contract.address);
  
  // Return the contract address
  return {
    contractAddress: contract.address,
    contract,
  };
}

// Get estimated block height (placeholder - would need network connection)
function getEstimatedBlockHeight(network: string): number {
  // For chipnet/testnet, return a reasonable current height
  // In production, fetch from Electrum server
  switch (network) {
    case 'mainnet':
      return 870000; // Approximate
    case 'testnet':
      return 2500000; // Approximate
    case 'chipnet':
    default:
      return 100000; // Approximate chipnet height
  }
}

// Get contract instance from existing address (for interacting with deployed contract)
// Note: This requires the original constructor arguments to work properly
export function getSafeDelayContract(
  _address: string, 
  ownerPubkeyHash: string,
  lockEndBlock: number,
  _network: 'mainnet' | 'testnet' | 'chipnet',
  provider?: any
) {
  const artifact = getContractArtifact('SafeDelay');
  return new Contract(artifact, [ownerPubkeyHash, BigInt(lockEndBlock)], { provider });
}

// Helper: Convert BCH address to pubkey hash (for form input)
export function addressToPubkeyHash(address: string): string {
  // Remove 'bitcoincash:' prefix if present
  const addr = address.replace('bitcoincash:', '');
  // For base58check addresses, the pubkey hash is bytes 1-21 of the decoded address
  // This is a simplified version - proper implementation would use base58 decode
  return addr;
}