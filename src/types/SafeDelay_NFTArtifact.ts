/**
 * SafeDelay_NFT Contract Artifact
 * 
 * TypeScript interface for the compiled SafeDelay_NFT contract artifact.
 * Import this from 'safedelay/artifacts/SafeDelay_NFT'.
 */

import type { Artifact } from 'cashscript';

export interface SafeDelay_NFTArtifact extends Artifact {
  contractName: 'SafeDelay_NFT';
  constructorInputs: Array<{
    name: string;
    type: string;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functions: Record<string, any>;
}
