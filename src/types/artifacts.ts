// Type declarations for CashScript contract artifacts

export interface ContractArtifact {
  contractName: string;
  constructorInputs: Array<{ name: string; type: string }>;
  abi: Array<{
    name: string;
    inputs: Array<{ name: string; type: string }>;
  }>;
  bytecode: string;
  source: string;
}

export type SafeDelayArtifact = ContractArtifact;
export type SafeDelayMultiSigArtifact = ContractArtifact;
export type SafeDelayStreamingArtifact = ContractArtifact;
export type SafeDelay_NFTArtifact = ContractArtifact;
export type CrowdFundArtifact = ContractArtifact;
export type SocialRecoveryArtifact = ContractArtifact;
