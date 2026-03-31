/**
 * CrowdFund Contract Wrapper
 * 
 * A crowdfunding contract where creators set a funding goal and deadline.
 * If the goal is met by the deadline, the creator can withdraw.
 * If not, backers can reclaim their deposits.
 */

import { readFileSync } from 'fs';
import { Contract, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { Network } from 'cashscript/dist/interfaces.js';
import type { CrowdFundArtifact } from './types/index.js';
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
 * Configuration for CrowdFund contract
 */
export interface CrowdFundConfig {
  /** Creator's public key hash */
  creatorPublicKeyHash: string;
  /** Minimum amount to succeed (satoshis) */
  fundingGoal: number;
  /** Block height when campaign ends */
  deadline: number;
}

/**
 * Campaign status based on current state
 */
export type CrowdFundStatus = 'active' | 'succeeded' | 'failed';

/**
 * CrowdFund: Crowdfunding with goal and deadline
 * 
 * Features:
 * - 🎯 Creator sets a funding goal and deadline
 * - 💰 Backers contribute to fund the campaign
 * - ✅ If goal met by deadline → creator withdraws
 * - ❌ If goal not met by deadline → backers can reclaim
 */
export class CrowdFund {
  private contract: Contract | null = null;
  private network: SafeDelayNetwork;
  private provider: ElectrumNetworkProvider;
  private config: CrowdFundConfig | null = null;

  constructor(network: SafeDelayNetwork = 'mainnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(toNetwork(network));
  }

  /**
   * Connect to an existing CrowdFund contract
   * @param artifact - CrowdFund artifact
   * @param config - Contract configuration (creatorPkh, fundingGoal, deadline)
   */
  connect(artifact: CrowdFundArtifact, config: CrowdFundConfig): void {
    this.contract = new Contract(
      artifact as any,
      [config.creatorPublicKeyHash, config.fundingGoal, config.deadline],
      { provider: this.provider }
    );
    this.config = config;
  }

  /**
   * Connect using a path to the artifact JSON file
   */
  connectFromPath(artifactPath: string, config: CrowdFundConfig): void {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    this.connect(artifact as CrowdFundArtifact, config);
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
   * Contribute to the campaign
   * @param backerKey - WIF private key of backer
   * @param amount - Amount in satoshis to contribute
   * @returns Transaction ID
   */
  async contribute(backerKey: string, amount: bigint): Promise<string> {
    this.requireConnected();
    const backer = new SignatureTemplate(backerKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .contribute(backer, backer)
      .to(this.getAddress(), amount)
      .send();
    return tx.txid;
  }

  /**
   * Withdraw funds (creator only, only if goal met by deadline)
   * @param creatorKey - WIF private key of creator
   * @returns Transaction ID
   */
  async withdraw(creatorKey: string): Promise<string> {
    this.requireConnected();
    const creator = new SignatureTemplate(creatorKey);
    const currentBlock = await this.provider.getBlockHeight();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .withdraw(creator)
      .from(await this.contract!.getUtxos())
      .to(this.config!.creatorPublicKeyHash, 0)
      .withTime(currentBlock)
      .send();
    return tx.txid;
  }

  /**
   * Refund contributions (backers only, only if goal NOT met by deadline)
   * Note: Simplified implementation - anyone can trigger refund for all
   * @param initiatorKey - WIF private key of anyone initiating refund
   * @returns Transaction ID
   */
  async refund(initiatorKey: string): Promise<string> {
    this.requireConnected();
    const initiator = new SignatureTemplate(initiatorKey);
    const currentBlock = await this.provider.getBlockHeight();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .refund(initiator)
      .from(await this.contract!.getUtxos())
      .to(this.config!.creatorPublicKeyHash, 0)
      .withTime(currentBlock)
      .send();
    return tx.txid;
  }

  /**
   * Get the current campaign status
   */
  async getStatus(): Promise<CrowdFundStatus> {
    this.requireConnected();
    const currentBlock = await this.provider.getBlockHeight();
    const balance = await this.getBalance();
    
    if (currentBlock < this.config!.deadline) {
      return 'active';
    }
    if (balance >= this.config!.fundingGoal) {
      return 'succeeded';
    }
    return 'failed';
  }

  /**
   * Check if goal has been reached
   */
  async isGoalReached(): Promise<boolean> {
    const balance = await this.getBalance();
    return balance >= BigInt(this.config!.fundingGoal);
  }

  /**
   * Get funding progress as a percentage
   */
  async getProgress(): Promise<number> {
    const balance = await this.getBalance();
    return Number(balance) / Number(this.config!.fundingGoal) * 100;
  }

  /**
   * Get remaining time in blocks
   */
  async getRemainingBlocks(): Promise<number> {
    this.requireConnected();
    const currentBlock = await this.provider.getBlockHeight();
    return Math.max(0, this.config!.deadline - currentBlock);
  }

  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockHeight();
  }

  getConfig(): CrowdFundConfig | null {
    return this.config;
  }

  private requireConnected(): void {
    if (!this.contract) {
      throw new Error('CrowdFund not connected. Call connect() or connectFromPath() first.');
    }
  }
}
