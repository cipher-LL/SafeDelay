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
    functions: Record<string, any>;
}
//# sourceMappingURL=SafeDelayArtifact.d.ts.map