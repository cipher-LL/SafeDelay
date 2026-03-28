/**
 * Contract Verification Utility for SafeDelay
 *
 * Verifies on-chain contract code matches the compiled artifact.
 */
/**
 * Load contract artifact by name
 */
export declare function loadArtifact(contractName: string): any;
/**
 * Normalize bytecode for comparison (remove whitespace, lowercase)
 */
export declare function normalizeBytecode(bytecode: string): string;
/**
 * Verify contract bytecode against artifact
 *
 * @param onChainBytecode - The bytecode fetched from the blockchain
 * @param artifact - The compiled artifact
 * @returns Verification result
 */
export declare function verifyBytecode(onChainBytecode: string, artifact: any): {
    verified: boolean;
    message: string;
    artifactBytecode?: string;
    onChainBytecode?: string;
};
/**
 * Fetch contract script from Electrum server
 *
 * @param address - Contract address
 * @param electrumUrl - Electrum server URL
 * @returns Contract script bytecode
 */
export declare function fetchContractScript(address: string, electrumUrl?: string): Promise<string>;
/**
 * Full verification: fetch on-chain and compare with artifact
 *
 * @param address - Contract address to verify
 * @param contractName - Name of the contract (e.g., 'SafeDelay')
 * @param electrumUrl - Optional Electrum URL
 * @returns Verification result
 */
export declare function verifyContract(address: string, contractName: string, electrumUrl?: string): Promise<{
    verified: boolean;
    message: string;
    contractName?: string;
    address?: string;
}>;
//# sourceMappingURL=contractVerification.d.ts.map