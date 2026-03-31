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
import type { SafeDelayArtifact } from './types/index.js';

/**
 * Network supported by SafeDelay
 */
export type SafeDelayNetwork = 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' | 'mocknet' | 'regtest';

/**
 * Configuration for connecting to an existing SafeDelay contract
 */
export interface SafeDelayConfig {
  /** Owner's public key hash (40 hex chars / 20 bytes) */
  ownerPublicKeyHash: string;
  /** Block height when lock expires */
  lockEndBlock: number;
}

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
  private contract: Contract | null = null;
  private network: SafeDelayNetwork;
  private provider: ElectrumNetworkProvider;
  private config: SafeDelayConfig | null = null;

  /**
   * Create a new SafeDelay wrapper instance
   * @param options - Configuration options
   */
  constructor(options: { network?: SafeDelayNetwork } = {}) {
    const network = options.network ?? 'mainnet';
    this.network = network;
    this.provider = new ElectrumNetworkProvider(toNetwork(network));
  }

  /**
   * Connect to an existing SafeDelay contract on-chain
   * @param artifact - SafeDelay artifact (can be imported from 'safedelay/artifacts/SafeDelay')
   * @param config - Contract configuration (ownerPKH, lockEndBlock)
   */
  connect(artifact: SafeDelayArtifact, config: SafeDelayConfig): void {
    this.contract = new Contract(
      artifact as any,
      [config.ownerPublicKeyHash, config.lockEndBlock],
      { provider: this.provider }
    );
    this.config = config;
  }

  /**
   * Connect using a path to the artifact JSON file
   * @param artifactPath - Path to SafeDelay.artifact.json
   * @param config - Contract configuration
   */
  connectFromPath(artifactPath: string, config: SafeDelayConfig): void {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    this.connect(artifact as SafeDelayArtifact, config);
  }

  /**
   * Get the contract's P2PKH address
   */
  getAddress(): string {
    this.requireConnected();
    return this.contract!.address;
  }

  /**
   * Get total balance held by the contract
   */
  async getBalance(): Promise<bigint> {
    this.requireConnected();
    const utxos = await this.contract!.getUtxos();
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
  }

  /**
   * Get all UTXOs held by the contract
   */
  async getUtxos() {
    this.requireConnected();
    return this.contract!.getUtxos();
  }

  /**
   * Deposit funds into the contract (anyone can deposit)
   * @param depositorKey - WIF private key of depositor
   * @param amount - Amount in satoshis
   * @param recipientAddress - Optional recipient (defaults to contract address)
   * @returns Transaction details
   */
  async deposit(depositorKey: string, amount: bigint, recipientAddress?: string): Promise<{ txid: string }> {
    this.requireConnected();
    const depositor = new SignatureTemplate(depositorKey);
    const recipient = recipientAddress || this.getAddress();
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.deposit(depositor, depositor))
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
  async extend(ownerKey: string, newLockEndBlock: number): Promise<{ txid: string }> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.extend(owner, newLockEndBlock));
    
    const result = await txBuilder.send();
    return { txid: result.txid };
  }

  /**
   * Start the withdrawal process (sets a flag, actual withdraw comes after)
   * @param ownerKey - WIF private key of owner
   * @returns Transaction details
   */
  async startWithdraw(ownerKey: string): Promise<{ txid: string }> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.startWithdraw(owner));
    
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
  async withdraw(ownerKey: string, amount: bigint, recipientAddress?: string): Promise<{ txid: string }> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    const recipient = recipientAddress || this.getAddress();
    const currentBlock = await this.provider.getBlockHeight();
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.withdraw(owner, amount))
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
  async emergencyWithdraw(ownerKey: string, recipientAddress: string): Promise<{ txid: string }> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.emergencyWithdraw(owner, recipientAddress));
    
    const result = await txBuilder.send();
    return { txid: result.txid };
  }

  /**
   * Recover funds to cold storage address (no timelock)
   * @param ownerKey - WIF private key of owner
   * @param recipientAddress - Cold storage address
   * @returns Transaction details
   */
  async recover(ownerKey: string, recipientAddress: string): Promise<{ txid: string }> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.recover(owner, recipientAddress));
    
    const result = await txBuilder.send();
    return { txid: result.txid };
  }

  /**
   * Cancel the contract and refund all funds to owner
   * @param ownerKey - WIF private key of owner
   * @returns Transaction details
   */
  async cancel(ownerKey: string): Promise<{ txid: string }> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    const utxos = await this.contract!.getUtxos();
    
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder
      .addInput(utxos[0], (this.contract as any).unlock.cancel(owner));
    
    const result = await txBuilder.send();
    return { txid: result.txid };
  }

  /**
   * Check if the lock period has expired
   */
  async isLockExpired(): Promise<boolean> {
    this.requireConnected();
    const currentBlock = await this.provider.getBlockHeight();
    return currentBlock >= this.config!.lockEndBlock;
  }

  /**
   * Get remaining blocks until lock expires
   */
  async getRemainingBlocks(): Promise<number> {
    this.requireConnected();
    const currentBlock = await this.provider.getBlockHeight();
    return Math.max(0, this.config!.lockEndBlock - currentBlock);
  }

  /**
   * Get the current block height
   */
  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockHeight();
  }

  /**
   * Get the contract configuration
   */
  getConfig(): SafeDelayConfig | null {
    return this.config;
  }

  private requireConnected(): void {
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
export async function calculateLockEndBlockFromDate(
  targetDate: Date,
  network: SafeDelayNetwork = 'mainnet'
): Promise<number> {
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
export async function calculateLockEndBlockFromDays(
  days: number,
  currentBlock?: number,
  network: SafeDelayNetwork = 'mainnet'
): Promise<number> {
  if (currentBlock === undefined) {
    const provider = new ElectrumNetworkProvider(toNetwork(network));
    currentBlock = await provider.getBlockHeight();
  }
  return currentBlock + (days * 144);
}

function toNetwork(network: SafeDelayNetwork): Network {
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
