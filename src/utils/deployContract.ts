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
  actualLockEndBlock: number; // Absolute block height when lock expires
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
  console.log('  Lock ends at block:', actualLockEndBlock);
  
  // Return the contract address and actual lock end block
  return {
    contractAddress: contract.address,
    contract,
    actualLockEndBlock,
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

// Interface for multi-sig deployment options
export interface DeployMultiSigOptions {
  owner1Pkh: string; // hex string (20 bytes)
  owner2Pkh: string; // hex string (20 bytes)
  owner3Pkh: string; // hex string (20 bytes)
  threshold: number; // e.g. 2 for 2-of-3
  lockEndBlock: number;
  network: 'mainnet' | 'testnet' | 'chipnet';
}

// Deploy a SafeDelayMultiSig contract
export async function deploySafeDelayMultiSig(options: DeployMultiSigOptions): Promise<DeployResult> {
  const { owner1Pkh, owner2Pkh, owner3Pkh, threshold, lockEndBlock, network } = options;

  const currentBlockHeight = getEstimatedBlockHeight(network);
  const actualLockEndBlock = currentBlockHeight + lockEndBlock;

  const artifact = getContractArtifact('SafeDelayMultiSig');

  const contract = new Contract(
    artifact,
    [
      owner1Pkh,
      owner2Pkh,
      owner3Pkh,
      BigInt(threshold),
      BigInt(actualLockEndBlock),
    ],
    {
      // @ts-expect-error - CashScript expects network through provider
      network,
      provider: undefined,
    }
  );

  console.log('Deploying SafeDelayMultiSig contract...');
  console.log('  Owner1 PKH:', owner1Pkh);
  console.log('  Owner2 PKH:', owner2Pkh);
  console.log('  Owner3 PKH:', owner3Pkh);
  console.log('  Threshold:', threshold, 'of 3');
  console.log('  Lock ends at block:', actualLockEndBlock);
  console.log('  Contract address:', contract.address);

  return {
    contractAddress: contract.address,
    contract,
    actualLockEndBlock,
  };
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

// Helper: Convert a BCH address (legacy base58 or cashaddress format) to pubkey hash
// Supports bitcoincash: prefix or plain addresses
export async function addressToPubkeyHash(address: string): Promise<string> {
  const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');

  const addr = address.trim();

  // Try cashaddress format first (bitcoincash:, bchtest:, bchreg:)
  const cashPrefixMatch = addr.match(/^(bitcoincash:|bchtest:|bchreg:)/i);
  const addrToDecode = cashPrefixMatch ? addr : `bitcoincash:${addr}`;

  try {
    const lockingBytecode = cashAddressToLockingBytecode(addrToDecode);
    if (typeof lockingBytecode !== 'string') {
      // For P2PKH: [OP_DUP, OP_HASH160, 0x14, <20-byte PKH>, OP_EQUALVERIFY, OP_CHECKSIG]
      // bytecode[2] through bytecode[21] is the 20-byte pubkey hash
      const bytecodeArr = Array.from(lockingBytecode.bytecode);
      if (bytecodeArr[1] === 0xa9 && bytecodeArr[0] === 0x76) {
        // P2PKH format confirmed
        const pkh = bytecodeArr.slice(2, 22);
        return pkh.map(b => b.toString(16).padStart(2, '0')).join('');
      }
      // For P2SH: [OP_HASH160, 0x14, <20-byte hash>, OP_EQUAL]
      if (bytecodeArr[0] === 0xa9 && bytecodeArr[22] === 0x87) {
        const hash = bytecodeArr.slice(2, 22);
        return hash.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    }
  } catch {
    // Fall through to legacy decode
  }

  // Try legacy base58check format (for addresses starting with q, 1, etc.)
  // We need to decode base58check - let's use the bs58 package
  try {
    // Dynamic import of base-x for base58 decoding
    const { default: BaseX } = await import('base-x');
    const base58 = BaseX('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');

    const addrNoPrefix = addr.replace(/^(bitcoincash:|bchtest:|bchreg:)/i, '');
    // Legacy BCH addresses are base58check encoded
    // First try direct base58 decode + validate
    const decoded = base58.decode(addrNoPrefix);
    if (decoded.length === 25) {
      // Legacy format: [version(1) + hash(20) + checksum(4)]
      // version 0x00 = mainnet P2PKH, 0x05 = mainnet P2SH
      // version 0x6f = testnet P2PKH, 0xc4 = testnet P2SH
      const pkh = decoded.slice(1, 21);
      return Array.from(pkh).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fall through
  }

  throw new Error(`Could not decode BCH address: ${address}`);
}