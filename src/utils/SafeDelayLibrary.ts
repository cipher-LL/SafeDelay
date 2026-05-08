/**
 * SafeDelayLibrary - High-level API for SafeDelay contract operations
 *
 * Provides auto-funding deposit() that automatically manages wallet UTXOs.
 * @ts-nocheck
 */

import { Contract, ElectrumNetworkProvider, Network, SignatureTemplate } from 'cashscript';
import { decodePrivateKeyWif, hash160, publicKeyToP2pkhCashAddress, encodeLockingBytecodeP2sh32, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import { debugLog } from './debug';

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
  mainnet: 'https://bchd.electroncash.net:8335/rpc',
  testnet: 'https://tbchd.electroncash.dk:8335/rpc',
  chipnet: 'https://bchd.electroncash.dk:8335/rpcpc',
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
    const result = cashAddressToLockingBytecode(addrToDecode);
    if (typeof result === 'string') throw new Error('Invalid address: ' + result);
    // Create ArrayBuffer copy to satisfy BufferSource type
    const bytecode = result.bytecode;
    const ab = new ArrayBuffer(bytecode.byteLength);
    new Uint8Array(ab).set(bytecode);
    const scriptHashBuffer = await crypto.subtle.digest('SHA-256', ab);
    const scriptHash = new Uint8Array(scriptHashBuffer).reverse();
    const scripthashHex = Array.from(scriptHash).map(b => b.toString(16).padStart(2, '0')).join('');
    return await electrumRpc<ElectrumUtxo[]>(url, 'blockchain.scripthash.listunspent', [scripthashHex]);
  } catch (e) {
    debugLog('SafeDelayLibrary', 'Error fetching UTXOs:', e);
    return [];
  }
}

// ============ WIF Key Utilities ============

interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  pkh: string;
  signer: SignatureTemplate;
}

function networkPrefixForAddress(network: NetworkConfig['network']): 'bitcoincash' | 'bchtest' | 'bchreg' {
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
  if (typeof decoded === 'string') {
    throw new Error(`Invalid WIF key: ${decoded}`);
  }

  const privateKey = decoded.privateKey;
  const prefix = networkPrefixForAddress(network);

  // Create signer to derive public key
  const signer = new SignatureTemplate(privateKey);
  const publicKey = signer.getPublicKey();

  // Derive address from public key
  const addressResult = publicKeyToP2pkhCashAddress({ publicKey, prefix });
  if (typeof addressResult === 'string') {
    throw new Error(`Failed to derive address from WIF: ${addressResult}`);
  }
  const address = addressResult.address;

  // Compute pubkey hash from public key
  const pkhResult = hash160(publicKey);
  const pkh = Array.from(pkhResult).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    privateKey: new Uint8Array(privateKey),
    publicKey,
    address,
    pkh,
    signer,
  };
}

// ============ Contract Instance ============

function getSafeDelayContract(ownerPkh: string, lockEndBlock: number, _network: NetworkConfig['network'], provider?: ElectrumNetworkProvider) {
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
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

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

  // Build deposit transaction using CashScript contract API
  // deposit(pubkey depositorPk, sig depositorSig)
  // The contract needs the depositor's public key hash as the first arg
  const depositTx = (contract as any).functions.deposit(depositor.pkh);

  // Build the input array: contract UTXO first, then depositor UTXOs
  const contractInput = {
    ...contractUtxo,
    token: undefined,
  };
  const depositorInputs = selectedUtxos.map((utxo): any => ({
    txHash: utxo.tx_hash,
    vout: utxo.tx_pos,
    satoshis: BigInt(utxo.value),
    token: undefined,
    address: depositor.address,
  }));

  // Use the contract's deposit function with from() to specify inputs
  const txDetails = await depositTx
    .from([contractInput, ...depositorInputs])
    .to(contractAddress, newContractBalance)
    .send() as any;

  const txHash = typeof txDetails === 'string' ? txDetails : txDetails.txid || txDetails.hash;


  return {
    txHash,
    amountSats,
    feeSats: FEE_SATS,
  };
}

/**
 * Withdraw BCH from a SafeDelay contract after the lock has expired.
 * Uses WIF key to sign the transaction. Partial withdrawals supported.
 *
 * @param wifKey - WIF private key of the owner
 * @param ownerPkh - Owner's public key hash (40 hex chars)
 * @param lockEndBlock - Current lock expiration block height
 * @param withdrawAmount - Amount to withdraw in satoshis
 * @param config - Network configuration
 * @returns txHash and fee info
 */
