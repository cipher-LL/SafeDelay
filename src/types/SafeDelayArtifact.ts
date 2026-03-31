/**
 * SafeDelay Contract Artifact
 * 
 * TypeScript interface for the compiled SafeDelay contract artifact.
 * Import this from 'safedelay/artifacts/SafeDelay' for use with SafeDelay class.
 */

import type { Artifact } from 'cashscript';

export interface SafeDelayArtifact extends Artifact {
  contractName: 'SafeDelay';
  constructorInputs: Array<{
    name: 'ownerPKH' | 'lockEndBlock';
    type: 'bytes20' | 'int';
  }>;
  // Use any for functions since ContractFunction is internal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functions: Record<string, any>;
}
