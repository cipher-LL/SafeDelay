/**
 * SafeDelayLibrary - High-level API for SafeDelay contract operations
 *
 * Provides auto-funding deposit() that automatically manages wallet UTXOs.
 */

import { Contract, ElectrumNetworkProvider, Network, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { decodePrivateKeyWif, privateKeyToP2pkhCashAddress, hash160, encodeCashAddress } from '@bitauth/libauth';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';

// ============ Types ============

export interface NetworkConfig {
  network: 'mainnet' | 'testnet' | 'chipnet';
  electrumUrl?: string;
}

export interface DepositOptions {
  wifKey: string;
  amountSats: bigint;
  contractAddress: string;
  ownerPkh: string;
  lockEndBlock: number;
  config: NetworkConfig;
}

export interface DepositResult {
  txHash: string;
  amountSats: bigint;
  feeSats: bigint;
}

export interface InsufficientBalanceError extends Error {
  required: bigint;
  available: bigint;
}

// ============ Network Config ============

const DEFAULT_ELECTRUM_URLS = {
  mainnet: 'https://api.blacktown.io/rpc',
  testnet: 'https://api.blacktown.io/rpc',
  chipnet: 'https://api.blacktown.io/rpc',
};

function toCashScriptNetwork(network: NetworkConfig['network']): Network {
  switch (network) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
  }
}

// ============ UTXO Fetching via Electrum RPC ============

interface ElectrumUtxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
}

async function electrumRpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

async function getAddressUtxos(url: string, address: string): Promise<ElectrumUtxo[]> {
  try {
    // Convert address to scripthash for Electrum
    const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
    const addr = address.trim();
    const cashPrefixMatch = addr.match(/^(bitcoincash:|bchtest:|bchreg:)/i);
    const addrToDecode = cashPrefixMatch ? addr : `bitcoincash:${addr}`;
    const lockingBytecode = cashAddressToLockingBytecode(addrToDecode);
    if (typeof lockingBytecode === 'string') throw new Error('Invalid address');
    const scriptHashBuffer = await crypto.subtle.digest('SHA-256', lockingBytecode.bytecode);
    const scriptHash = new Uint8Array(scriptHashBuffer).reverse();
    const scripthashHex = Array.from(scriptHash).map(b => b.toString(16).padStart(2, '0')).join('');
    return await electrumRpc<ElectrumUtxo[]>(url, 'blockchain.scripthash.listunspent', [scripthashHex]);
  } catch (e) {
    console.error(`[SafeDelayLibrary] Error fetching UTXOs: ${e}`);
    return [];
  }
}

// ============ WIF Key Utilities ============

interface KeyPair {
  privateKey: Uint8Array;
  address: string;
  pkh: string;
  signer: SignatureTemplate;
}

function networkPrefixForAddress(network: NetworkConfig['network']): string {
  switch (network) {
    case 'mainnet': return 'bitcoincash';
    case 'testnet': return 'bchtest';
    case 'chipnet': return 'bchtest';
  }
}

/**
 * Derive address and key info from WIF key
 */
function deriveKeyPair(wifKey: string, network: NetworkConfig['network']): KeyPair {
  const decoded = decodePrivateKeyWif(wifKey);
  if (decoded instanceof Error) {
    throw new Error(`Invalid WIF key: ${decoded.message}`);
  }

  const privateKey = decoded.privateKey;
  const prefix = networkPrefixForAddress(network);
  const addressResult = privateKeyToP2pkhCashAddress(privateKey, prefix);
  if (typeof addressResult === 'string') {
    throw new Error(`Failed to derive address from WIF: ${addressResult}`);
  }

  const address = addressResult.address;
  const pkhResult = hash160(addressResult.payload);
  const pkh = Array.from(pkhResult).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    privateKey: new Uint8Array(privateKey),
    address,
    pkh,
    signer: new SignatureTemplate(new Uint8Array(privateKey)),
  };
}

// ============ Contract Instance ============

function getSafeDelayContract(ownerPkh: string, lockEndBlock: number, network: NetworkConfig['network'], provider?: ElectrumNetworkProvider) {
  return new Contract(SafeDelayArtifact as any, [ownerPkh, BigInt(lockEndBlock)], {
    provider,
  } as any);
}

// ============ Main deposit() Function ============

const DUST_SATS = 546n;
const FEE_SATS = 1000n; // Estimated fee for deposit tx

/**
 * Deposit BCH into a SafeDelay contract with automatic wallet UTXO funding.
 *
 * @param options.depositorWifKey - WIF private key of depositor
 * @param options.amountSats - Amount to deposit in satoshis
 * @param options.contractAddress - Address of deployed SafeDelay contract
 * @param options.ownerPkh - Owner's public key hash (40 hex chars)
 * @param options.lockEndBlock - Lock expiration block height
 * @param options.config.network - Network: 'mainnet' | 'testnet' | 'chipnet'
 * @param options.config.electrumUrl - Optional Electrum RPC URL
 * @returns DepositResult with txHash, amount, and fee
 * @throws InsufficientBalanceError if wallet doesn't have enough funds
 */
