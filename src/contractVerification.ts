/**
 * Contract Verification Utility for SafeDelay
 * 
 * Verifies on-chain contract code matches the compiled artifact.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { debug } from './utils/debug';

/**
 * Load contract artifact by name
 */
export function loadArtifact(contractName: string): any {
  const artifactPath = path.join(__dirname, 'artifacts', `${contractName}.artifact.json`);
  return JSON.parse(readFileSync(artifactPath, 'utf8'));
}

/**
 * Normalize bytecode for comparison (remove whitespace, lowercase)
 */
export function normalizeBytecode(bytecode: string): string {
  return bytecode.replace(/\s+/g, '').toLowerCase();
}

/**
 * Verify contract bytecode against artifact
 * 
 * @param onChainBytecode - The bytecode fetched from the blockchain
 * @param artifact - The compiled artifact
 * @returns Verification result
 */
export function verifyBytecode(onChainBytecode: string, artifact: any): {
  verified: boolean;
  message: string;
  artifactBytecode?: string;
  onChainBytecode?: string;
} {
  // debug.bytecode is the canonical bytecode for verification
  const artifactBytecode = normalizeBytecode(artifact.debug?.bytecode ?? artifact.bytecode);
  const chainBytecode = normalizeBytecode(onChainBytecode);
  
  if (artifactBytecode === chainBytecode) {
    return {
      verified: true,
      message: 'Contract verified successfully - bytecode matches artifact!'
    };
  }
  
  return {
    verified: false,
    message: 'Contract verification FAILED - bytecode does not match artifact!',
    artifactBytecode: artifact.bytecode,
    onChainBytecode: onChainBytecode
  };
}

/**
 * Fetch contract script from Electrum server
 * 
 * @param address - Contract address
 * @param electrumUrl - Electrum server URL
 * @returns Contract script bytecode
 */
export async function fetchContractScript(
  address: string,
  electrumUrl: string = 'https://electrumx.lifestone.cash'
): Promise<string> {
  const response = await fetch(electrumUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 0,
      method: 'get_address_script',
      params: [address]
    })
  });
  
  const result = await response.json() as { error?: { message: string }; result?: string };
  
  if (result.error) {
    throw new Error(`Electrum error: ${result.error.message}`);
  }
  
  // Script is returned as hex
  return result.result ?? '';
}

/**
 * Full verification: fetch on-chain and compare with artifact
 * 
 * @param address - Contract address to verify
 * @param contractName - Name of the contract (e.g., 'SafeDelay')
 * @param electrumUrl - Optional Electrum URL
 * @returns Verification result
 */
export async function verifyContract(
  address: string,
  contractName: string,
  electrumUrl?: string
): Promise<{
  verified: boolean;
  message: string;
  contractName?: string;
  address?: string;
}> {
  debug.log(`Verifying ${contractName} at address: ${address}`);
  
  // Load artifact
  const artifact = loadArtifact(contractName);
  debug.log(`Loaded artifact: ${artifact.contractName}`);
  
  // Fetch on-chain script
  debug.log(`Fetching contract script from blockchain...`);
  const onChainScript = await fetchContractScript(address, electrumUrl);
  
  // Compare bytecode
  const result = verifyBytecode(onChainScript, artifact);
  
  return {
    verified: result.verified,
    message: result.message,
    contractName: artifact.contractName || contractName,
    address
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: ts-node verify-contract.ts <contract-name> <address> [electrum-url]');
    console.log('Example: ts-node verify-contract.ts SafeDelay qpkq5...');
    process.exit(1);
  }
  
  const [contractName, address, electrumUrl] = args;
  
  verifyContract(address, contractName, electrumUrl)
    .then(result => {
      console.log('\n--- Verification Result ---');
      console.log(`Status: ${result.verified ? '✅ VERIFIED' : '❌ FAILED'}`);
      console.log(`Message: ${result.message}`);
      if (result.contractName) console.log(`Contract: ${result.contractName}`);
      console.log(`Address: ${result.address}`);
      process.exit(result.verified ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}