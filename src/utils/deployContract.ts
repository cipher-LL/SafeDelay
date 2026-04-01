/**
 * SafeDelay contract deployment utilities (browser-compatible)
 * 
 * Uses static artifact imports (bundled by Vite) instead of fs reads.
 */

import { Contract, ElectrumNetworkProvider, Network } from 'cashscript';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';

// Map our network strings to CashScript Network type
function toCashScriptNetwork(network: string): Network {
  switch (network) {
    case 'mainnet':
      return Network.MAINNET;
    case 'testnet':
      return Network.TESTNET3;
    case 'chipnet':
      return Network.CHIPNET;
    default:
      return Network.TESTNET3;
  }
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

// Fallback block heights when Electrum is unavailable
function getHardcodedBlockHeight(network: string): number {
  switch (network) {
    case 'mainnet':
      return 870000;
    case 'testnet':
      return 2500000;
    case 'chipnet':
    default:
      return 100000;
  }
}

/**
 * Fetch current block height from Electrum network.
 * Falls back to hardcoded estimate if Electrum is unavailable.
 */
async function fetchCurrentBlockHeight(network: 'mainnet' | 'testnet' | 'chipnet'): Promise<number> {
  try {
    const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
    const blockHeight = await provider.getBlockHeight();
    return Number(blockHeight);
  } catch {
    return getHardcodedBlockHeight(network);
  }
}

// Deploy a SafeDelay contract
export async function deploySafeDelay(options: DeployOptions): Promise<DeployResult> {
  const { ownerPubkeyHash, lockEndBlock, network } = options;
  
  const currentBlockHeight = await fetchCurrentBlockHeight(network);
  const actualLockEndBlock = currentBlockHeight + lockEndBlock;
  
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
  
  const contract = new Contract(
    SafeDelayArtifact as any,
    [
      ownerPubkeyHash,
      BigInt(actualLockEndBlock),
    ],
    { provider } as any
  );
  
  return {
    contractAddress: contract.address,
    contract,
    actualLockEndBlock,
  };
}

// Interface for multi-sig deployment options
export interface DeployMultiSigOptions {
  owner1Pkh: string;
  owner2Pkh: string;
  owner3Pkh: string;
  threshold: number;
  lockEndBlock: number;
  network: 'mainnet' | 'testnet' | 'chipnet';
}

// Deploy a SafeDelayMultiSig contract
export async function deploySafeDelayMultiSig(options: DeployMultiSigOptions): Promise<DeployResult> {
  const { owner1Pkh, owner2Pkh, owner3Pkh, threshold, lockEndBlock, network } = options;

  const currentBlockHeight = await fetchCurrentBlockHeight(network);
  const actualLockEndBlock = currentBlockHeight + lockEndBlock;

  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

  const contract = new Contract(
    SafeDelayMultiSigArtifact as any,
    [
      owner1Pkh,
      owner2Pkh,
      owner3Pkh,
      BigInt(threshold),
      BigInt(actualLockEndBlock),
    ],
    { provider } as any
  );

  return {
    contractAddress: contract.address,
    contract,
    actualLockEndBlock,
  };
}

// Get contract instance from existing address (for interacting with deployed contract)
export function getSafeDelayContract(
  _address: string,
  ownerPubkeyHash: string,
  lockEndBlock: number,
  _network: 'mainnet' | 'testnet' | 'chipnet',
  provider?: ElectrumNetworkProvider
) {
  return new Contract(SafeDelayArtifact as any, [ownerPubkeyHash, BigInt(lockEndBlock)], {
    provider,
  } as any);
}

// Helper: Convert a BCH address to pubkey hash (browser-compatible)
export async function addressToPubkeyHash(address: string): Promise<string> {
  const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');

  const addr = address.trim();
  const cashPrefixMatch = addr.match(/^(bitcoincash:|bchtest:|bchreg:)/i);
  const addrToDecode = cashPrefixMatch ? addr : `bitcoincash:${addr}`;

  try {
    const result = cashAddressToLockingBytecode(addrToDecode);
    if (typeof result !== 'string' && result && result.bytecode) {
      const bytecodeArr = Array.from(result.bytecode);
      // P2PKH: [OP_DUP, OP_HASH160, 0x14, <20-byte PKH>, OP_EQUALVERIFY, OP_CHECKSIG]
      if (bytecodeArr[1] === 0xa9 && bytecodeArr[0] === 0x76 && bytecodeArr[22] === 0x88) {
        const pkh = bytecodeArr.slice(2, 22);
        return (pkh as number[]).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      // P2SH: [OP_HASH160, 0x14, <20-byte hash>, OP_EQUAL]
      if (bytecodeArr[0] === 0xa9 && bytecodeArr[22] === 0x87) {
        const hash = bytecodeArr.slice(2, 22);
        return (hash as number[]).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    }
  } catch {
    // Fall through to error
  }

  throw new Error(`Could not decode BCH address: ${address}`);
}
