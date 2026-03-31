/**
 * SafeDelayStreaming Contract Wrapper
 *
 * A streaming time-lock that releases funds gradually over time.
 * The recipient can claim released funds at any time, and the creator can cancel to refund.
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
/**
 * SafeDelayStreaming: Gradual fund release over time
 *
 * Features:
 * - 💰 Creator funds the contract with a total amount
 * - 📈 Funds release incrementally based on releaseInterval
 * - 🎁 Recipient can claim released (but unclaimed) funds at any time
 * - 🚫 Creator can cancel to refund unclaimed funds
 */
export class SafeDelayStreaming {
    contract = null;
    network;
    provider;
    config = null;
    constructor(network = 'mainnet') {
        this.network = network;
        this.provider = new ElectrumNetworkProvider(toNetwork(network));
    }
    /**
     * Connect to an existing SafeDelayStreaming contract
     * @param artifact - SafeDelayStreaming artifact
     * @param config - Contract configuration
     */
    connect(artifact, config) {
        this.contract = new Contract(artifact, [
            config.creatorPublicKeyHash,
            config.recipientPublicKeyHash,
            config.lockEndBlock,
            config.releaseInterval,
            config.numReleases,
            config.totalAmount,
        ], { provider: this.provider });
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
     * Claim released funds
     * @param recipientKey - WIF private key of recipient
     * @param amount - Amount in satoshis to claim
     * @returns Transaction ID
     */
    async claim(recipientKey, amount) {
        this.requireConnected();
        const recipient = new SignatureTemplate(recipientKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .claim(recipient, amount)
            .from(await this.contract.getUtxos())
            .to(this.config.recipientPublicKeyHash, amount)
            .withTime(this.config.lockEndBlock)
            .send();
        return tx.txid;
    }
    /**
     * Cancel and refund unclaimed funds to creator
     * @param creatorKey - WIF private key of creator
     * @returns Transaction ID
     */
    async cancel(creatorKey) {
        this.requireConnected();
        const creator = new SignatureTemplate(creatorKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .cancel(creator)
            .send();
        return tx.txid;
    }
    /**
     * Extend the streaming period
     * @param creatorKey - WIF private key of creator
     * @param newLockEndBlock - New lock end block
     */
    async extend(creatorKey, newLockEndBlock) {
        this.requireConnected();
        const creator = new SignatureTemplate(creatorKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .extend(creator, newLockEndBlock)
            .send();
        return tx.txid;
    }
    /**
     * Calculate how much has been released so far
     */
    async getReleasedAmount() {
        this.requireConnected();
        const currentBlock = await this.provider.getBlockHeight();
        if (currentBlock < this.config.lockEndBlock)
            return 0n;
        const blocksSinceStart = currentBlock - this.config.lockEndBlock;
        const releasesElapsed = Math.floor(blocksSinceStart / this.config.releaseInterval);
        const actualReleases = Math.min(releasesElapsed, this.config.numReleases);
        return BigInt(this.config.totalAmount) * BigInt(actualReleases) / BigInt(this.config.numReleases);
    }
    /**
     * Get remaining unclaimed amount
     */
    async getUnclaimedAmount() {
        this.requireConnected();
        const released = await this.getReleasedAmount();
        const balance = await this.getBalance();
        return released - (balance < released ? 0n : balance - released);
    }
    async getCurrentBlock() {
        return this.provider.getBlockHeight();
    }
    getConfig() {
        return this.config;
    }
    requireConnected() {
        if (!this.contract) {
            throw new Error('SafeDelayStreaming not connected. Call connect() or connectFromPath() first.');
        }
    }
}
//# sourceMappingURL=SafeDelayStreaming.js.map