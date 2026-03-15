import { createContext, useContext, useState, ReactNode } from 'react';

interface WalletState {
  address: string | null;
  pubkeyHash: string | null;
  connected: boolean;
}

interface WalletContextType {
  wallet: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    pubkeyHash: null,
    connected: false,
  });

  const connect = async () => {
    // TODO: Implement wallet connection using WalletConnect
    // For now, placeholder
    console.log('Wallet connection not yet implemented');
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
