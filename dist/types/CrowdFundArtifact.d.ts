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
    functions: Record<string, any>;
}
//# sourceMappingURL=CrowdFundArtifact.d.ts.map