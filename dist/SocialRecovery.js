/**
 * SocialRecovery Contract Wrapper
 *
 * A SafeDelay variant that supports social recovery — allowing backup keys
 * to recover funds after a grace period if the primary owner loses access.
 *
 * NOTE: This wrapper requires the SocialRecovery.cash contract to be fixed
 * (the bytes20[5] array syntax is not valid in CashScript 0.12).
 * See src/types/SocialRecoveryArtifact.ts for details.
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
 * SocialRecovery: Time-locked wallet with social recovery
 *
 * Security model:
 * - Primary owner has full control
 * - Backup signers can propose recovery to a new owner after delay
 * - Recovery requires M-of-N backup signatures after recoveryDelay blocks
 * - Owner can cancel any pending recovery
 * - Backups cannot steal — only propose recovery
 */
export class SocialRecovery {
    contract = null;
    network;
    provider;
    config = null;
    constructor(network = 'mainnet') {
        this.network = network;
        this.provider = new ElectrumNetworkProvider(toNetwork(network));
    }
    /**
     * Connect to an existing SocialRecovery contract
     * @param artifact - SocialRecovery artifact
     * @param config - Contract configuration
     */
    connect(artifact, config) {
        const args = [
            config.ownerPublicKeyHash,
            config.newOwnerPublicKeyHash || '0'.repeat(40),
            config.recoveryStartBlock || 0,
            config.recoveryDelay,
            config.requiredSignatures,
            config.backupPKH1,
            config.backupPKH2,
            config.backupPKH3,
            config.backupPKH4 || '0'.repeat(40),
            config.backupPKH5 || '0'.repeat(40),
        ];
        this.contract = new Contract(artifact, args, { provider: this.provider });
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
     */
    async deposit(depositorKey) {
        this.requireConnected();
        const depositor = new SignatureTemplate(depositorKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .deposit(depositor, depositor)
            .send();
        return tx.txid;
    }
    /**
     * Withdraw funds (owner only)
     * @param ownerKey - WIF private key of owner
     * @param amount - Amount in satoshis
     */
    async withdraw(ownerKey, amount) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .withdraw(owner, amount)
            .from(await this.contract.getUtxos())
            .to(this.config.ownerPublicKeyHash, amount)
            .send();
        return tx.txid;
    }
    /**
     * Cancel and refund all funds (owner only)
     * @param ownerKey - WIF private key of owner
     */
    async cancel(ownerKey) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .cancel(owner)
            .send();
        return tx.txid;
    }
    /**
     * Propose recovery to a new owner (any backup signer)
     * @param backupKey - WIF private key of backup signer
     * @param newOwner - New owner public key hash
     */
    async proposeRecovery(backupKey, newOwner) {
        this.requireConnected();
        const backup = new SignatureTemplate(backupKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .proposeRecovery(backup, newOwner)
            .send();
        return tx.txid;
    }
    /**
     * Execute recovery after delay (M-of-N backups)
     * @param backupKeys - Array of WIF private keys for M backups
     */
    async executeRecovery(backupKeys) {
        this.requireConnected();
        const sigs = backupKeys.map(k => new SignatureTemplate(k));
        const currentBlock = await this.provider.getBlockHeight();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .executeRecovery(sigs, sigs)
            .from(await this.contract.getUtxos())
            .withTime(currentBlock)
            .send();
        return tx.txid;
    }
    /**
     * Cancel pending recovery (owner only)
     * @param ownerKey - WIF private key of owner
     */
    async cancelRecovery(ownerKey) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .cancelRecovery(owner)
            .send();
        return tx.txid;
    }
    /**
     * Transfer ownership directly (owner only)
     * @param ownerKey - WIF private key of current owner
     * @param newOwner - New owner public key hash
     */
    async transferOwnership(ownerKey, newOwner) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await this.contract.unlock
            .transferOwnership(owner, newOwner)
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
            throw new Error('SocialRecovery not connected. Call connect() or connectFromPath() first.');
        }
    }
}
//# sourceMappingURL=SocialRecovery.js.map