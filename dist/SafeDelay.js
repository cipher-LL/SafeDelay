/**
 * SafeDelay Contract Wrapper
 *
 * Time-locked wallet where funds are locked until a specified block height.
 * The owner can extend the lock at any time, but cannot shorten it.
 * After the lock expires, the owner can withdraw freely.
 *
 * @example
 * ```typescript
 * import { SafeDelay } from 'safedelay';
 *
 * const safeDelay = new SafeDelay({ network: 'mainnet' });
 * safeDelay.connect(artifact, {
 *   ownerPublicKeyHash: '...',
 *   lockEndBlock: 850000
 * });
 *
 * // Check if lock has expired
 * const expired = await safeDelay.isLockExpired();
 *
 * // Withdraw after lock expires
 * if (expired) {
 *   const txid = await safeDelay.withdraw(ownerKey, 100000n);
 * }
 * ```
 */
import { readFileSync } from 'fs';
import { Contract, SignatureTemplate, ElectrumNetworkProvider, TransactionBuilder } from 'cashscript';
import { Network } from 'cashscript/dist/interfaces.js';
/**
 * SafeDelay: Simple time-locked wallet contract
 *
 * Features:
 * - ⏱️ Time-locked withdrawals (funds locked until block height)
 * - 💰 Flexible deposits (anyone can deposit)
 * - 🔓 Extend lock (owner can extend at any time)
 * - 🚫 Cancel (owner can cancel and refund everything)
 */
export class SafeDelay {
    contract = null;
    network;
    provider;
    config = null;
    /**
     * Create a new SafeDelay wrapper instance
     * @param options - Configuration options
     */
    constructor(options = {}) {
        const network = options.network ?? 'mainnet';
        this.network = network;
        this.provider = new ElectrumNetworkProvider(toNetwork(network));
    }
    /**
     * Connect to an existing SafeDelay contract on-chain
     * @param artifact - SafeDelay artifact (can be imported from 'safedelay/artifacts/SafeDelay')
     * @param config - Contract configuration (ownerPKH, lockEndBlock)
     */
    connect(artifact, config) {
        this.contract = new Contract(artifact, [config.ownerPublicKeyHash, config.lockEndBlock], { provider: this.provider });
        this.config = config;
    }
    /**
     * Connect using a path to the artifact JSON file
     * @param artifactPath - Path to SafeDelay.artifact.json
     * @param config - Contract configuration
     */
    connectFromPath(artifactPath, config) {
        const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
        this.connect(artifact, config);
    }
    /**
     * Get the contract's P2PKH address
     */
    getAddress() {
        this.requireConnected();
        return this.contract.address;
    }
    /**
     * Get total balance held by the contract
     */
    async getBalance() {
        this.requireConnected();
        const utxos = await this.contract.getUtxos();
        return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
    }
    /**
     * Get all UTXOs held by the contract
     */
    async getUtxos() {
        this.requireConnected();
        return this.contract.getUtxos();
    }
    /**
     * Deposit funds into the contract (anyone can deposit)
     * @param depositorKey - WIF private key of depositor
     * @param amount - Amount in satoshis
     * @param recipientAddress - Optional recipient (defaults to contract address)
     * @returns Transaction details
     */
    async deposit(depositorKey, amount, recipientAddress) {
        this.requireConnected();
        const depositor = new SignatureTemplate(depositorKey);
        const recipient = recipientAddress || this.getAddress();
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.deposit(depositor, depositor))
            .addOutput({ to: recipient, amount });
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Extend the lock period (one-way, can only increase)
     * @param ownerKey - WIF private key of owner
     * @param newLockEndBlock - New lock expiration block (must be > current)
     * @returns Transaction details
     */
    async extend(ownerKey, newLockEndBlock) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.extend(owner, newLockEndBlock));
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Start the withdrawal process (sets a flag, actual withdraw comes after)
     * @param ownerKey - WIF private key of owner
     * @returns Transaction details
     */
    async startWithdraw(ownerKey) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.startWithdraw(owner));
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Withdraw funds from the contract (after lock + startWithdraw)
     * @param ownerKey - WIF private key of owner
     * @param amount - Amount in satoshis
     * @param recipientAddress - Optional recipient (defaults to owner from key)
     * @returns Transaction details
     */
    async withdraw(ownerKey, amount, recipientAddress) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        const recipient = recipientAddress || this.getAddress();
        const currentBlock = await this.provider.getBlockHeight();
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.withdraw(owner, amount))
            .addOutput({ to: recipient, amount })
            .setLocktime(currentBlock);
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Emergency withdraw without time lock (to emergency address)
     * @param ownerKey - WIF private key of owner
     * @param recipientAddress - Emergency address to send funds
     * @returns Transaction details
     */
    async emergencyWithdraw(ownerKey, recipientAddress) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.emergencyWithdraw(owner, recipientAddress));
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Recover funds to cold storage address (no timelock)
     * @param ownerKey - WIF private key of owner
     * @param recipientAddress - Cold storage address
     * @returns Transaction details
     */
    async recover(ownerKey, recipientAddress) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.recover(owner, recipientAddress));
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Cancel the contract and refund all funds to owner
     * @param ownerKey - WIF private key of owner
     * @returns Transaction details
     */
    async cancel(ownerKey) {
        this.requireConnected();
        const owner = new SignatureTemplate(ownerKey);
        const utxos = await this.contract.getUtxos();
        const txBuilder = new TransactionBuilder({ provider: this.provider });
        txBuilder
            .addInput(utxos[0], this.contract.unlock.cancel(owner));
        const result = await txBuilder.send();
        return { txid: result.txid };
    }
    /**
     * Check if the lock period has expired
     */
    async isLockExpired() {
        this.requireConnected();
        const currentBlock = await this.provider.getBlockHeight();
        return currentBlock >= this.config.lockEndBlock;
    }
    /**
     * Get remaining blocks until lock expires
     */
    async getRemainingBlocks() {
        this.requireConnected();
        const currentBlock = await this.provider.getBlockHeight();
        return Math.max(0, this.config.lockEndBlock - currentBlock);
    }
    /**
     * Get the current block height
     */
    async getCurrentBlock() {
        return this.provider.getBlockHeight();
    }
    /**
     * Get the contract configuration
     */
    getConfig() {
        return this.config;
    }
    requireConnected() {
        if (!this.contract) {
            throw new Error('SafeDelay not connected. Call connect() or connectFromPath() first.');
        }
    }
}
/**
 * Calculate the lock end block from a date
 * @param targetDate - Date when lock should expire
 * @param network - Network to check current block from
 * @returns Block height estimate
 */
export async function calculateLockEndBlockFromDate(targetDate, network = 'mainnet') {
    const provider = new ElectrumNetworkProvider(toNetwork(network));
    const blocksPerDay = 144;
    const currentBlock = await provider.getBlockHeight();
    const now = Date.now();
    const targetTime = targetDate.getTime();
    const daysRemaining = (targetTime - now) / (1000 * 60 * 60 * 24);
    return currentBlock + Math.ceil(daysRemaining * blocksPerDay);
}
/**
 * Calculate lock end block from days from now
 * @param days - Number of days to lock
 * @param currentBlock - Current block height (optional, will fetch if not provided)
 * @param network - Network to check current block from
 */
export async function calculateLockEndBlockFromDays(days, currentBlock, network = 'mainnet') {
    if (currentBlock === undefined) {
        const provider = new ElectrumNetworkProvider(toNetwork(network));
        currentBlock = await provider.getBlockHeight();
    }
    return currentBlock + (days * 144);
}
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
//# sourceMappingURL=SafeDelay.js.map