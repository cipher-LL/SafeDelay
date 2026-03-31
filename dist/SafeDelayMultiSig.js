/**
 * SafeDelayMultiSig Contract Wrapper
 *
 * A multi-signature time-locked wallet requiring M-of-N signatures.
 * Supports extend and cancel operations.
 */
import { readFileSync } from 'fs';
import { Contract, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { Network } from 'cashscript/dist/interfaces.js';
function toNetwork(network) {
    switch (network) {
        case 'mainnet': return Network.MAINNET;
        case 'testnet3': return Network.TESTNET3;
        case 'testnet4': return Network.TESTNET4;
        case 'chipnet': return Network.CHIPNET;
        case 'mocknet': return Network.MOCKNET;
        case 'regtest': return Network.REGTEST;
        default: return Network.MAINNET;
    }
}
export class SafeDelayMultiSig {
    contract = null;
    network;
    provider;
    config = null;
    constructor(network = 'mainnet') {
        this.network = network;
        this.provider = new ElectrumNetworkProvider(toNetwork(network));
    }
    /**
     * Connect to an existing SafeDelayMultiSig contract
     * @param artifact - SafeDelayMultiSig artifact
     * @param config - Contract configuration (publicKeyHashes, requiredSignatures, lockEndBlock)
     */
    connect(artifact, config) {
        this.contract = new Contract(artifact, [config.publicKeyHashes, config.requiredSignatures, config.lockEndBlock], { provider: this.provider });
        this.config = config;
    }
    /**
     * Connect using a path to the artifact JSON file
     */
    connectFromPath(artifactPath, config) {
        const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
        this.connect(artifact, config);
    }
    getAddress() {
        this.requireConnected();
        return this.contract.address;
    }
    async getBalance() {
        this.requireConnected();
        const utxos = await this.contract.getUtxos();
        return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
    }
    async getUtxos() {
        this.requireConnected();
        return this.contract.getUtxos();
    }
    /**
     * Deposit funds (anyone can deposit)
     * @param depositorKey - WIF private key of depositor
     * @param amount - Amount in satoshis
     */
    async deposit(depositorKey, amount) {
        this.requireConnected();
        const depositor = new SignatureTemplate(depositorKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .deposit(depositor, depositor)
            .to(this.getAddress(), amount)
            .send();
        return tx.txid;
    }
    /**
     * Withdraw funds (requires M-of-N signatures)
     * @param keys - Array of WIF private keys (M or more)
     * @param amount - Amount in satoshis
     * @param recipientAddress - Optional recipient
     */
    async withdraw(keys, amount, recipientAddress) {
        this.requireConnected();
        const recipient = recipientAddress || this.getAddress();
        const sigs = keys.map(k => new SignatureTemplate(k));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .withdraw(sigs, sigs, amount)
            .from(await this.contract.getUtxos())
            .to(recipient, amount)
            .send();
        return tx.txid;
    }
    /**
     * Extend the lock period
     * @param keys - Array of WIF private keys (M or more)
     * @param newLockEndBlock - New lock expiration block
     */
    async extend(keys, newLockEndBlock) {
        this.requireConnected();
        const sigs = keys.map(k => new SignatureTemplate(k));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .extend(sigs, sigs, newLockEndBlock)
            .send();
        return tx.txid;
    }
    /**
     * Cancel and refund (requires M-of-N signatures)
     * @param keys - Array of WIF private keys (M or more)
     */
    async cancel(keys) {
        this.requireConnected();
        const sigs = keys.map(k => new SignatureTemplate(k));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .cancel(sigs, sigs)
            .send();
        return tx.txid;
    }
    async isLockExpired() {
        this.requireConnected();
        const currentBlock = await this.provider.getBlockHeight();
        return currentBlock >= this.config.lockEndBlock;
    }
    async getRemainingBlocks() {
        this.requireConnected();
        const currentBlock = await this.provider.getBlockHeight();
        return Math.max(0, this.config.lockEndBlock - currentBlock);
    }
    async getCurrentBlock() {
        return this.provider.getBlockHeight();
    }
    getConfig() {
        return this.config;
    }
    requireConnected() {
        if (!this.contract) {
            throw new Error('SafeDelayMultiSig not connected. Call connect() or connectFromPath() first.');
        }
    }
}
//# sourceMappingURL=SafeDelayMultiSig.js.map