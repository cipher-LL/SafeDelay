/**
 * SafeDelayStreaming Contract Artifact
 * 
 * TypeScript interface for the compiled SafeDelayStreaming contract artifact.
 * Import this from 'safedelay/artifacts/SafeDelayStreaming'.
 */

import type { Artifact } from 'cashscript';

export interface SafeDelayStreamingArtifact extends Artifact {
  contractName: 'SafeDelayStreaming';
  constructorInputs: Array<{
    name: string;
    type: string;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functions: Record<string, any>;
}
