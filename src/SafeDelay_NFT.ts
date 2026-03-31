/**
 * SafeDelay_NFT Contract Wrapper
 * 
 * A time-locked wallet designed for NFT holders.
 * Allows depositing BCH onto NFTs with time-locked withdrawals.
 */

import { readFileSync } from 'fs';
import { Contract, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { Network } from 'cashscript/dist/interfaces.js';
import type { SafeDelay_NFTArtifact } from './types/index.js';
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
 * Configuration for SafeDelay_NFT contract
 */
export interface SafeDelay_NFTConfig {
  /** User's public key hash for withdrawals */
  userPublicKeyHash: string;
  /** Emergency public key hash */
  emergencyPublicKeyHash: string;
  /** Recovery public key hash (cold storage, no timelock) */
  recoverPublicKeyHash: string;
  /** Default number of blocks to wait before withdrawal enabled */
  blockDelay: number;
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
  private contract: Contract | null = null;
  private network: SafeDelayNetwork;
  private provider: ElectrumNetworkProvider;
  private config: SafeDelay_NFTConfig | null = null;

  constructor(network: SafeDelayNetwork = 'mainnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(toNetwork(network));
  }

  connect(artifact: SafeDelay_NFTArtifact, config: SafeDelay_NFTConfig): void {
    this.contract = new Contract(
      artifact as any,
      [
        config.userPublicKeyHash,
        config.emergencyPublicKeyHash,
        config.recoverPublicKeyHash,
        config.blockDelay,
      ],
      { provider: this.provider }
    );
    this.config = config;
  }

  connectFromPath(artifactPath: string, config: SafeDelay_NFTConfig): void {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    this.connect(artifact as SafeDelay_NFTArtifact, config);
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
   * Deposit BCH onto a new NFT
   * @param depositorKey - WIF private key of depositor
   */
  async deposit(depositorKey: string): Promise<string> {
    this.requireConnected();
    const depositor = new SignatureTemplate(depositorKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .deposit(depositor)
      .send();
    return tx.txid;
  }

  /**
   * Extend the lock period
   * @param userKey - WIF private key of user
   * @param additionalBlocks - Additional blocks to add
   */
  async extend(userKey: string, additionalBlocks: number): Promise<string> {
    this.requireConnected();
    const user = new SignatureTemplate(userKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .extend(user, additionalBlocks)
      .send();
    return tx.txid;
  }

  /**
   * Start the withdrawal process
   * @param userKey - WIF private key of user
   */
  async startWithdraw(userKey: string): Promise<string> {
    this.requireConnected();
    const user = new SignatureTemplate(userKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .startWithdraw(user)
      .send();
    return tx.txid;
  }

  /**
   * Withdraw funds after lock expires
   * @param userKey - WIF private key of user
   * @param amount - Amount in satoshis
   */
  async withdraw(userKey: string, amount: bigint): Promise<string> {
    this.requireConnected();
    const user = new SignatureTemplate(userKey);
    const currentBlock = await this.provider.getBlockHeight();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .withdraw(user, amount)
      .from(await this.contract!.getUtxos())
      .to(this.config!.userPublicKeyHash, amount)
      .withTime(currentBlock)
      .send();
    return tx.txid;
  }

  /**
   * Emergency withdraw without time lock
   * @param userKey - WIF private key of user
   * @param emergencyAddress - Emergency address to send funds
   */
  async emergencyWithdraw(userKey: string, emergencyAddress: string): Promise<string> {
    this.requireConnected();
    const user = new SignatureTemplate(userKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .emergencyWithdraw(user, emergencyAddress)
      .send();
    return tx.txid;
  }

  /**
   * Recover funds to cold storage (no timelock)
   * @param userKey - WIF private key of user
   * @param coldAddress - Cold storage address
   */
  async recover(userKey: string, coldAddress: string): Promise<string> {
    this.requireConnected();
    const user = new SignatureTemplate(userKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .recover(user, coldAddress)
      .send();
    return tx.txid;
  }

  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockHeight();
  }

  getConfig(): SafeDelay_NFTConfig | null {
    return this.config;
  }

  private requireConnected(): void {
    if (!this.contract) {
      throw new Error('SafeDelay_NFT not connected. Call connect() or connectFromPath() first.');
    }
  }
}
