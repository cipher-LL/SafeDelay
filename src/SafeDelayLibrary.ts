/**
 * SafeDelayLibrary - TypeScript library for SafeDelay contract
 */

import { readFileSync } from 'fs';
import { TransactionBuilder, Contract, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { Network } from 'cashscript/dist/interfaces.js';

import type { SafeDelayConfig, SafeDelayUtxo } from './types/index.js';

/**
 * Helper to convert network string to Network enum
 */
function toNetwork(network: string): Network {
  switch (network.toLowerCase()) {
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
 * SafeDelay Library Configuration
 */
export interface SafeDelayLibraryConfig {
  network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' | 'mocknet' | 'regtest';
}

/**
 * Main SafeDelay Library class
 */
export class SafeDelayLibrary {
  private contract: Contract | null = null;
  private network: Network;
  private provider: ElectrumNetworkProvider;
  private config: SafeDelayConfig | null = null;

  constructor(config: SafeDelayLibraryConfig) {
    // Convert string to Network enum
    this.network = toNetwork(config.network);

    // Use Electrum provider with default cluster (hardcoded reliable servers)
    this.provider = new ElectrumNetworkProvider(this.network);
  }

  /**
   * Connect to an existing SafeDelay contract
   * @param artifactPath Path to the compiled contract artifact
   * @param config Contract configuration (ownerPKH, lockEndBlock)
   */
  async connect(artifactPath: string, config: SafeDelayConfig): Promise<void> {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

    this.contract = new Contract(
      artifact,
      [config.ownerPublicKeyHash, config.lockEndBlock],
      { provider: this.provider }
    );
    this.config = config;
  }

  /**
   * Create a new SafeDelay contract from compiled artifact
   * @param artifactPath Path to compiled SafeDelay.artifact.json
   * @param config Contract configuration
   * @returns The contract address and details
   */
  async create(artifactPath: string, config: SafeDelayConfig): Promise<{ address: string; lockEndBlock: number }> {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

    this.contract = new Contract(
      artifact,
      [config.ownerPublicKeyHash, config.lockEndBlock],
      { provider: this.provider }
    );

    this.config = config;

    return {
      address: this.contract.address,
      lockEndBlock: config.lockEndBlock
    };
  }

  /**
   * Get contract address
   */
  getAddress(): string {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }
    return this.contract.address;
  }

  /**
   * Get the contract balance
   */
  async getBalance(): Promise<bigint> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const utxos = await this.contract.getUtxos();
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
  }

  /**
   * Get contract UTXOs
   */
  async getUtxos(): Promise<SafeDelayUtxo[]> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const utxos = await this.contract.getUtxos();
    return utxos.map(utxo => ({
      ...utxo,
      safeDelayData: {
        ownerPKH: this.config?.ownerPublicKeyHash || '',
        lockEndBlock: this.config?.lockEndBlock || 0
      }
    }));
  }

  /**
   * Deposit funds into the contract
   * @param depositorKey WIF private key of depositor
   */
  async deposit(depositorKey: string): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const depositor = new SignatureTemplate(depositorKey);

    const contractUtxos = await this.contract.getUtxos();

    if (contractUtxos.length === 0) {
      throw new Error('No UTXOs available in the contract');
    }

    // Get depositor UTXOs to fund the deposit
    const depositorUtxos = await this.provider.getUtxos(this.contract.address);

    // Find a UTXO with enough funds (need at least deposit amount + fee)
    const depositUtxo = depositorUtxos.find(utxo => utxo.satoshis >= 10000n);

    if (!depositUtxo) {
      throw new Error('No suitable UTXO found for deposit');
    }

    const tb = new TransactionBuilder({ provider: this.provider });

    // Input 0: Depositor's BCH UTXO
    tb.addInput(depositUtxo, depositor.unlockP2PKH());

    // Output 0: Deposit to contract
    tb.addOutput({
      to: this.contract.address,
      amount: depositUtxo.satoshis - 2000n, // Subtract estimated fee
    });

    const tx = await tb.build();
    return tx;
  }

  /**
   * Withdraw funds from the contract (after lock expires)
   * @param ownerKey WIF private key of owner
   * @param amount Amount in satoshis
   * @param recipientAddress Optional recipient address (defaults to owner)
   */
  async withdraw(ownerKey: string, amount: bigint, recipientAddress?: string): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const owner = new SignatureTemplate(ownerKey);
    const recipient = recipientAddress || this.getAddress();

    // Get current block height for locktime
    const currentBlock = await this.provider.getBlockHeight();

    const contractUtxos = await this.contract.getUtxos();

    if (contractUtxos.length === 0) {
      throw new Error('No UTXOs available in the contract');
    }

    // Find a UTXO with enough funds
    const withdrawUtxo = contractUtxos.find(utxo => utxo.satoshis >= amount);

    if (!withdrawUtxo) {
      throw new Error(`Insufficient balance. Available: ${contractUtxos.reduce((sum, u) => sum + u.satoshis, 0n)}`);
    }

    const tb = new TransactionBuilder({ provider: this.provider });

    // Input 0: Contract UTXO
    tb.addInput(withdrawUtxo, this.contract.unlock.withdraw(owner, owner, amount));

    // Output 0: Send to recipient
    tb.addOutput({
      to: recipient,
      amount: amount,
    });

    // Output 1: Change back to contract (if any remaining)
    const remaining = withdrawUtxo.satoshis - amount;
    if (remaining > 2000n) {
      tb.addOutput({
        to: this.contract.address,
        amount: remaining - 1000n, // Estimated fee
      });
    }

    // Set locktime to current block
    tb.setLocktime(currentBlock);

    const tx = await tb.build();
    return tx;
  }

  /**
   * Cancel and refund all funds
   * @param ownerKey WIF private key of owner
   */
  async cancel(ownerKey: string): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const owner = new SignatureTemplate(ownerKey);

    const contractUtxos = await this.contract.getUtxos();

    if (contractUtxos.length === 0) {
      throw new Error('No UTXOs available in the contract');
    }

    const tb = new TransactionBuilder({ provider: this.provider });

    // Input 0: Contract UTXO
    tb.addInput(contractUtxos[0], this.contract.unlock.cancel(owner, owner));

    // Output 0: Refund to owner
    tb.addOutput({
      to: this.getAddress(),
      amount: contractUtxos[0].satoshis - 2000n,
    });

    const tx = await tb.build();
    return tx;
  }

  /**
   * Check if the lock has expired
   */
  async isLockExpired(): Promise<boolean> {
    if (!this.config) {
      throw new Error('Contract not initialized');
    }

    // Get current block height
    const currentBlock = await this.provider.getBlockHeight();

    return currentBlock >= this.config.lockEndBlock;
  }

  /**
   * Get remaining lock time in blocks
   */
  async getRemainingBlocks(): Promise<number> {
    if (!this.config) {
      throw new Error('Contract not initialized');
    }

    const currentBlock = await this.provider.getBlockHeight();
    const remaining = this.config.lockEndBlock - currentBlock;
    return Math.max(0, remaining);
  }
}

/**
 * Helper function to calculate lock end block
 * @param days Number of days to lock
 * @param currentBlock Current block height
 * @param blocksPerDay Average blocks per day (default: 144 for BCH)
 */
export function calculateLockEndBlock(days: number, currentBlock: number, blocksPerDay: number = 144): number {
  return currentBlock + (days * blocksPerDay);
}

/**
 * Parse BCH amount from decimal to satoshis
 */
export function toSatoshis(bchAmount: number): bigint {
  return BigInt(Math.round(bchAmount * 100000000));
}

/**
 * Format satoshis to BCH decimal
 */
export function toBCH(satoshis: bigint): number {
  return Number(satoshis) / 100000000;
}

/**
 * Get current block height from Electrum
 */
export async function getCurrentBlock(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' | 'mocknet' | 'regtest' = 'mainnet'): Promise<number> {
  const net = toNetwork(network);
  const provider = new ElectrumNetworkProvider(net);
  return provider.getBlockHeight();
}
