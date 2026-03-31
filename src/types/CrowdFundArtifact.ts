/**
 * CrowdFund Contract Artifact
 * 
 * TypeScript interface for the compiled CrowdFund contract artifact.
 * Import this from 'safedelay/artifacts/CrowdFund'.
 */

import type { Artifact } from 'cashscript';

export interface CrowdFundArtifact extends Artifact {
  contractName: 'CrowdFund';
  constructorInputs: Array<{
    name: 'creatorPkh' | 'fundingGoal' | 'deadline';
    type: 'bytes20' | 'int';
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functions: Record<string, any>;
}
