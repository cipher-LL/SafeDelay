import { createContext, useContext, useState, ReactNode } from 'react';

// Simple wallet implementation for now
// Full WalletConnect/AppKit integration requires more setup
// See issue #14 for progress on full WalletConnect

interface WalletState {
  address: string | null;
  pubkeyHash: string | null;
  connected: boolean;
}

interface WalletContextType {
  wallet: WalletState;
  connect: (address: string) => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    pubkeyHash: null,
    connected: false,
  });

  const connect = (address: string) => {
    // Convert BCH address to pubkey hash format for CashScript
    // This is a simplified version - proper implementation would parse the address properly
    const pubkeyHash = address.replace('bitcoincash:', '');
    setWallet({
      address,
      pubkeyHash,
      connected: true,
    });
  };

  const disconnect = () => {
    setWallet({
      address: null,
      pubkeyHash: null,
      connected: false,
    });
  };

  return (
    <WalletContext.Provider value={{ wallet, connect, disconnect }}>
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
