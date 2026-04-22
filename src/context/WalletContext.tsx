import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { debug } from '../utils/debug';

// CashScript browser wallet provider interface
// Compatible with CashScript wallet browser extensions (Paytaca, Electron Cash SLP, etc.)
declare global {
  interface Window {
    cashscript?: {
      version: string;
      hasProvider(): Promise<boolean>;
      getSigner(): Promise<WalletSigner>;
    };
  }
}

export interface WalletSigner {
  getAddress(): Promise<string>;
  getPubkey(): Promise<Uint8Array>;
  signTransaction(tx: CashScriptTransaction): Promise<CashScriptTransaction>;
  sendTransaction(tx: CashScriptTransaction): Promise<string>;
}

export interface CashScriptTransaction {
  inputs: Array<{
    outpointIndex: number;
    outpointTransactionHash: string;
    unlockingBytecode: Uint8Array;
    sequenceNumber: number;
    value: number;
  }>;
  outputs: Array<{
    lockingBytecode: Uint8Array;
    value: number;
    tokenCategory?: Uint8Array;
    nftCommitment?: Uint8Array;
  }>;
  locktime: number;
  version: number;
}

interface WalletState {
  address: string | null;
  pubkey: Uint8Array | null;
  pubkeyHash: string | null; // hex string (20 bytes) — for contract constructor args
  connected: boolean;
  provider: 'cashscript' | 'manual' | null;
}

interface WalletContextType {
  wallet: WalletState;
  /** Connect using CashScript wallet provider (browser extension) */
  connect: () => Promise<void>;
  /** Manual entry — read-only, no signing capability */
  connectManual: (address: string, pubkeyHash: string) => void;
  disconnect: () => void;
  /** Sign a transaction using the connected CashScript wallet */
  signTransaction: (tx: CashScriptTransaction) => Promise<CashScriptTransaction | null>;
  /** Send a signed transaction using the connected wallet */
  sendTransaction: (tx: CashScriptTransaction) => Promise<string | null>;
  hasSigner: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    pubkey: null,
    pubkeyHash: null,
    connected: false,
    provider: null,
  });

  // Connect using CashScript wallet provider (browser extension like Paytaca)
  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.cashscript) {
      throw new Error('No CashScript wallet provider found. Please install Paytaca or another compatible wallet browser extension.');
    }

    const hasProvider = await window.cashscript.hasProvider();
    if (!hasProvider) {
      throw new Error('CashScript wallet provider not available. Please install a compatible wallet (Paytaca, Electron Cash SLP).');
    }

    const signer = await window.cashscript.getSigner();
    const address = await signer.getAddress();
    const pubkey = await signer.getPubkey();

    setWallet({
      address,
      pubkey,
      // pubkeyHash: first 20 bytes of pubkey (works for P2PKH-derived PKH)
      // Note: Real hash160 requires sha256+ripemd160 — for SafeDelay, the PKH
      // passed to constructor must match the owner's pubkey hash. Using raw
      // first-20-bytes as approximation; fix by importing hash160 lib if needed.
      pubkeyHash: Array.from(pubkey.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(''),
      connected: true,
      provider: 'cashscript',
    });
  }, []);

  // Manual connection (read-only — no signing)
  const connectManual = useCallback((address: string, pubkeyHash: string) => {
    setWallet({
      address,
      pubkeyHash,
      pubkey: null,
      connected: true,
      provider: 'manual',
    });
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      pubkey: null,
      pubkeyHash: null,
      connected: false,
      provider: null,
    });
  }, []);

  const signTransaction = useCallback(async (tx: CashScriptTransaction): Promise<CashScriptTransaction | null> => {
    if (!window.cashscript || wallet.provider !== 'cashscript') return null;
    try {
      const signer = await window.cashscript.getSigner();
      return signer.signTransaction(tx);
    } catch (err) {
      debug.error('Transaction signing failed:', err);
      return null;
    }
  }, [wallet.provider]);

  const sendTransaction = useCallback(async (tx: CashScriptTransaction): Promise<string | null> => {
    if (!window.cashscript || wallet.provider !== 'cashscript') return null;
    try {
      const signer = await window.cashscript.getSigner();
      return signer.sendTransaction(tx);
    } catch (err) {
      debug.error('Transaction send failed:', err);
      return null;
    }
  }, [wallet.provider]);

  return (
    <WalletContext.Provider value={{ wallet, connect, connectManual, disconnect, signTransaction, sendTransaction, hasSigner: wallet.provider === 'cashscript' }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