export async function withdraw(
  wifKey: string,
  ownerPkh: string,
  lockEndBlock: number,
  withdrawAmount: bigint,
  config: NetworkConfig
): Promise<{ txHash: string; feeSats: bigint }> {
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(config.network));

  // Derive wallet from WIF
  const wallet = deriveKeyPair(wifKey, config.network);

  // Get contract and UTXOs
  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, config.network, provider);
  const contractUtxos = await provider.getUtxos(contract.address);

  if (contractUtxos.length === 0) {
    throw new Error('No UTXOs found at contract address. Contract may not be funded.');
  }

  const contractBalance = contractUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
  if (withdrawAmount > contractBalance) {
    const err = new Error(`Insufficient balance: requested ${withdrawAmount} sats, have ${contractBalance} sats`) as InsufficientBalanceError;
    err.required = withdrawAmount;
    err.available = contractBalance;
    throw err;
  }

  // Get wallet UTXOs for signing
  const rpcUrl = config.electrumUrl || DEFAULT_ELECTRUM_URLS[config.network];
  const walletUtxos = await getAddressUtxos(rpcUrl, wallet.address);

  if (walletUtxos.length === 0) {
    throw new Error('No wallet UTXOs found. Your wallet needs BCH to pay miner fees.');
  }

  // Select wallet UTXOs to cover fees
  const feeRequired = FEE_SATS;
  let accumulated = 0n;
  const selectedUtxos: ElectrumUtxo[] = [];
  for (const utxo of walletUtxos) {
    if (accumulated >= feeRequired) break;
    selectedUtxos.push(utxo);
    accumulated += BigInt(utxo.value);
  }

  // Build withdraw transaction
  // withdraw(pubkey ownerPk, sig ownerSig, int withdrawAmount)
  const withdrawTx = (contract as any).functions.withdraw(wallet.pkh, withdrawAmount);

  const walletInputs = selectedUtxos.map((utxo): any => ({
    txHash: utxo.tx_hash,
    vout: utxo.tx_pos,
    satoshis: BigInt(utxo.value),
    token: undefined,
    address: wallet.address,
  }));

  const txDetails = await withdrawTx
    .from([contractUtxos[0], ...walletInputs])
    .withHardcodedLockTime(lockEndBlock)
    .send() as any;

  const txHash = typeof txDetails === 'string' ? txDetails : txDetails.txid || txDetails.hash;

  debugLog('SafeDelayLibrary', 'withdraw tx:', txHash);

  return { txHash, feeSats: FEE_SATS };
}

/**
 * Cancel a SafeDelay contract and reclaim all funds immediately.
 * Uses WIF key to sign. No time-lock restriction — works before or after lock expiry.
 *
 * @param wifKey - WIF private key of the owner
 * @param ownerPkh - Owner's public key hash (40 hex chars)
 * @param lockEndBlock - Current lock expiration block height
 * @param config - Network configuration
 * @returns txHash and fee info
 */
export async function cancel(
  wifKey: string,
  ownerPkh: string,
  lockEndBlock: number,
  config: NetworkConfig
): Promise<{ txHash: string; feeSats: bigint }> {
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(config.network));

  // Derive wallet from WIF
  const wallet = deriveKeyPair(wifKey, config.network);

  // Get contract UTXOs
  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, config.network, provider);
  const contractUtxos = await provider.getUtxos(contract.address);

  if (contractUtxos.length === 0) {
    throw new Error('No UTXOs found at contract address.');
  }

  const contractBalance = contractUtxos.reduce((sum, u) => sum + u.satoshis, 0n);

  // Get wallet UTXOs for signing
  const rpcUrl = config.electrumUrl || DEFAULT_ELECTRUM_URLS[config.network];
  const walletUtxos = await getAddressUtxos(rpcUrl, wallet.address);

  if (walletUtxos.length === 0) {
    throw new Error('No wallet UTXOs found.');
  }

  // cancel(pubkey ownerPk, sig ownerSig) — no withdrawAmount, sends everything minus fee
  const cancelTx = (contract as any).functions.cancel(wallet.pkh);

  const txDetails = await cancelTx
    .from([contractUtxos[0], {
      txHash: walletUtxos[0].tx_hash,
      vout: walletUtxos[0].tx_pos,
      satoshis: BigInt(walletUtxos[0].value),
      token: undefined,
      address: wallet.address,
    }])
    .to(wallet.address, contractBalance - FEE_SATS)
    .send() as any;

  const txHash = typeof txDetails === 'string' ? txDetails : txDetails.txid || txDetails.hash;

  debugLog('SafeDelayLibrary', 'cancel tx:', txHash);

  return { txHash, feeSats: FEE_SATS };
}

