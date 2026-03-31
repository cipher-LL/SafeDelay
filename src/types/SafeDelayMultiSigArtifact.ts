/**
 * SafeDelayMultiSig Contract Artifact
 * 
 * TypeScript interface for the compiled SafeDelayMultiSig contract artifact.
 * Import this from 'safedelay/artifacts/SafeDelayMultiSig'.
 */

import type { Artifact } from 'cashscript';

export interface SafeDelayMultiSigArtifact extends Artifact {
  contractName: 'SafeDelayMultiSig';
  constructorInputs: Array<{
    name: string;
    type: string;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functions: Record<string, any>;
}
