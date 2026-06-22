/**
 * Contract Verification Utility for SafeDelay
 *
 * Verifies on-chain contract code matches the compiled artifact.
 * Browser-compatible: does not use Node.js modules.
 */

import { debug } from './utils/debug';

/**
 * Map of artifact names to their resolved artifact modules.
 * Add new artifacts here as they are created.
 */
const ARTIFACT_MODULES: Record<string, object> = {
  SafeDelay: { __esModule: true },
  SafeDelayMultiSig: { __esModule: true },
};

/**
 * Dynamically load a contract artifact by name.
 * Artifacts must be registered in ARTIFACT_MODULES or bundled separately.
 *
 * @param name - Artifact name (e.g. 'SafeDelay', 'SafeDelayMultiSig')
 * @returns The artifact object
 */
export async function loadArtifact(name: string): Promise<object> {
  const mod = ARTIFACT_MODULES[name];
  if (mod) return mod;
  // Attempt dynamic import from standard artifact location
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await import(`../artifacts/${name}.artifact.json`);
  } catch {
    throw new Error(`Artifact '${name}' not found. Register it in ARTIFACT_MODULES or ensure the artifact file exists at artifacts/${name}.artifact.json`);
  }
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
 * @param artifact - The compiled artifact (with debug.bytecode)
 * @returns Verification result
 */
export function verifyBytecode(onChainBytecode: string, artifact: { debug?: { bytecode?: string }; bytecode?: string }): {
  verified: boolean;
  message: string;
  artifactBytecode?: string;
  onChainBytecode?: string;
} {
  // debug.bytecode is the canonical bytecode for verification
  const artifactBytecode = normalizeBytecode(artifact.debug?.bytecode ?? artifact.bytecode ?? '');
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
      method: 'get_address',
      params: [address]
    })
  });

  const result = await response.json() as { error?: { message: string }; result?: { script?: string } };

  if (result.error) {
    throw new Error(`Electrum error: ${result.error.message}`);
  }

  // Script is returned as result.result.script (get_address returns { script: string })
  return result.result?.script ?? '';
}

/**
 * Full verification: fetch on-chain and compare with artifact
 *
 * @param address - Contract address to verify
 * @param artifact - The compiled artifact object (with debug.bytecode)
 * @param electrumUrl - Optional Electrum URL
 * @returns Verification result
 */
export async function verifyContract(
  address: string,
  artifact: { debug?: { bytecode?: string }; bytecode?: string },
  electrumUrl?: string
): Promise<{
  verified: boolean;
  message: string;
  address?: string;
}> {
  debug.log(`Verifying contract at address: ${address}`);

  // Fetch on-chain script
  debug.log(`Fetching contract script from blockchain...`);
  const onChainScript = await fetchContractScript(address, electrumUrl);

  // Compare bytecode
  const result = verifyBytecode(onChainScript, artifact);

  return {
    verified: result.verified,
    message: result.message,
    address
  };
}