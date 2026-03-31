/**
 * SocialRecovery Contract Artifact
 * 
 * TypeScript interface for the compiled SocialRecovery contract artifact.
 * Import this from 'safedelay/artifacts/SocialRecovery'.
 */

import type { Artifact } from 'cashscript';

export interface SocialRecoveryArtifact extends Artifact {
  contractName: 'SocialRecovery';
  constructorInputs: Array<{
    name: string;
    type: string;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functions: Record<string, any>;
}
