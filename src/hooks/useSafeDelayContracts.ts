import { useState, useEffect, useCallback } from 'react';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { debug } from '../utils/debug';

const STORAGE_KEY = 'safedelay_contracts';

export interface StoredContract {
  address: string;
  ownerPkh: string;
  lockEndBlock: number;
  type: 'single' | 'multisig';
  owners?: string[];
  createdAt: number;
}

export interface ContractWithBalance extends StoredContract {
  balance: number;
  currentBlock: number;
}

/**
 * Hook to manage deployed SafeDelay contracts stored in localStorage
 */
export function useStoredContracts() {
  const [contracts, setContracts] = useState<StoredContract[]>([]);
  const [loading, setLoading] = useState(true);

  // Load contracts from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setContracts(JSON.parse(stored));
      }
    } catch (e) {
      debug.error('Error loading stored contracts:', e);
    }
    setLoading(false);
  }, []);

  // Save contracts to localStorage whenever they change
  const saveContracts = useCallback((newContracts: StoredContract[]) => {
    setContracts(newContracts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newContracts));
  }, []);

  // Add a newly deployed contract
  const addContract = useCallback((contract: StoredContract) => {
    const newContracts = [...contracts, contract];
    saveContracts(newContracts);
  }, [contracts, saveContracts]);

  // Remove a contract (if user wants to hide it)
  const removeContract = useCallback((address: string) => {
    const newContracts = contracts.filter(c => c.address !== address);
    saveContracts(newContracts);
  }, [contracts, saveContracts]);

  // Clear all contracts
  const clearContracts = useCallback(() => {
    saveContracts([]);
  }, [saveContracts]);

  return {
    contracts,
    loading,
    addContract,
    removeContract,
    clearContracts,
  };
}

// Map our network strings to CashScript Network type
function toCashScriptNetwork(network: 'mainnet' | 'testnet' | 'chipnet'): Network {
  switch (network) {
    case 'mainnet':
      return Network.MAINNET;
    case 'testnet':
      return Network.TESTNET3;
    case 'chipnet':
      return Network.CHIPNET;
    default:
      return Network.TESTNET3;
  }
}

/**
 * Hook to fetch real contract data from Electrum
 */
export function useElectrumContractData(
  storedContracts: StoredContract[],
  network: 'mainnet' | 'testnet' | 'chipnet'
) {
  const [contractsWithData, setContractsWithData] = useState<ContractWithBalance[]>([]);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (storedContracts.length === 0) {
      setContractsWithData([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchData() {
      try {
        const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

        // Get current block height
        const blockHeight = await provider.getBlockHeight();
        if (cancelled) return;
        setCurrentBlock(Number(blockHeight));

        // Fetch UTXOs for each contract address
        const contractsData: ContractWithBalance[] = [];

        for (const contract of storedContracts) {
          try {
            const utxos = await provider.getUtxos(contract.address);
            // utxo.satoshis is bigint - convert to BCH
            const balance = utxos.reduce((sum, utxo) => sum + Number(utxo.satoshis) / 100000000, 0);
            
            contractsData.push({
              ...contract,
              balance,
              currentBlock: Number(blockHeight),
            });
          } catch (utxoError) {
            // If we can't fetch UTXOs for a contract (e.g., it doesn't exist yet),
            // still include it with 0 balance
            debug.warn(`Could not fetch UTXOs for ${contract.address}:`, utxoError);
            contractsData.push({
              ...contract,
              balance: 0,
              currentBlock: Number(blockHeight),
            });
          }
        }

        if (!cancelled) {
          setContractsWithData(contractsData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          debug.error('Error fetching contract data from Electrum:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch from Electrum');
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [storedContracts, network]);

  return {
    contracts: contractsWithData,
    currentBlock,
    loading,
    error,
  };
}