export async function deposit(options: {
  wifKey: string;
  amountSats: bigint;
  contractAddress: string;
  ownerPkh: string;
  lockEndBlock: number;
  config: NetworkConfig;
}): Promise<DepositResult> {
  const { wifKey, amountSats, contractAddress, ownerPkh, lockEndBlock, config } = options;
  const { network, electrumUrl } = config;
  const rpcUrl = electrumUrl || DEFAULT_ELECTRUM_URLS[network];

  // Derive depositor keypair from WIF
  const depositor = deriveKeyPair(wifKey, network);

  // Get Electrum provider
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network), rpcUrl);

  // Get contract instance
  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, network, provider);

  // Fetch wallet UTXOs from Electrum
  const walletUtxos = await getAddressUtxos(rpcUrl, depositor.address);

  if (walletUtxos.length === 0) {
    const err = new Error('No UTXOs found in wallet') as InsufficientBalanceError;
    err.required = amountSats + FEE_SATS;
    err.available = 0n;
    throw err;
  }

  // Calculate total available
  const totalAvailable = walletUtxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
  const required = amountSats + FEE_SATS;

  if (totalAvailable < required) {
    const err = new Error(`Insufficient balance: need ${required} sats, have ${totalAvailable} sats`) as InsufficientBalanceError;
    err.required = required;
    err.available = totalAvailable;
    throw err;
  }

  // Build the deposit transaction
  // The deposit function takes (pubkey depositorPk, sig depositorSig)
  // It requires:
  //   - Input 0: SafeDelay UTXO (contract input)
  //   - Input 1: Depositor UTXO (funds the deposit)
  //   - Output 0: SafeDelay UTXO with new balance (value = old + deposit - fee)

  // First, get the contract's current UTXO(s)
  const contractUtxos = await provider.getUtxos(contractAddress);
  if (contractUtxos.length === 0) {
    throw new Error(`No UTXOs found at contract address ${contractAddress}. Contract may not be funded.`);
  }

  // Use the first contract UTXO as the primary input
  const contractUtxo = contractUtxos[0];
  const currentContractBalance = contractUtxo.satoshis;
  const newContractBalance = currentContractBalance + amountSats - FEE_SATS;

  if (newContractBalance < DUST_SATS) {
    throw new Error(`Deposit would leave insufficient balance in contract. Minimum: ${DUST_SATS} sats.`);
  }

  // Select depositor UTXOs to fund the transaction
  // We need enough to cover amountSats + fee
  let accumulated = 0n;
  const selectedUtxos: ElectrumUtxo[] = [];

  for (const utxo of walletUtxos) {
    if (accumulated >= required) break;
    selectedUtxos.push(utxo);
    accumulated += BigInt(utxo.value);
  }

  // Create transaction builder
  const tx = new TransactionBuilder();

  // Add contract UTXO as first input (will be recreated in output)
  const contractInput = {
    ...contractUtxo,
    token: undefined,
  };
  tx.addInput(contractInput, contract.unlock.deposit(depositor.publicKey, depositor.signer));

  // Add selected depositor UTXOs as additional inputs
  for (const utxo of selectedUtxos) {
    tx.addInput({
      txHash: utxo.tx_hash,
      vout: utxo.tx_pos,
      satoshis: BigInt(utxo.value),
      token: undefined,
      address: depositor.address,
    });
  }

  // Output 0: New SafeDelay UTXO with updated balance
  tx.addOutput(contractAddress, newContractBalance);

  // Output 1: Change back to depositor if any remaining
  const totalFromDepositor = selectedUtxos.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n);
  const changeAmount = totalFromDepositor - amountSats - FEE_SATS;

  if (changeAmount >= DUST_SATS) {
    tx.addOutput(depositor.address, changeAmount);
  }

  // Build and send
  const txHex = await tx.build();
  const txHash = await provider.sendRawTransaction(txHex);

  return {
    txHash,
    amountSats,
    feeSats: FEE_SATS,
  };
}

/**
 * Get the balance of a SafeDelay contract.
 */
export async function getBalance(
  ownerPkh: string,
  lockEndBlock: number,
  config: NetworkConfig
): Promise<bigint> {
  const { network, electrumUrl } = config;
  const rpcUrl = electrumUrl || DEFAULT_ELECTRUM_URLS[network];
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network), rpcUrl);

  // Compute contract address
  const artifact = SafeDelayArtifact as any;
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) throw new Error('No bytecode in artifact');

  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, network, provider);
  const utxos = await provider.getUtxos(contract.address);

  return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
}

/**
 * Compute the deployment address for a SafeDelay contract.
 */
export function computeAddress(ownerPkh: string, lockEndBlock: number, network: NetworkConfig['network']): string {
  const artifact = SafeDelayArtifact as any;
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) throw new Error('No bytecode in artifact');

  const baseBytecode = Uint8Array.from(Buffer.from(bytecodeHex, 'hex'));

  // Encode constructor args
  const encodedArgs: Uint8Array[] = [];
  // ownerPKH (bytes20): push 20 bytes directly
  const pkhBytes = Uint8Array.from(Buffer.from(ownerPkh, 'hex'));
  encodedArgs.push(pkhBytes);
  // lockEndBlock (int): encode as VM number
  const { bigIntToVmNumber } = require('@bitauth/libauth');
  encodedArgs.push(bigIntToVmNumber(BigInt(lockEndBlock)));

  // Build redeem script: encoded_args (reversed for CashScript LE) + baseBytecode
  const redeemScript = new Uint8Array(
    encodedArgs.flatMap(a => [...a].reverse()).concat([...baseBytecode])
  );

  // Compute hash256 (double SHA256)
  const hashBuffer = crypto.subtle.digestSync('SHA-256', redeemScript);
  const hash = new Uint8Array(hashBuffer);

  // Build P2SH32 locking bytecode and convert to address
  const prefix = networkPrefixForAddress(network);
  const lockingBytecode = encodeCashAddress({
    prefix,
    bytecode: { type: 'p2sh32', hash },
  });

  if (typeof lockingBytecode === 'string') {
    throw new Error(`Failed to encode address: ${lockingBytecode}`);
  }

  return lockingBytecode;
}