/**
 * Extend the lock period of a SafeDelay contract to a later block height.
 * Uses WIF key to sign. One-way operation — lock can only be extended, never shortened.
 * Note: This withdraws all funds to owner; owner must redeposit into a new contract.
 *
 * @param wifKey - WIF private key of the owner
 * @param ownerPkh - Owner's public key hash (40 hex chars)
 * @param lockEndBlock - Current lock expiration block height
 * @param newLockEndBlock - New lock expiration block height (must be > lockEndBlock)
 * @param config - Network configuration
 * @returns txHash and fee info
 */
export async function extend(
  wifKey: string,
  ownerPkh: string,
  lockEndBlock: number,
  newLockEndBlock: number,
  config: NetworkConfig
): Promise<{ txHash: string; feeSats: bigint }> {
  if (newLockEndBlock <= lockEndBlock) {
    throw new Error(`newLockEndBlock (${newLockEndBlock}) must be greater than current lockEndBlock (${lockEndBlock})`);
  }

  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(config.network));

  // Derive wallet from WIF
  const wallet = deriveKeyPair(wifKey, config.network);

  // Get contract UTXOs
  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, config.network, provider);
  const contractUtxos = await provider.getUtxos(contract.address);

  if (contractUtxos.length === 0) {
    throw new Error('No UTXOs found at contract address. Contract may not be funded.');
  }

  const contractBalance = contractUtxos.reduce((sum, u) => sum + u.satoshis, 0n);

  // Get wallet UTXOs for signing
  const rpcUrl = config.electrumUrl || DEFAULT_ELECTRUM_URLS[config.network];
  const walletUtxos = await getAddressUtxos(rpcUrl, wallet.address);

  if (walletUtxos.length === 0) {
    throw new Error('No wallet UTXOs found.');
  }

  // extend(pubkey ownerPk, sig ownerSig, int newLockEndBlock)
  const extendTx = (contract as any).functions.extend(wallet.pkh, BigInt(newLockEndBlock));

  const txDetails = await extendTx
    .from([contractUtxos[0], {
      txHash: walletUtxos[0].tx_hash,
      vout: walletUtxos[0].tx_pos,
      satoshis: BigInt(walletUtxos[0].value),
      token: undefined,
      address: wallet.address,
    }])
    .to(wallet.address, contractBalance - FEE_SATS)
    .send() as any;

  const txHash = typeof txDetails === 'string' ? txDetails : txDetails.txid || txDetails.hash;

  debugLog('SafeDelayLibrary', 'extend tx:', txHash);

  return { txHash, feeSats: FEE_SATS };
}

/**
 * Get the balance of a SafeDelay contract.
 */
export async function getBalance(
  ownerPkh: string,
  lockEndBlock: number,
  config: NetworkConfig
): Promise<bigint> {
  const { network } = config;
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

  // Compute contract address
  const artifact = SafeDelayArtifact as any;
  const bytecodeHex = artifact.debug?.bytecode;
  if (!bytecodeHex) throw new Error('No bytecode in artifact');

  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, network, provider);
  const utxos = await provider.getUtxos(contract.address);

  return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
}

/**
 * Check if a lock has expired given current block height.
 */
export function isLockExpired(lockEndBlock: number, currentBlock: number): boolean {
  return currentBlock >= lockEndBlock;
}

/**
 * Filter a list of contracts to find expired ones.
 */
export function getExpiredLocks(
  contracts: Array<{ lockEndBlock: number }>,
  currentBlock: number
): Array<{ lockEndBlock: number }> {
  return contracts.filter(c => isLockExpired(c.lockEndBlock, currentBlock));
}

/**
 * Compute the deployment address for a SafeDelay contract.
 */
export async function computeAddress(ownerPkh: string, lockEndBlock: number, network: NetworkConfig['network']): Promise<string> {
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
  const hashBuffer = await crypto.subtle.digest('SHA-256', redeemScript);
  const hash = new Uint8Array(hashBuffer);

  // Build P2SH32 locking bytecode and convert to address
  const prefix = networkPrefixForAddress(network);
  // @ts-ignore
  const lb = encodeLockingBytecodeP2sh32(hash);
  // @ts-ignore
  const result = lockingBytecodeToCashAddress({ prefix, bytecode: lb });
  if (typeof result === 'string') {
    return result; // already an address string
  }
  return result.address;
}

// ============ Transaction Confirmation Polling ============

export interface TxConfirmationResult {
  txHash: string;
  confirmations: number;
  confirmed: boolean;
  error?: string;
}

// ============ Cancel Delay Function ============

export interface CancelDelayOptions {
  wifKey: string;
  ownerPkh: string;
  lockEndBlock: number;
  config: NetworkConfig;
}

