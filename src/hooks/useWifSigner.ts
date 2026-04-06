/**
 * useWifSigner - WIF-based transaction signing for SafeDelay
 *
 * Enables users to sign SafeDelay transactions using a raw WIF private key
 * without requiring a CashScript browser extension wallet.
 *
 * Security: The WIF key is used only for signing in-memory, never stored or transmitted.
 */

import { useCallback } from 'react';
import {
  ElectrumNetworkProvider,
  Network,
  Contract,
  SignatureTemplate,
} from 'cashscript';
import {
  decodePrivateKeyWif,
  publicKeyToP2pkhCashAddress,
  hash160,
  cashAddressToLockingBytecode,
} from '@bitauth/libauth';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';

// ============ Types ============

export interface NetworkConfig {
  network: 'mainnet' | 'testnet' | 'chipnet';
}

// ============ Network helpers ============

function toCashScriptNetwork(network: NetworkConfig['network']): Network {
  switch (network) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
  }
}

function networkPrefix(network: NetworkConfig['network']): 'bitcoincash' | 'bchtest' | 'bchreg' {
  switch (network) {
    case 'mainnet': return 'bitcoincash';
    case 'testnet': return 'bchtest';
    case 'chipnet': return 'bchtest';
  }
}

// ============ UTXO Helpers ============

interface ElectrumUtxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
}

// Backup Electrum servers — ordered by perceived reliability
const ELECTRUM_SERVERS: Record<string, { hostname: string; name: string }[]> = {
  chipnet: [
    { hostname: 'chipnet.imaginary.cash', name: 'Imaginary Cash (Chipnet)' },
    { hostname: 'electroncash.de', name: 'Electron Cash DE (Chipnet)' },
    { hostname: 'blacktown.io', name: 'Blacktown (Chipnet)' },
  ],
  testnet: [
    { hostname: 'electrum.imaginary.cash', name: 'Imaginary Cash (Testnet)' },
    { hostname: 'bch.imaginary.machine', name: 'Imaginary Machine' },
    { hostname: 'electroncash.org', name: 'Electron Cash' },
  ],
  mainnet: [
    { hostname: 'electrum.imaginary.cash', name: 'Imaginary Cash' },
    { hostname: 'bch.imaginary.machine', name: 'Imaginary Machine' },
    { hostname: 'electroncash.org', name: 'Electron Cash' },
    { hostname: 'electrum-abc.cash', name: 'ABC Electrum' },
    { hostname: 'bch.liops.co', name: 'Liops' },
  ],
};

// Last successful server per network (preferred on next call)
let lastServer: Record<string, string> = {
  chipnet: '',
  testnet: '',
  mainnet: '',
};

const MAX_RETRIES = 2; // retries per server before moving to next

async function electrumRpc<T>(
  url: string,
  method: string,
  params: unknown[] = [],
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.result;
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError || new Error('Electrum RPC failed');
}

async function getUtxos(address: string, network: NetworkConfig['network'] = 'chipnet'): Promise<ElectrumUtxo[]> {
  try {
    const result = cashAddressToLockingBytecode(address);
    if (typeof result === 'string') throw new Error('Invalid address: ' + result);
    const bytecode = result.bytecode;
    const ab = new ArrayBuffer(bytecode.byteLength);
    new Uint8Array(ab).set(bytecode);
    const scriptHashBuffer = await crypto.subtle.digest('SHA-256', ab);
    const scriptHash = new Uint8Array(scriptHashBuffer).reverse();
    const scripthashHex = Array.from(scriptHash).map(b => b.toString(16).padStart(2, '0')).join('');

    const servers = ELECTRUM_SERVERS[network] || ELECTRUM_SERVERS.chipnet;

    // Build server list: last successful first, then the rest
    const lastHost = lastServer[network];
    const serversToTry = lastHost
      ? [servers.find(s => s.hostname.includes(lastHost))?.hostname || lastHost, ...servers.map(s => s.hostname).filter(h => h !== lastHost)]
      : servers.map(s => s.hostname);

    let lastError: Error | null = null;
    for (const hostname of serversToTry) {
      const url = `https://${hostname}/rpc`;
      try {
        const utxos = await electrumRpc<ElectrumUtxo[]>(url, 'blockchain.scripthash.listunspent', [scripthashHex]);
        lastServer[network] = hostname;
        console.log(`[useWifSigner] ✅ UTXOs fetched from ${hostname}`);
        return utxos;
      } catch (e) {
        lastError = e as Error;
        console.warn(`[useWifSigner] ⚠️ Failed ${hostname}: ${lastError.message}, trying next server...`);
      }
    }

    console.error('[useWifSigner] ❌ All Electrum servers failed:', lastError?.message);
    return [];
  } catch (e) {
    console.error('[useWifSigner] Error fetching UTXOs:', e);
    return [];
  }
}

