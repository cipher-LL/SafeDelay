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
import type { SocialRecoveryArtifact } from './types/index.js';
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
 * Configuration for SocialRecovery contract
 */
export interface SocialRecoveryConfig {
  /** Current owner public key hash */
  ownerPublicKeyHash: string;
  /** Pending new owner (0 if no pending recovery) */
  newOwnerPublicKeyHash?: string;
  /** Block when recovery period starts (0 if not proposed) */
  recoveryStartBlock?: number;
  /** Number of blocks required after recovery proposal */
  recoveryDelay: number;
  /** Number of backup signatures required (M) */
  requiredSignatures: number;
  /** Backup signer 1 */
  backupPKH1: string;
  /** Backup signer 2 */
  backupPKH2: string;
  /** Backup signer 3 */
  backupPKH3: string;
  /** Backup signer 4 (can be 0 if < 4 signers) */
  backupPKH4?: string;
  /** Backup signer 5 (can be 0 if < 5 signers) */
  backupPKH5?: string;
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
  private contract: Contract | null = null;
  private network: SafeDelayNetwork;
  private provider: ElectrumNetworkProvider;
  private config: SocialRecoveryConfig | null = null;

  constructor(network: SafeDelayNetwork = 'mainnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(toNetwork(network));
  }

  /**
   * Connect to an existing SocialRecovery contract
   * @param artifact - SocialRecovery artifact
   * @param config - Contract configuration
   */
  connect(artifact: SocialRecoveryArtifact, config: SocialRecoveryConfig): void {
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

    this.contract = new Contract(artifact as any, args as any, { provider: this.provider });
    this.config = config;
  }

  /**
   * Connect using a path to the artifact JSON file
   */
  connectFromPath(artifactPath: string, config: SocialRecoveryConfig): void {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    this.connect(artifact as SocialRecoveryArtifact, config);
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
   */
  async deposit(depositorKey: string): Promise<string> {
    this.requireConnected();
    const depositor = new SignatureTemplate(depositorKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .deposit(depositor, depositor)
      .send();
    return tx.txid;
  }

  /**
   * Withdraw funds (owner only)
   * @param ownerKey - WIF private key of owner
   * @param amount - Amount in satoshis
   */
  async withdraw(ownerKey: string, amount: bigint): Promise<string> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .withdraw(owner, amount)
      .from(await this.contract!.getUtxos())
      .to(this.config!.ownerPublicKeyHash, amount)
      .send();
    return tx.txid;
  }

  /**
   * Cancel and refund all funds (owner only)
   * @param ownerKey - WIF private key of owner
   */
  async cancel(ownerKey: string): Promise<string> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .cancel(owner)
      .send();
    return tx.txid;
  }

  /**
   * Propose recovery to a new owner (any backup signer)
   * @param backupKey - WIF private key of backup signer
   * @param newOwner - New owner public key hash
   */
  async proposeRecovery(backupKey: string, newOwner: string): Promise<string> {
    this.requireConnected();
    const backup = new SignatureTemplate(backupKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .proposeRecovery(backup, newOwner)
      .send();
    return tx.txid;
  }

  /**
   * Execute recovery after delay (M-of-N backups)
   * @param backupKeys - Array of WIF private keys for M backups
   */
  async executeRecovery(backupKeys: string[]): Promise<string> {
    this.requireConnected();
    const sigs = backupKeys.map(k => new SignatureTemplate(k));
    const currentBlock = await this.provider.getBlockHeight();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .executeRecovery(sigs, sigs)
      .from(await this.contract!.getUtxos())
      .withTime(currentBlock)
      .send();
    return tx.txid;
  }

  /**
   * Cancel pending recovery (owner only)
   * @param ownerKey - WIF private key of owner
   */
  async cancelRecovery(ownerKey: string): Promise<string> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .cancelRecovery(owner)
      .send();
    return tx.txid;
  }

  /**
   * Transfer ownership directly (owner only)
   * @param ownerKey - WIF private key of current owner
   * @param newOwner - New owner public key hash
   */
  async transferOwnership(ownerKey: string, newOwner: string): Promise<string> {
    this.requireConnected();
    const owner = new SignatureTemplate(ownerKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (this.contract as any).unlock
      .transferOwnership(owner, newOwner)
      .send();
    return tx.txid;
  }

  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockHeight();
  }

  getConfig(): SocialRecoveryConfig | null {
    return this.config;
  }

  private requireConnected(): void {
    if (!this.contract) {
      throw new Error('SocialRecovery not connected. Call connect() or connectFromPath() first.');
    }
  }
}
