/**
 * SafeDelay_NFT Contract Wrapper
 *
 * A time-locked wallet designed for NFT holders.
 * Allows depositing BCH onto NFTs with time-locked withdrawals.
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
 * SafeDelay_NFT: Time-locked wallet for NFTs
 *
 * Features:
 * - 🎨 Deposit BCH onto NFTs
 * - ⏱️ Time-locked withdrawals (initial blockDelay applies)
 * - 🔓 Extend lock period
 * - 🚨 Emergency withdraw without delay
 * - 🔐 Recover to cold storage
 */
export class SafeDelay_NFT {
    contract = null;
    network;
    provider;
    config = null;
    constructor(network = 'mainnet') {
        this.network = network;
        this.provider = new ElectrumNetworkProvider(toNetwork(network));
    }
    connect(artifact, config) {
        this.contract = new Contract(artifact, [
            config.userPublicKeyHash,
            config.emergencyPublicKeyHash,
            config.recoverPublicKeyHash,
            config.blockDelay,
        ], { provider: this.provider });
        this.config = config;
    }
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
     * Deposit BCH onto a new NFT
     * @param depositorKey - WIF private key of depositor
     */
    async deposit(depositorKey) {
        this.requireConnected();
        const depositor = new SignatureTemplate(depositorKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .deposit(depositor)
            .send();
        return tx.txid;
    }
    /**
     * Extend the lock period
     * @param userKey - WIF private key of user
     * @param additionalBlocks - Additional blocks to add
     */
    async extend(userKey, additionalBlocks) {
        this.requireConnected();
        const user = new SignatureTemplate(userKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .extend(user, additionalBlocks)
            .send();
        return tx.txid;
    }
    /**
     * Start the withdrawal process
     * @param userKey - WIF private key of user
     */
    async startWithdraw(userKey) {
        this.requireConnected();
        const user = new SignatureTemplate(userKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .startWithdraw(user)
            .send();
        return tx.txid;
    }
    /**
     * Withdraw funds after lock expires
     * @param userKey - WIF private key of user
     * @param amount - Amount in satoshis
     */
    async withdraw(userKey, amount) {
        this.requireConnected();
        const user = new SignatureTemplate(userKey);
        const currentBlock = await this.provider.getBlockHeight();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .withdraw(user, amount)
            .from(await this.contract.getUtxos())
            .to(this.config.userPublicKeyHash, amount)
            .withTime(currentBlock)
            .send();
        return tx.txid;
    }
    /**
     * Emergency withdraw without time lock
     * @param userKey - WIF private key of user
     * @param emergencyAddress - Emergency address to send funds
     */
    async emergencyWithdraw(userKey, emergencyAddress) {
        this.requireConnected();
        const user = new SignatureTemplate(userKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .emergencyWithdraw(user, emergencyAddress)
            .send();
        return tx.txid;
    }
    /**
     * Recover funds to cold storage (no timelock)
     * @param userKey - WIF private key of user
     * @param coldAddress - Cold storage address
     */
    async recover(userKey, coldAddress) {
        this.requireConnected();
        const user = new SignatureTemplate(userKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .recover(user, coldAddress)
            .send();
        return tx.txid;
    }
    async getCurrentBlock() {
        return this.provider.getBlockHeight();
    }
    getConfig() {
        return this.config;
    }
    requireConnected() {
        if (!this.contract) {
            throw new Error('SafeDelay_NFT not connected. Call connect() or connectFromPath() first.');
        }
    }
}
//# sourceMappingURL=SafeDelay_NFT.js.map