// ============ Key derivation ============

interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  pkh: string;
  signer: SignatureTemplate;
}

/**
 * Derive address, public key, and signer from a WIF key.
 * Validates that the WIF key's encoded network matches the selected network.
 */
function deriveKeyPair(wifKey: string, network: NetworkConfig['network']): KeyPair {
  const decoded = decodePrivateKeyWif(wifKey);
  if (typeof decoded === 'string') {
    throw new Error(`Invalid WIF key: ${decoded}`);
  }

  const { privateKey, type: wifType } = decoded;

  // Validate WIF-encoded network matches the UI's selected network
  const isMainnet = wifType === 'mainnet' || wifType === 'mainnetUncompressed';
  const isTestnet = wifType === 'testnet' || wifType === 'testnetUncompressed';
  const isSelectedMainnet = network === 'mainnet';
  const isSelectedTestnet = network === 'testnet' || network === 'chipnet';

  if (isSelectedMainnet && !isMainnet) {
    throw new Error(
      `Network mismatch: this WIF key is for ${wifType === 'testnet' || wifType === 'testnetUncompressed' ? 'testnet/chipnet' : wifType}, but you have mainnet selected. ` +
      `Please use a mainnet WIF key, or switch to testnet/chipnet in the network selector.`
    );
  }
  if (isSelectedTestnet && !isTestnet) {
    throw new Error(
      `Network mismatch: this WIF key is for mainnet, but you have testnet/chipnet selected. ` +
      `Please use a testnet or chipnet WIF key, or switch to mainnet in the network selector.`
    );
  }

  const prefix = networkPrefix(network);

  // Create signer and derive public key from private key
  const signer = new SignatureTemplate(privateKey);
  const publicKey = signer.getPublicKey();

  // Derive address from public key
  const addressResult = publicKeyToP2pkhCashAddress({ publicKey, prefix });
  if (typeof addressResult === 'string') {
    throw new Error(`Failed to derive address from WIF: ${addressResult}`);
  }
  const address = addressResult.address;

  // Compute pubkey hash (hash160) from public key for contract constructor args
  const pkhResult = hash160(publicKey);
  const pkh = Array.from(pkhResult).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    privateKey,
    publicKey,
    address,
    pkh,
    signer,
  };
}

// ============ Main hook ============

const DUST_SATS = 546n;
const FEE_SATS = 1000n;