export interface CancelDelayResult {
  txHash: string;
  amountSats: bigint;
  feeSats: bigint;
}

/**
 * Cancel a SafeDelay contract and refund all funds to the owner.
 * Can be called at any time before or after lock expiration.
 *
 * @param options.wifKey - WIF private key of the owner
 * @param options.ownerPkh - Owner's public key hash (40 hex chars)
 * @param options.lockEndBlock - Lock expiration block height of the contract
 * @param options.config.network - Network: 'mainnet' | 'testnet' | 'chipnet'
 * @param options.config.electrumUrl - Optional Electrum RPC URL
 * @returns CancelDelayResult with txHash, refunded amount, and fee
 */
export async function cancelDelay(options: CancelDelayOptions): Promise<CancelDelayResult> {
  const { wifKey, ownerPkh, lockEndBlock, config } = options;
  const { network, electrumUrl } = config;
  const rpcUrl = electrumUrl || DEFAULT_ELECTRUM_URLS[network];

  // Derive owner keypair from WIF
  const owner = deriveKeyPair(wifKey, network);

  // Verify the WIF matches the ownerPKH
  if (owner.pkh.toLowerCase() !== ownerPkh.toLowerCase()) {
    throw new Error('WIF key does not match ownerPKH');
  }

  // Get Electrum provider
  const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

  // Get contract instance
  const contract = getSafeDelayContract(ownerPkh, lockEndBlock, network, provider);

  // Fetch contract UTXOs
  const contractUtxos = await provider.getUtxos(contract.address);
  if (contractUtxos.length === 0) {
    throw new Error(`No UTXOs found at contract address ${contract.address}. Contract may not be funded.`);
  }

  // Get owner UTXOs for the owner input
  const ownerUtxos = await getAddressUtxos(rpcUrl, owner.address);

  if (ownerUtxos.length === 0) {
    // Use a dust UTXO if no UTXOs available
    const dustUtxo = {
      tx_hash: '0'.repeat(64),
      tx_pos: 0,
      value: 546,
      height: 0,
    };
    ownerUtxos.push(dustUtxo);
  }

  // Calculate total balance to refund
  const contractBalance = contractUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0n);
  const refundAmount = contractBalance - FEE_SATS;

  if (refundAmount <= 0n) {
    throw new Error('Contract balance too low to cover transaction fee');
  }

  // Build cancel transaction
  const cancelTx = (contract as any).functions.cancel(owner.publicKey);

  // Select owner UTXO for signature
  const ownerInputUtxo = ownerUtxos[0];
  const ownerInput = {
    txHash: ownerInputUtxo.tx_hash,
    vout: ownerInputUtxo.tx_pos,
    satoshis: BigInt(ownerInputUtxo.value),
    token: undefined,
    address: owner.address,
  };

  // Use the contract UTXO and owner input
  const txDetails = await cancelTx
    .from([contractUtxos[0], ownerInput])
    .to(owner.address, refundAmount)
    .withHardcodedPublisherKeySignature(owner.publicKey, owner.signer)
    .send() as any;

  const txHash = typeof txDetails === 'string' ? txDetails : txDetails.txid || txDetails.hash;

  return {
    txHash,
    amountSats: refundAmount,
    feeSats: FEE_SATS,
  };
}

/**
 * Wait for a transaction to be confirmed on the BCH network.
 * Polls Electrum every 5 seconds for up to maxWaitMs milliseconds.
 * @param txHash - The transaction hash to monitor
 * @param network - The network (mainnet, testnet, chipnet)
 * @param options.pollIntervalMs - How often to poll (default 5000ms)
 * @param options.maxWaitMs - Maximum time to wait (default 10 minutes)
 * @returns TxConfirmationResult with confirmations count
 */
export async function waitForTxConfirmation(
  txHash: string,
  network: 'mainnet' | 'testnet' | 'chipnet',
  options: {
    pollIntervalMs?: number;
    maxWaitMs?: number;
  } = {}
): Promise<TxConfirmationResult> {
  const { pollIntervalMs = 5000, maxWaitMs = 600000 } = options;
  const startTime = Date.now();
  const rpcUrl = DEFAULT_ELECTRUM_URLS[network];

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const result = await electrumRpc<{ confirmations: number }>(
        rpcUrl,
        'blockchain.transaction.get',
        [txHash]
      );

      if (result && result.confirmations !== undefined && result.confirmations > 0) {
        return { txHash, confirmations: result.confirmations, confirmed: true };
      }
    } catch (err) {
      // Transaction not found yet or network error — keep polling
      debugLog('waitForTxConfirmation poll error:', err);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return { txHash, confirmations: 0, confirmed: false, error: 'Confirmation timeout' };
}
