/**
 * SafeDelayMultiSig Contract Wrapper
 * 
 * A multi-signature time-locked wallet requiring M-of-N signatures.
 * Supports extend and cancel operations.
 */

import { readFileSync } from 'fs';
import { Contract, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { Network } from 'cashscript/dist/interfaces.js';
import type { SafeDelayMultiSigArtifact } from './types/index.js';
import type { SafeDelayNetwork } from './SafeDelay.js';

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

/**
 * Configuration for SafeDelayMultiSig contract
 */
export interface SafeDelayMultiSigConfig {
  /** Array of M public key hashes required (40 hex chars each) */
  publicKeyHashes: string[];
  /** Number of signatures required (M) */
  requiredSignatures: number;
  /** Block height when lock expires */
  lockEndBlock: number;
}

export class SafeDelayMultiSig {
  private contract: Contract | null = null;
  private network: SafeDelayNetwork;
  private provider: ElectrumNetworkProvider;
  private config: SafeDelayMultiSigConfig | null = null;

  constructor(network: SafeDelayNetwork = 'mainnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(toNetwork(network));
  }

  /**
   * Connect to an existing SafeDelayMultiSig contract
   * @param artifact - SafeDelayMultiSig artifact
   * @param config - Contract configuration (publicKeyHashes, requiredSignatures, lockEndBlock)
   */
  connect(artifact: SafeDelayMultiSigArtifact, config: SafeDelayMultiSigConfig): void {
    this.contract = new Contract(
      artifact as any,
      [config.publicKeyHashes, config.requiredSignatures, config.lockEndBlock],
      { provider: this.provider }
    );
    this.config = config;
  }

  /**
   * Connect using a path to the artifact JSON file
   */
  connectFromPath(artifactPath: string, config: SafeDelayMultiSigConfig): void {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    this.connect(artifact as SafeDelayMultiSigArtifact, config);
  }

  getAddress(): string {
    this.requireConnected();
    return this.contract!.address;
  }

  async getBalance(): Promise<bigint> {
    this.requireConnected();
    const utxos = await this.contract!.getUtxos();
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
  }

  async getUtxos() {
    this.requireConnected();
    return this.contract!.getUtxos();
  }

  /**
   * Deposit funds (anyone can deposit)
   * @param depositorKey - WIF private key of depositor
   * @param amount - Amount in satoshis
   */
  async deposit(depositorKey: string, amount: bigint): Promise<string> {
    this.requireConnected();
    const depositor = new SignatureTemplate(depositorKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
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
  async withdraw(keys: string[], amount: bigint, recipientAddress?: string): Promise<string> {
    this.requireConnected();
    const recipient = recipientAddress || this.getAddress();
    const sigs = keys.map(k => new SignatureTemplate(k));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .withdraw(sigs, sigs, amount)
      .from(await this.contract!.getUtxos())
      .to(recipient, amount)
      .send();
    return tx.txid;
  }

  /**
   * Extend the lock period
   * @param keys - Array of WIF private keys (M or more)
   * @param newLockEndBlock - New lock expiration block
   */
  async extend(keys: string[], newLockEndBlock: number): Promise<string> {
    this.requireConnected();
    const sigs = keys.map(k => new SignatureTemplate(k));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .extend(sigs, sigs, newLockEndBlock)
      .send();
    return tx.txid;
  }

  /**
   * Cancel and refund (requires M-of-N signatures)
   * @param keys - Array of WIF private keys (M or more)
   */
  async cancel(keys: string[]): Promise<string> {
    this.requireConnected();
    const sigs = keys.map(k => new SignatureTemplate(k));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .cancel(sigs, sigs)
      .send();
    return tx.txid;
  }

  async isLockExpired(): Promise<boolean> {
    this.requireConnected();
    const currentBlock = await this.provider.getBlockHeight();
    return currentBlock >= this.config!.lockEndBlock;
  }

  async getRemainingBlocks(): Promise<number> {
    this.requireConnected();
    const currentBlock = await this.provider.getBlockHeight();
    return Math.max(0, this.config!.lockEndBlock - currentBlock);
  }

  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockHeight();
  }

  getConfig(): SafeDelayMultiSigConfig | null {
    return this.config;
  }

  private requireConnected(): void {
    if (!this.contract) {
      throw new Error('SafeDelayMultiSig not connected. Call connect() or connectFromPath() first.');
    }
  }
}