export function useWifSigner() {
  /**
   * Sign and broadcast a SafeDelay withdraw transaction using a WIF key.
   */
  const signWithdraw = useCallback(async ({
    wifKey,
    network,
    ownerPkh,
    lockEndBlock,
    contractAddress,
    walletAddress,
    amountSats,
  }: {
    wifKey: string;
    network: NetworkConfig['network'];
    ownerPkh: string;
    lockEndBlock: number;
    contractAddress: string;
    walletAddress: string;
    amountSats: bigint;
  }): Promise<string> => {
    const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

    const keypair = deriveKeyPair(wifKey, network);

    // Verify the WIF-derived address matches the wallet address provided
    if (keypair.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(
        `WIF key address mismatch. WIF derives ${keypair.address} but expected ${walletAddress}. ` +
        `Make sure the WIF key matches your wallet.`
      );
    }

    // Fetch UTXOs
    const contractUtxos = await provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error('No UTXOs found at contract address. Make sure the contract is funded.');
    }

    const walletUtxos = await getUtxos(walletAddress, network);
    if (walletUtxos.length === 0) {
      throw new Error('No wallet UTXOs found. Your wallet needs BCH to pay miner fees.');
    }

    // Build withdraw transaction using CashScript contract API
    const contract = new Contract(SafeDelayArtifact as any, [ownerPkh, BigInt(lockEndBlock)], { provider } as any);

    // withdraw(pubkey ownerPk, sig ownerSig, int withdrawAmount)
    const withdrawTx = (contract as any).functions.withdraw(ownerPkh, amountSats);

    const txHex = await withdrawTx
      .from([contractUtxos[0], {
        txHash: walletUtxos[0].tx_hash,
        vout: walletUtxos[0].tx_pos,
        satoshis: BigInt(walletUtxos[0].value),
        token: undefined,
        address: walletAddress,
      }])
      .withHardcodedLockTime(lockEndBlock)
      .send() as string;

    return txHex;
  }, []);

  /**
   * Sign and broadcast a SafeDelay cancel transaction using a WIF key.
   */
  const signCancel = useCallback(async ({
    wifKey,
    network,
    ownerPkh,
    lockEndBlock,
    contractAddress,
    walletAddress,
    contractBalance,
  }: {
    wifKey: string;
    network: NetworkConfig['network'];
    ownerPkh: string;
    lockEndBlock: number;
    contractAddress: string;
    walletAddress: string;
    contractBalance: bigint;
  }): Promise<string> => {
    const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

    const keypair = deriveKeyPair(wifKey, network);

    if (keypair.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(
        `WIF key address mismatch. WIF derives ${keypair.address} but expected ${walletAddress}.`
      );
    }

    const contractUtxos = await provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error('No UTXOs found at contract address.');
    }

    const walletUtxos = await getUtxos(walletAddress, network);
    if (walletUtxos.length === 0) {
      throw new Error('No wallet UTXOs found.');
    }

    // cancel(pubkey ownerPk, sig ownerSig)
    const contract = new Contract(SafeDelayArtifact as any, [ownerPkh, BigInt(lockEndBlock)], { provider } as any);
    const cancelTx = (contract as any).functions.cancel(ownerPkh);

    // Calculate amount to send (balance - fee)
    const sendAmount = contractBalance - FEE_SATS;
    if (sendAmount < DUST_SATS) {
      throw new Error('Insufficient contract balance to cover miner fees.');
    }

    const txHex = await cancelTx
      .from([contractUtxos[0], {
        txHash: walletUtxos[0].tx_hash,
        vout: walletUtxos[0].tx_pos,
        satoshis: BigInt(walletUtxos[0].value),
        token: undefined,
        address: walletAddress,
      }])
      .to(walletAddress, sendAmount)
      .send() as string;

    return txHex;
  }, []);

  /**
   * Validate a WIF key and return keypair info.
   */
  const validateWifKey = useCallback((wifKey: string, network: NetworkConfig['network']): { address: string; pkh: string } => {
    const keypair = deriveKeyPair(wifKey, network);
    return { address: keypair.address, pkh: keypair.pkh };
  }, []);

  /**
   * Get the address derived from a WIF key (for display purposes).
   */
  const getAddressFromWif = useCallback((wifKey: string, network: NetworkConfig['network']): string => {
    return deriveKeyPair(wifKey, network).address;
  }, []);

  return {
    signWithdraw,
    signCancel,
    validateWifKey,
    getAddressFromWif,
  };
}
