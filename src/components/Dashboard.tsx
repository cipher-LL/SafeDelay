import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { useWalletLabels } from '../hooks/useWalletLabels';
import { debug, debugLog } from '../utils/debug';
import { useWalletBackup } from '../hooks/useWalletBackup';
import { useDepositMilestones } from '../hooks/useDepositMilestones';
import { useStoredContracts, useElectrumContractData, StoredContract } from '../hooks/useSafeDelayContracts';
import { useOnChainTxHistory } from '../hooks/useOnChainTxHistory';
import { useWifSigner } from '../hooks/useWifSigner';
import { useOnChainContractDiscovery, DiscoveredContract } from '../hooks/useOnChainContractDiscovery';
import { QRCodeSVG } from 'qrcode.react';
import QrScanner from './QrScanner';
import { ElectrumNetworkProvider, Network, Contract } from 'cashscript';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';
import { deposit, waitForTxConfirmation } from '../utils/SafeDelayLibrary';

const STORAGE_KEY = 'safedelay_transactions';

const DashboardContainer = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h2`
  font-size: 24px;
  margin-bottom: 8px;
`;

const Description = styled.p`
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.9);
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
`;

const StatCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
`;

const StatValue = styled.div<{ $color?: string }>`
  font-size: 32px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#4f46e5'};
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
`;

const AnalyticsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const AnalyticsCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const AnalyticsValue = styled.div<{ $color?: string }>`
  font-size: 28px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#0AC18E'};
  margin-bottom: 4px;
`;

const AnalyticsLabel = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
`;

const ProgressBar = styled.div`
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  margin-top: 12px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: linear-gradient(90deg, #4f46e5, #0AC18E);
  border-radius: 4px;
  transition: width 0.3s ease;
`;

const ContractList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ContractCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const ContractInfo = styled.div`
  flex: 1;
  min-width: 200px;
`;

const ContractAddress = styled.div`
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
`;

const QRCodeSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
`;

const QRCodeWrapper = styled.div`
  background: white;
  padding: 8px;
  border-radius: 6px;
`;

const CopyButton = styled.button`
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(79, 70, 229, 0.2);
  color: #a5b4fc;

  &:hover {
    background: rgba(79, 70, 229, 0.4);
  }
`;

const ContractBalance = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: #10b981;
`;

const ContractStatus = styled.span<{ $locked: boolean }>`
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $locked }) => ($locked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)')};
  color: ${({ $locked }) => ($locked ? '#ef4444' : '#10b981')};
`;

const ContractActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const WithdrawButton = styled(ActionButton)`
  background: #4f46e5;
  color: white;

  &:hover:not(:disabled) {
    background: #4338ca;
  }
`;

const CancelButton = styled(ActionButton)`
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;

  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const DepositButton = styled(ActionButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.3);
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
`;

const TransactionSection = styled.div`
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const FilterBar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border: 1px solid ${({ $active }) => $active ? '#4f46e5' : 'rgba(255, 255, 255, 0.2)'};
  border-radius: 20px;
  background: ${({ $active }) => $active ? 'rgba(79, 70, 229, 0.2)' : 'transparent'};
  color: ${({ $active }) => $active ? '#4f46e5' : 'rgba(255, 255, 255, 0.6)'};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #4f46e5;
  }
`;

const TransactionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TransactionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  flex-wrap: wrap;
  gap: 12px;
`;

const SortBar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
`;

const SortLabel = styled.span`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-right: 8px;
`;

const SortSelect = styled.select`
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 13px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }
`;

const LabelInput = styled.input`
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 13px;
  width: 140px;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
`;

const LabelButton = styled.button`
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
`;

const SaveLabelBtn = styled(LabelButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover {
    background: rgba(16, 185, 129, 0.3);
  }
`;

const RemoveLabelBtn = styled(LabelButton)`
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const LabelDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const WalletLabel = styled.span`
  background: rgba(79, 70, 229, 0.2);
  color: #a5b4fc;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
`;

const BackupSection = styled.div`
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const BackupActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

const BackupButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ExportBtn = styled(BackupButton)`
  background: #4f46e5;
  color: white;

  &:hover:not(:disabled) {
    background: #4338ca;
  }
`;

const ImportBtn = styled(BackupButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.3);
  }
`;

const FileInput = styled.input`
  display: none;
`;

const PasswordInput = styled.input`
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  width: 200px;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
`;

const PasswordLabel = styled.span`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-left: 12px;
`;

const MessageBox = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  background: ${({ $type }) => $type === 'success' ? 'rgba(16, 185, 129, 0.2)' : $type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(79, 70, 229, 0.2)'};
  color: ${({ $type }) => $type === 'success' ? '#10b981' : $type === 'error' ? '#ef4444' : '#a5b4fc'};
`;

const EncryptNote = styled.p`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
`;

const TransactionInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TransactionIcon = styled.span<{ $type: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: ${({ $type }) =>
    $type === 'deposit' ? 'rgba(16, 185, 129, 0.2)' :
    $type === 'withdraw' ? 'rgba(239, 68, 68, 0.2)' :
    'rgba(79, 70, 229, 0.2)'};
`;

const TransactionDetails = styled.div``;

const TransactionType = styled.div`
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
`;

const TransactionDate = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
`;

const TransactionAmount = styled.div<{ $type: string }>`
  font-size: 18px;
  font-weight: 700;
  color: ${({ $type }) =>
    $type === 'deposit' ? '#10b981' :
    $type === 'withdraw' ? '#ef4444' : '#4f46e5'};
`;

const TxHashLink = styled.a`
  font-size: 12px;
  color: #a5b4fc;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

// --- Pending Transaction Modal ---
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

const ModalBox = styled.div`
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 32px;
  max-width: 480px;
  width: 90%;
`;

const ModalTitle = styled.h3`
  font-size: 20px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.95);
`;

const ModalDesc = styled.p`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 20px;
  line-height: 1.5;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  font-family: monospace;
  box-sizing: border-box;
  margin-bottom: 16px;

  &:focus {
    outline: none;
    border-color: #4f46e5;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const ModalConfirmBtn = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #4f46e5;
  color: white;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #4338ca;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalCancelBtn = styled.button`
  padding: 10px 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`;

// --- Types ---
interface TimeLock {
  address: string;
  balance: number;
  lockEndBlock: number;
  currentBlock: number;
  type: 'single' | 'multisig';
  owners?: string[];
}

interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'cancel' | 'create';
  amount: number;
  timestamp: number;
  txHash: string;
  contractAddress: string;
}

interface PendingTx {
  id: string;
  contractAddress: string;
  type: 'withdraw' | 'cancel' | 'deposit';
  amount?: number;
  status: 'confirm' | 'broadcasting' | 'confirming' | 'confirmed' | 'success' | 'error';
  txHash?: string;
  error?: string;
}

type SortOption = 'date' | 'amount' | 'unlock';

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

function getExplorerUrl(network: 'mainnet' | 'testnet' | 'chipnet', txHash: string): string {
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/transaction/${txHash}`;
  }
  return `https://chipnet.blockchair.com/bitcoin-cash/transaction/${txHash}`;
}

export default function Dashboard({ onNavigateTab }: { onNavigateTab?: (tab: 'create' | 'multisig' | 'dashboard' | 'manager') => void }) {
  const { network } = useNetwork();
  const { wallet, hasSigner } = useWallet();
  const { getLabel, setLabel, removeLabel } = useWalletLabels();
  const { contracts: storedContracts } = useStoredContracts();
  const { contracts: contractsWithData, currentBlock } = useElectrumContractData(storedContracts, network);
  const { signWithdraw, signCancel, getAddressFromWif } = useWifSigner();
  const [contracts, setContracts] = useState<TimeLock[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdraw' | 'cancel' | 'create'>(() => {
    try { return (localStorage.getItem('safedelay-tx-filter') as any) || 'all'; } catch { return 'all'; }
  });
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    try { return (localStorage.getItem('safedelay-sort') as SortOption) || 'date'; } catch { return 'date'; }
  });
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<PendingTx | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [txStatus, setTxStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [scanningOnChain, setScanningOnChain] = useState(false);
  const [lastOnChainScan, setLastOnChainScan] = useState<number>(0);
  // WIF signing state
  const [wifMode, setWifMode] = useState(false);
  const [wifKey, setWifKey] = useState('');
  const [wifAddress, setWifAddress] = useState('');
  const [wifError, setWifError] = useState('');

  const { fetchHistory } = useOnChainTxHistory();
  const { discoverContracts, scanning: recoveryScanning, scanProgress: recoveryScanProgress, lastScanResult } = useOnChainContractDiscovery();
  const [discoveredContracts, setDiscoveredContracts] = useState<DiscoveredContract[]>([]);
  const [recoveryScanDone, setRecoveryScanDone] = useState(false);

  // Load saved transactions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTransactions(JSON.parse(stored));
      }
    } catch (e) {
      debug.error('Error loading transactions:', e);
    }
  }, []);

  // Save transactions to localStorage
  const saveTransactions = useCallback((txs: Transaction[]) => {
    setTransactions(txs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  }, []);

  // Add a transaction record
  const addTransactionRecord = useCallback((tx: Omit<Transaction, 'id' | 'timestamp'>) => {
    const newTx: Transaction = {
      ...tx,
      id: `${tx.txHash}-${Date.now()}`,
      timestamp: Date.now(),
    };
    saveTransactions([newTx, ...transactions]);
  }, [transactions, saveTransactions]);

  // Wallet backup data getter
  const getWalletData = useCallback(() => ({
    version: '1.0',
    exportedAt: Date.now(),
    addresses: contracts.map(c => ({
      address: c.address,
      label: getLabel(c.address),
      type: c.type,
      owners: c.owners,
    })),
    settings: {
      network: network,
      lastExportBlock: Math.max(...contracts.map(c => c.currentBlock), 0),
    },
  }), [contracts, getLabel, network]);

  const {
    exportBackup,
    importBackup,
    exporting,
    importing,
    error: backupError,
    success: backupSuccess,
    clearMessages: clearBackupMessages,
  } = useWalletBackup(getWalletData);

  // Deposit milestone notifications
  const {
    notifications,
    milestones,
    permission,
    requestPermission,
    addDeposit,
    updateBlockHeight,
    setMilestoneTargets,
    dismissNotification,
    clearNotifications,
  } = useDepositMilestones();

  const handleExport = async () => {
    await exportBackup(showExportPassword && exportPassword ? exportPassword : undefined);
  };

  const handleImport = async () => {
    if (importFile) {
      await importBackup(importFile, importPassword || undefined);
      setImportFile(null);
      setImportPassword('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      e.target.value = '';
    }
  };

  // ─── On-chain contract recovery ───────────────────────────────────────────
  const handleRecoveryScan = async () => {
    if (!wallet.connected || !wallet.pubkeyHash || !wallet.address) {
      setTxStatus({ type: 'error', message: 'Please connect your wallet first.' });
      return;
    }
    setDiscoveredContracts([]);
    setRecoveryScanDone(false);
    const result = await discoverContracts(wallet.address, wallet.pubkeyHash, network);
    setDiscoveredContracts(result.discovered);
    setRecoveryScanDone(true);
  };

  const handleRecoverContract = (contract: DiscoveredContract) => {
    if (!wallet.pubkeyHash) return;
    const newContract: StoredContract = {
      address: contract.address,
      ownerPkh: wallet.pubkeyHash,
      lockEndBlock: contract.lockEndBlock,
      type: contract.type,
      owners: contract.owners,
      createdAt: Date.now(),
    };
    // Merge with existing contracts (avoid duplicates by address)
    const existing = storedContracts.find(c => c.address === contract.address);
    if (!existing) {
      const merged = [...storedContracts, newContract];
      localStorage.setItem('safedelay_contracts', JSON.stringify(merged));
      // Trigger reload via page refresh (simple approach)
      setTxStatus({ type: 'success', message: `✅ Contract ${contract.address.slice(0, 16)}... recovered! Refreshing page...` });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setTxStatus({ type: 'info', message: `ℹ️ Contract ${contract.address.slice(0, 16)}... is already in your list.` });
    }
  };

  const handleRecoverAll = () => {
    discoveredContracts.forEach(c => handleRecoverContract(c));
  };

  // Sync contracts from Electrum hook to local state
  useEffect(() => {
    if (wallet.connected && contractsWithData.length > 0) {
      const timeLocks: TimeLock[] = contractsWithData.map(c => ({
        address: c.address,
        balance: c.balance,
        lockEndBlock: c.lockEndBlock,
        currentBlock: c.currentBlock,
        type: c.type,
        owners: c.owners,
      }));
      setContracts(timeLocks);

      contractsWithData.forEach(c => {
        addDeposit(c.address, c.lockEndBlock, c.currentBlock);
      });
    } else if (!wallet.connected) {
      setContracts([]);
    }
  }, [wallet.connected, contractsWithData, addDeposit]);

  // Update block height for milestone tracking when it changes
  useEffect(() => {
    if (currentBlock > 0 && wallet.connected) {
      updateBlockHeight(currentBlock);
    }
  }, [currentBlock, wallet.connected, updateBlockHeight]);

  // Scan on-chain transaction history for contracts when they load
  useEffect(() => {
    if (!wallet.connected || contractsWithData.length === 0) return;
    if (scanningOnChain) return; // Already scanning
    // Skip if we scanned recently (within 5 minutes)
    if (Date.now() - lastOnChainScan < 5 * 60 * 1000) return;

    let cancelled = false;
    setScanningOnChain(true);

    async function scanContracts() {
      // Build set of known tx hashes from localStorage for deduplication
      const knownHashes = new Set(transactions.map(t => t.txHash));

      const allOnChainTxs: Transaction[] = [];

      for (const contract of contractsWithData) {
        try {
          const onChainTxs = await fetchHistory(contract.address, network, knownHashes);

          for (const otx of onChainTxs) {
            // Skip if we already have this tx locally
            if (knownHashes.has(otx.txHash)) continue;

            // Map OnChainTx type to Transaction type
            // 'send' and 'receive' are standard BCH sends not related to SafeDelay functions
            // We only record SafeDelay-relevant types
            if (otx.type === 'unknown' || otx.type === 'send' || otx.type === 'receive') {
              // Skip standard BCH sends - only record contract function calls
              continue;
            }

            allOnChainTxs.push({
              id: `onchain-${otx.txHash}-${otx.blockHeight}`,
              type: otx.type as 'deposit' | 'withdraw' | 'cancel' | 'create',
              amount: otx.amount,
              timestamp: otx.timestamp,
              txHash: otx.txHash,
              contractAddress: contract.address,
            });
          }
        } catch (e) {
          debugLog('Dashboard', 'Error scanning on-chain history for', contract.address + ':', e);
        }
      }

      if (!cancelled && allOnChainTxs.length > 0) {
        // Merge: new on-chain txs + existing local txs, sorted by timestamp desc
        const merged = [...allOnChainTxs, ...transactions];
        merged.sort((a, b) => b.timestamp - a.timestamp);
        saveTransactions(merged);
        setLastOnChainScan(Date.now());
      }

      if (!cancelled) {
        setScanningOnChain(false);
      }
    }

    scanContracts();

    return () => {
      cancelled = true;
    };
  }, [wallet.connected, contractsWithData, scanningOnChain, lastOnChainScan]);

  // Sort contracts based on selected option
  const sortedContracts = [...contracts].sort((a, b) => {
    switch (sortBy) {
      case 'amount':
        return b.balance - a.balance;
      case 'unlock':
        const aRemaining = a.lockEndBlock - a.currentBlock;
        const bRemaining = b.lockEndBlock - b.currentBlock;
        return aRemaining - bRemaining;
      case 'date':
      default:
        return a.lockEndBlock - b.lockEndBlock;
    }
  });

  const handleSaveLabel = (address: string) => {
    if (labelInput.trim()) {
      setLabel(address, labelInput.trim());
    } else {
      removeLabel(address);
    }
    setEditingLabel(null);
    setLabelInput('');
  };

  const handleEditLabel = (address: string) => {
    const existing = getLabel(address);
    setEditingLabel(address);
    setLabelInput(existing || '');
  };

  const handleCopyAddress = async (address: string) => {
    const cleanAddress = address.replace(/^bitcoincash:/, '');
    await navigator.clipboard.writeText(cleanAddress);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleToggleQR = (address: string) => {
    setShowQRCode(showQRCode === address ? null : address);
  };

  const getTimeRemaining = (lockEnd: number, current: number) => {
    const blocksRemaining = lockEnd - current;
    if (blocksRemaining <= 0) return 'Unlocked';
    const days = Math.floor(blocksRemaining / 144);
    if (days === 0) return `${blocksRemaining} blocks`;
    return `${days} days`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get contract instance from address + stored metadata
  const getContractInstance = useCallback((
    address: string,
    lockEndBlock: number,
    type: 'single' | 'multisig',
    owners?: string[]
  ): any => {
    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      if (type === 'multisig' && owners && owners.length >= 3) {
        return new Contract(
          SafeDelayMultiSigArtifact as any,
          [owners[0], owners[1], owners[2], BigInt(2), BigInt(lockEndBlock)],
          { provider } as any
        );
      }
      // Single owner: storedContracts has ownerPkh
      const stored = storedContracts.find(c => c.address === address);
      const pkh = stored?.ownerPkh || wallet.pubkeyHash || '';
      return new Contract(
        SafeDelayArtifact as any,
        [pkh, BigInt(lockEndBlock)],
        { provider } as any
      );
    } catch (e) {
      debug.error('Error creating contract instance:', e);
      return null;
    }
  }, [network, wallet.pubkeyHash, storedContracts]);

  // ─── Withdraw handler ───────────────────────────────────────────────────
  const handleWithdraw = useCallback((contract: TimeLock) => {
    if (contract.balance <= 0) {
      setTxStatus({ type: 'error', message: 'No balance to withdraw from this contract.' });
      return;
    }
    setPendingTx({
      id: `withdraw-${contract.address}-${Date.now()}`,
      contractAddress: contract.address,
      type: 'withdraw',
      amount: contract.balance,
      status: 'confirm',
    });
  }, []);

  // ─── Cancel handler ──────────────────────────────────────────────────────
  const handleCancel = useCallback((contract: TimeLock) => {
    if (contract.balance <= 0) {
      setTxStatus({ type: 'error', message: 'No balance to cancel from this contract.' });
      return;
    }
    setPendingTx({
      id: `cancel-${contract.address}-${Date.now()}`,
      contractAddress: contract.address,
      type: 'cancel',
      status: 'confirm',
    });
  }, []);

  // ─── Deposit handler ─────────────────────────────────────────────────────
  const handleDepositRequest = useCallback((contract: TimeLock) => {
    setPendingTx({
      id: `deposit-${contract.address}-${Date.now()}`,
      contractAddress: contract.address,
      type: 'deposit',
      amount: depositAmount ? parseFloat(depositAmount) : 0.01,
      status: 'confirm',
    });
  }, [depositAmount]);

  // ─── Execute pending transaction ─────────────────────────────────────────
  const executePendingTx = useCallback(async () => {
    if (!pendingTx) return;

    if (!wallet.connected) {
      setTxStatus({ type: 'error', message: 'Please connect your wallet first.' });
      return;
    }

    if (!hasSigner) {
      setTxStatus({
        type: 'error',
        message: 'No wallet signer available. Use "Sign with WIF Private Key" button below to sign with your WIF key instead.',
      });
      return;
    }

    setPendingTx(prev => prev ? { ...prev, status: 'broadcasting' } : null);
    setTxStatus(null);

    try {
      const stored = storedContracts.find(c => c.address === pendingTx.contractAddress);
      if (!stored) throw new Error('Contract not found in local storage. Add it from the Create tab.');

      const contract = getContractInstance(
        pendingTx.contractAddress,
        stored.lockEndBlock,
        stored.type,
        stored.owners
      );
      if (!contract) throw new Error('Could not create contract instance. Check network and contract address.');

      // Get contract UTXOs to spend
      const contractUtxos = await (contract as any).getUtxos();
      if (!contractUtxos || contractUtxos.length === 0) {
        throw new Error('No UTXOs found at this contract address. Make sure it has a balance.');
      }

      // Get wallet UTXOs for fee payment
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const walletUtxos = wallet.address ? await provider.getUtxos(wallet.address) : [];
      if (walletUtxos.length === 0) {
        throw new Error('No wallet UTXOs found. Your wallet needs BCH to pay miner fees.');
      }

      // Owner PKH hex — stored from when contract was created
      const ownerPkh = stored.ownerPkh || wallet.pubkeyHash || '';
      if (!ownerPkh) throw new Error('Owner public key hash not found for this contract.');

      // Build and send transaction based on action type
      let tx: any;
      let txHash: string;

      if (pendingTx.type === 'withdraw') {
        // withdraw(pubkey ownerPk, sig ownerSig, int withdrawAmount)
        // The locktime is enforced via .withHardcodedLockTime()
        const contractBalance = contractUtxos.reduce((sum: bigint, u: any) => sum + u.satoshis, 0);
        const withdrawAmount = pendingTx.amount ? BigInt(Math.round(pendingTx.amount * 100000000)) : contractBalance;
        const withdrawTx = (contract as any).functions.withdraw(ownerPkh, withdrawAmount);
        tx = await withdrawTx
          .from([contractUtxos[0], walletUtxos[0]])
          .withHardcodedLockTime(stored.lockEndBlock)
          .send();
        txHash = typeof tx === 'string' ? tx : (tx.txid || tx.hash || '');
      } else if (pendingTx.type === 'cancel') {
        // cancel(pubkey ownerPk, sig ownerSig) — no locktime restriction
        const cancelTx = (contract as any).functions.cancel(ownerPkh);
        tx = await cancelTx
          .from([contractUtxos[0], walletUtxos[0]])
          .send();
        txHash = typeof tx === 'string' ? tx : (tx.txid || tx.hash || '');
      } else {
        // deposit(pubkey depositorPk, sig depositorSig)
        // Contract UTXO + depositor wallet UTXO -> contract UTXO with combined value
        if (!wallet.address) throw new Error('Wallet address not available.');
        // Use owner PKH as depositor (anyone can deposit, sig just needs to match)
        const depositTx = (contract as any).functions.deposit(ownerPkh);
        tx = await depositTx
          .from([contractUtxos[0], walletUtxos[0]])
          .send();
        txHash = typeof tx === 'string' ? tx : (tx.txid || tx.hash || '');
      }

      if (!txHash) throw new Error('No transaction hash returned from the network.');

      addTransactionRecord({
        type: pendingTx.type === 'deposit' ? 'deposit' : pendingTx.type === 'cancel' ? 'cancel' : 'withdraw',
        amount: pendingTx.amount || 0,
        txHash,
        contractAddress: pendingTx.contractAddress,
      });

      setPendingTx(prev => prev ? { ...prev, status: 'success', txHash } : null);
      setTxStatus({
        type: 'success',
        message: `${pendingTx.type.charAt(0).toUpperCase() + pendingTx.type.slice(1)} transaction submitted! Waiting for confirmation...`,
      });

      // Start confirmation polling in background
      waitForTxConfirmation(txHash, network, { maxWaitMs: 600000 }).then(result => {
        if (result.confirmed) {
          setPendingTx(prev => prev ? { ...prev, status: 'confirmed' } : null);
          setTxStatus({
            type: 'success',
            message: `✅ ${pendingTx.type.charAt(0).toUpperCase() + pendingTx.type.slice(1)} confirmed! (${result.confirmations} confirmation${result.confirmations !== 1 ? 's' : ''})`,
          });
        } else {
          setTxStatus(prev => prev ? { ...prev, message: prev.message + ' (polling timed out - tx may still confirm)' } : null);
        }
      }).catch(() => {
        // Polling error - tx may still confirm
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Transaction failed.';
      let userMsg = errorMsg;

      if (errorMsg.includes('not satisfied') || errorMsg.includes('lock') || errorMsg.includes('block')) {
        userMsg = `Transaction failed: ${errorMsg}. Make sure the lock period has expired before withdrawing.`;
      } else if (errorMsg.includes('UTXO') || errorMsg.includes('funds') || errorMsg.includes('balance')) {
        userMsg = `UTXO error: ${errorMsg}. Make sure the contract has a balance and your wallet has BCH for miner fees.`;
      } else if (errorMsg.includes('sign') || errorMsg.includes('provider') || errorMsg.includes('wallet')) {
        userMsg = `Wallet error: ${errorMsg}. Make sure your CashScript wallet (Paytaca, Electron Cash SLP) is connected and has the correct keys.`;
      }

      setPendingTx(prev => prev ? { ...prev, status: 'error', error: userMsg } : null);
      setTxStatus({ type: 'error', message: userMsg });
    }
  }, [pendingTx, wallet, hasSigner, getContractInstance, storedContracts, addTransactionRecord, network]);

  const closePendingTx = useCallback(() => {
    setPendingTx(null);
    setDepositAmount('');
    setTxStatus(null);
    setWifMode(false);
    setWifKey('');
    setWifAddress('');
    setWifError('');
  }, []);

  // ─── Execute transaction using WIF key ───────────────────────────────────
  const executeWifTx = useCallback(async () => {
    if (!pendingTx) return;
    if (!wifKey.trim()) {
      setWifError('Please enter your WIF private key.');
      return;
    }

    setPendingTx(prev => prev ? { ...prev, status: 'broadcasting' } : null);
    setTxStatus(null);
    setWifError('');

    try {
      const stored = storedContracts.find(c => c.address === pendingTx.contractAddress);
      if (!stored) throw new Error('Contract not found in local storage. Add it from the Create tab.');

      const ownerPkh = stored.ownerPkh || wallet.pubkeyHash || '';
      if (!ownerPkh) throw new Error('Owner public key hash not found for this contract.');

      // Validate WIF key and get derived address
      let derivedAddress: string;
      try {
        derivedAddress = getAddressFromWif(wifKey.trim(), network);
      } catch (e) {
        throw new Error(`Invalid WIF key: ${e instanceof Error ? e.message : String(e)}`);
      }

      let txHash: string;

      // Fetch contract balance from blockchain
      const wifProvider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const contractUtxos = await wifProvider.getUtxos(pendingTx.contractAddress);
      const contractBalance = contractUtxos.reduce((sum: bigint, u: any) => sum + u.satoshis, 0n);

      if (pendingTx.type === 'withdraw') {
        const withdrawAmount = pendingTx.amount
          ? BigInt(Math.round(pendingTx.amount * 100000000))
          : contractBalance;
        txHash = await signWithdraw({
          wifKey: wifKey.trim(),
          network,
          ownerPkh,
          lockEndBlock: stored.lockEndBlock,
          contractAddress: pendingTx.contractAddress,
          walletAddress: derivedAddress,
          amountSats: withdrawAmount,
        });
      } else if (pendingTx.type === 'cancel') {
        txHash = await signCancel({
          wifKey: wifKey.trim(),
          network,
          ownerPkh,
          lockEndBlock: stored.lockEndBlock,
          contractAddress: pendingTx.contractAddress,
          walletAddress: derivedAddress,
          contractBalance,
        });
      } else {
        // Deposit via SafeDelayLibrary
        const amountSats = BigInt(Math.round((parseFloat(depositAmount) || 0.01) * 100000000));
        const result = await deposit({
          wifKey: wifKey.trim(),
          amountSats,
          contractAddress: pendingTx.contractAddress,
          ownerPkh,
          lockEndBlock: stored.lockEndBlock,
          config: { network },
        });
        txHash = result.txHash;
      }

      addTransactionRecord({
        type: pendingTx.type === 'deposit' ? 'deposit' : pendingTx.type === 'cancel' ? 'cancel' : 'withdraw',
        amount: pendingTx.amount || 0,
        txHash,
        contractAddress: pendingTx.contractAddress,
      });

      setPendingTx(prev => prev ? { ...prev, status: 'success', txHash } : null);
      setTxStatus({
        type: 'success',
        message: `${pendingTx.type.charAt(0).toUpperCase() + pendingTx.type.slice(1)} transaction submitted! Waiting for confirmation...`,
      });

      // Clear WIF key from memory
      setWifKey('');
      setWifAddress('');

      // Start confirmation polling in background
      waitForTxConfirmation(txHash, network, { maxWaitMs: 600000 }).then(result => {
        if (result.confirmed) {
          setPendingTx(prev => prev ? { ...prev, status: 'confirmed' } : null);
          setTxStatus({
            type: 'success',
            message: `✅ ${pendingTx.type.charAt(0).toUpperCase() + pendingTx.type.slice(1)} confirmed! (${result.confirmations} confirmation${result.confirmations !== 1 ? 's' : ''})`,
          });
        } else {
          setTxStatus(prev => prev ? { ...prev, message: prev.message + ' (polling timed out - tx may still confirm)' } : null);
        }
      }).catch(() => {
        // Polling error - tx may still confirm
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Transaction failed.';
      let userMsg = errorMsg;

      if (errorMsg.includes('not satisfied') || errorMsg.includes('lock') || errorMsg.includes('block')) {
        userMsg = `Transaction failed: ${errorMsg}. Make sure the lock period has expired before withdrawing.`;
      } else if (errorMsg.includes('UTXO') || errorMsg.includes('funds') || errorMsg.includes('balance')) {
        userMsg = `UTXO error: ${errorMsg}. Make sure the contract has a balance and your wallet has BCH for miner fees.`;
      } else if (errorMsg.includes('sign') || errorMsg.includes('provider') || errorMsg.includes('wallet')) {
        userMsg = `Signing error: ${errorMsg}. Make sure your WIF key matches your wallet.`;
      }

      setPendingTx(prev => prev ? { ...prev, status: 'error', error: userMsg } : null);
      setTxStatus({ type: 'error', message: userMsg });
    }
  }, [pendingTx, wifKey, wallet.pubkeyHash, storedContracts, network, getAddressFromWif, signWithdraw, signCancel, addTransactionRecord, depositAmount]);

  // ─── Validate WIF key as user types ─────────────────────────────────────
  const handleWifKeyChange = useCallback((value: string) => {
    setWifKey(value);
    setWifError('');
    if (value.trim().length > 50) {
      try {
        const addr = getAddressFromWif(value.trim(), network);
        setWifAddress(addr);
        setWifError('');
      } catch (e) {
        setWifAddress('');
        setWifError(e instanceof Error ? `Invalid WIF: ${e.message}` : 'Invalid WIF key');
      }
    } else {
      setWifAddress('');
    }
  }, [network, getAddressFromWif]);

  // Calculate analytics
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalWithdrawals = transactions
    .filter(t => t.type === 'withdraw' || t.type === 'cancel')
    .reduce((sum, t) => sum + t.amount, 0);

  const avgLockDuration = contracts.length > 0
    ? Math.round(contracts.reduce((sum, c) => sum + (c.lockEndBlock - c.currentBlock), 0) / contracts.length / 144)
    : 0;

  const unlockedPercent = contracts.length > 0
    ? Math.round((contracts.filter(c => c.lockEndBlock <= c.currentBlock).length / contracts.length) * 100)
    : 0;

  const filteredTransactions = txFilter === 'all'
    ? transactions
    : transactions.filter(t => t.type === txFilter);

  return (
    <DashboardContainer>
      <Title>Dashboard</Title>
      <Description>
        View and manage your time-locked wallets
      </Description>

      {/* Status message banner */}
      {txStatus && (
        <MessageBox $type={txStatus.type} style={{ marginBottom: '20px' }}>
          {txStatus.message}
        </MessageBox>
      )}

      <StatsGrid>
        <StatCard>
          <StatValue>{contracts.length}</StatValue>
          <StatLabel>Active Contracts</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>
            {contracts.reduce((sum, c) => sum + c.balance, 0).toFixed(4)}
          </StatValue>
          <StatLabel>Total BCH Locked</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>
            {contracts.filter(c => c.lockEndBlock > c.currentBlock).length}
          </StatValue>
          <StatLabel>Currently Locked</StatLabel>
        </StatCard>
      </StatsGrid>

      {/* Analytics Section */}
      <SectionTitle>Analytics</SectionTitle>
      <AnalyticsGrid>
        <AnalyticsCard>
          <AnalyticsValue>{totalDeposits.toFixed(4)} BCH</AnalyticsValue>
          <AnalyticsLabel>Total Deposited</AnalyticsLabel>
          <ProgressBar>
            <ProgressFill $percent={Math.min((totalDeposits / (totalDeposits + totalWithdrawals || 1)) * 100, 100)} />
          </ProgressBar>
        </AnalyticsCard>
        <AnalyticsCard>
          <AnalyticsValue>{totalWithdrawals.toFixed(4)} BCH</AnalyticsValue>
          <AnalyticsLabel>Total Withdrawn/Cancelled</AnalyticsLabel>
          <ProgressBar>
            <ProgressFill $percent={Math.min((totalWithdrawals / (totalDeposits + totalWithdrawals || 1)) * 100, 100)} />
          </ProgressBar>
        </AnalyticsCard>
        <AnalyticsCard>
          <AnalyticsValue>{avgLockDuration}</AnalyticsValue>
          <AnalyticsLabel>Avg Lock Duration (days)</AnalyticsLabel>
        </AnalyticsCard>
        <AnalyticsCard>
          <AnalyticsValue $color={unlockedPercent > 50 ? '#10b981' : '#f59e0b'}>{unlockedPercent}%</AnalyticsValue>
          <AnalyticsLabel>Contracts Unlocked</AnalyticsLabel>
          <ProgressBar>
            <ProgressFill $percent={unlockedPercent} />
          </ProgressBar>
        </AnalyticsCard>
      </AnalyticsGrid>

      {/* Milestone Notifications Section */}
      <TransactionSection>
        <SectionTitle>📲 Deposit Milestone Notifications</SectionTitle>
        <Description>
          Get notified when your deposits reach certain lock percentages
        </Description>

        {permission === 'default' && (
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={requestPermission}
              style={{
                padding: '10px 20px',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              🔔 Enable Browser Notifications
            </button>
          </div>
        )}

        {permission === 'denied' && (
          <MessageBox $type="error">
            Notifications blocked. Please enable in browser settings.
          </MessageBox>
        )}

        {permission === 'granted' && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginRight: '12px' }}>
                Notify at milestones:
              </span>
              {[25, 50, 75, 100].map(m => (
                <label key={m} style={{ display: 'inline-flex', alignItems: 'center', marginRight: '16px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={milestones.includes(m)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMilestoneTargets([...milestones, m].sort((a, b) => a - b));
                      } else {
                        setMilestoneTargets(milestones.filter(x => x !== m));
                      }
                    }}
                    style={{ marginRight: '6px' }}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>{m}%</span>
                </label>
              ))}
            </div>

            {notifications.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                    Recent notifications: {notifications.length}
                  </span>
                  <button
                    onClick={clearNotifications}
                    style={{
                      padding: '4px 12px',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.7)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Clear All
                  </button>
                </div>
                {notifications.slice(-3).reverse().map((n, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>
                      📬 {n.address.slice(0, 12)}... reached {n.percent}%
                    </span>
                    <button
                      onClick={() => dismissNotification(notifications.length - 1 - i)}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.5)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </TransactionSection>

      {/* Transaction History Section */}
      <TransactionSection>
        <SectionTitle>Transaction History</SectionTitle>
        <FilterBar>
          <FilterButton $active={txFilter === 'all'} onClick={() => { setTxFilter('all'); try { localStorage.setItem('safedelay-tx-filter', 'all'); } catch {} }}>
            All
          </FilterButton>
          <FilterButton $active={txFilter === 'deposit'} onClick={() => { setTxFilter('deposit'); try { localStorage.setItem('safedelay-tx-filter', 'deposit'); } catch {} }}>
            Deposits
          </FilterButton>
          <FilterButton $active={txFilter === 'withdraw'} onClick={() => { setTxFilter('withdraw'); try { localStorage.setItem('safedelay-tx-filter', 'withdraw'); } catch {} }}>
            Withdrawals
          </FilterButton>
          <FilterButton $active={txFilter === 'cancel'} onClick={() => { setTxFilter('cancel'); try { localStorage.setItem('safedelay-tx-filter', 'cancel'); } catch {} }}>
            Cancels
          </FilterButton>
          <FilterButton $active={txFilter === 'create'} onClick={() => { setTxFilter('create'); try { localStorage.setItem('safedelay-tx-filter', 'create'); } catch {} }}>
            Created
          </FilterButton>
        </FilterBar>

        {wallet.connected ? (
          filteredTransactions.length > 0 ? (
            <TransactionList>
              {filteredTransactions.map((tx) => (
                <TransactionItem key={tx.id}>
                  <TransactionInfo>
                    <TransactionIcon $type={tx.type}>
                      {tx.type === 'deposit' ? '↓' : tx.type === 'withdraw' ? '↑' : tx.type === 'cancel' ? '✕' : '✦'}
                    </TransactionIcon>
                    <TransactionDetails>
                      <TransactionType>
                        {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                      </TransactionType>
                      <TransactionDate>{formatDate(tx.timestamp)}</TransactionDate>
                      {tx.txHash && (
                        <TxHashLink
                          href={getExplorerUrl(network, tx.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tx.txHash.slice(0, 12)}... ↗
                        </TxHashLink>
                      )}
                    </TransactionDetails>
                  </TransactionInfo>
                  <TransactionAmount $type={tx.type}>
                    {tx.type === 'withdraw' || tx.type === 'cancel' ? '-' : '+'}{tx.amount.toFixed(4)} BCH
                  </TransactionAmount>
                </TransactionItem>
              ))}
            </TransactionList>
          ) : (
            <EmptyState>No transactions yet. Withdrawals and deposits will appear here.</EmptyState>
          )
        ) : (
          <EmptyState>Connect your wallet to view transaction history</EmptyState>
        )}
      </TransactionSection>

      {/* Active Contracts Section */}
      <TransactionSection>
        <SectionTitle>Active Contracts</SectionTitle>

        {wallet.connected && contracts.length > 0 && (
          <SortBar>
            <SortLabel>Sort by:</SortLabel>
            <SortSelect value={sortBy} onChange={(e) => { const val = e.target.value as SortOption; setSortBy(val); try { localStorage.setItem('safedelay-sort', val); } catch {} }}>
              <option value="date">Unlock Date</option>
              <option value="amount">Amount</option>
              <option value="unlock">Time Remaining</option>
            </SortSelect>
          </SortBar>
        )}

        {wallet.connected ? (
          sortedContracts.length > 0 ? (
            <ContractList>
              {sortedContracts.map((contract) => {
                const isLocked = contract.lockEndBlock > contract.currentBlock;
                const existingLabel = getLabel(contract.address);
                const isEditing = editingLabel === contract.address;

                return (
                  <ContractCard key={contract.address}>
                    <ContractInfo>
                      {isEditing ? (
                        <LabelDisplay>
                          <LabelInput
                            value={labelInput}
                            onChange={(e) => setLabelInput(e.target.value)}
                            placeholder="Enter label..."
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveLabel(contract.address)}
                            autoFocus
                          />
                          <SaveLabelBtn onClick={() => handleSaveLabel(contract.address)}>Save</SaveLabelBtn>
                          <RemoveLabelBtn onClick={() => { setEditingLabel(null); setLabelInput(''); }}>Cancel</RemoveLabelBtn>
                        </LabelDisplay>
                      ) : (
                        <LabelDisplay>
                          {existingLabel && <WalletLabel>{existingLabel}</WalletLabel>}
                          <LabelButton
                            onClick={() => handleEditLabel(contract.address)}
                            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', padding: '2px 8px', fontSize: '12px' }}
                          >
                            {existingLabel ? 'Edit' : '+ Add Label'}
                          </LabelButton>
                        </LabelDisplay>
                      )}
                      <ContractAddress style={{ marginTop: '8px' }}>{contract.address}</ContractAddress>
                      <QRCodeSection>
                        <CopyButton onClick={() => handleCopyAddress(contract.address)}>
                          {copiedAddress === contract.address ? '✓ Copied!' : '📋 Copy Address'}
                        </CopyButton>
                        <CopyButton onClick={() => handleToggleQR(contract.address)}>
                          {showQRCode === contract.address ? 'Hide QR' : 'Show QR'}
                        </CopyButton>
                        {showQRCode === contract.address && (
                          <QRCodeWrapper>
                            <QRCodeSVG
                              value={contract.address.replace(/^bitcoincash:/, '')}
                              size={100}
                              level="M"
                            />
                          </QRCodeWrapper>
                        )}
                      </QRCodeSection>
                      <div style={{ marginTop: '4px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                        {contract.type === 'multisig' ? 'MultiSig (2-of-3)' : 'Single Owner'} •{' '}
                        {getTimeRemaining(contract.lockEndBlock, contract.currentBlock)} remaining
                      </div>
                    </ContractInfo>
                    <ContractBalance>{contract.balance.toFixed(4)} BCH</ContractBalance>
                    <ContractStatus $locked={isLocked}>
                      {isLocked ? '🔒 Locked' : '✅ Unlocked'}
                    </ContractStatus>
                    <ContractActions>
                      <DepositButton onClick={() => handleDepositRequest(contract)}>Deposit</DepositButton>
                      <WithdrawButton
                        disabled={isLocked}
                        onClick={() => !isLocked && handleWithdraw(contract)}
                        title={isLocked ? 'Lock period has not expired yet' : 'Withdraw all funds after lock expires'}
                      >
                        Withdraw
                      </WithdrawButton>
                      <CancelButton
                        onClick={() => handleCancel(contract)}
                        title="Cancel anytime — returns all funds immediately"
                      >
                        Cancel
                      </CancelButton>
                    </ContractActions>
                  </ContractCard>
                );
              })}
            </ContractList>
          ) : (
            <EmptyState>
              No active time-locks found. Create one to get started!
            </EmptyState>
          )
        ) : (
          <EmptyState>
            Connect your wallet to view your time-locked wallets
          </EmptyState>
        )}
      </TransactionSection>

      {/* Wallet Backup Section */}
      <BackupSection>
        <SectionTitle>Wallet Backup & Restore</SectionTitle>
        <Description>
          Export your wallet configuration for disaster recovery or import from a backup file
        </Description>

        <BackupActions>
          <ExportBtn
            onClick={handleExport}
            disabled={!wallet.connected || exporting || contracts.length === 0}
          >
            {exporting ? 'Exporting...' : '📥 Export Backup'}
          </ExportBtn>

          <label>
            <ImportBtn as="span" style={{ display: 'inline-block' }}>
              📤 Choose Backup File
            </ImportBtn>
            <FileInput
              type="file"
              accept=".json"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>

          {importFile && (
            <ImportBtn
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing...' : `📥 Import "${importFile.name}"`}
            </ImportBtn>
          )}
        </BackupActions>

        {importFile && (
          <div style={{ marginBottom: '12px' }}>
            <PasswordInput
              type="password"
              placeholder="Enter password if encrypted (optional otherwise)"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
            />
            <PasswordLabel>Leave empty if backup was not encrypted</PasswordLabel>
          </div>
        )}

        {showExportPassword && (
          <div style={{ marginBottom: '12px' }}>
            <PasswordInput
              type="password"
              placeholder="Optional encryption password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
            />
            <PasswordLabel>Leave empty for unencrypted backup</PasswordLabel>
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showExportPassword}
              onChange={(e) => setShowExportPassword(e.target.checked)}
            />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
              Encrypt backup with password
            </span>
          </label>
        </div>

        <EncryptNote>
          ℹ️ Replace all addresses to import labels. Encrypted backups require password for import.
        </EncryptNote>

        {(backupError || backupSuccess) && (
          <MessageBox
            $type={backupError ? 'error' : 'success'}
            onClick={clearBackupMessages}
            style={{ cursor: 'pointer' }}
          >
            {backupError || backupSuccess} (click to dismiss)
          </MessageBox>
        )}
      </BackupSection>

      {/* ─── On-Chain Contract Recovery Section ─────────────────────────────── */}
      <BackupSection>
        <SectionTitle>🔍 On-Chain Contract Recovery</SectionTitle>
        <Description>
          Lost your contracts due to browser data clearing? Scan the blockchain to recover them using your wallet address.
        </Description>

        {recoveryScanning && (
          <MessageBox $type="info" style={{ marginBottom: '16px' }}>
            {recoveryScanProgress || 'Scanning blockchain...'}
          </MessageBox>
        )}

        {recoveryScanDone && discoveredContracts.length === 0 && (
          <MessageBox $type="info" style={{ marginBottom: '16px' }}>
            No SafeDelay contracts found on-chain for this wallet. If you recently created contracts, they may not have been indexed yet.
          </MessageBox>
        )}

        {recoveryScanDone && discoveredContracts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <MessageBox $type="success" style={{ marginBottom: '12px' }}>
              Found {discoveredContracts.length} SafeDelay contract{discoveredContracts.length !== 1 ? 's' : ''} on-chain!
            </MessageBox>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {discoveredContracts.map(c => (
                <div key={c.address} style={{
                  padding: '12px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.9)' }}>
                      {c.address.slice(0, 20)}...{c.address.slice(-8)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
                      Unlocks at block {c.lockEndBlock.toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRecoverContract(c)}
                    style={{
                      padding: '6px 16px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Recover
                  </button>
                </div>
              ))}
            </div>
            {discoveredContracts.length > 1 && (
              <button
                onClick={handleRecoverAll}
                style={{
                  padding: '8px 20px',
                  background: 'rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Recover All ({discoveredContracts.length})
              </button>
            )}
          </div>
        )}

        <BackupActions>
          <button
            onClick={handleRecoveryScan}
            disabled={recoveryScanning || !wallet.connected}
            style={{
              padding: '10px 20px',
              background: recoveryScanning ? 'rgba(79, 70, 229, 0.3)' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: recoveryScanning ? 'not-allowed' : 'pointer',
              opacity: recoveryScanning ? 0.7 : 1,
            }}
          >
            {recoveryScanning ? '🔄 Scanning...' : '🔍 Scan for Contracts'}
          </button>
        </BackupActions>

        {!wallet.connected && (
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>
            Connect your wallet to scan for contracts
          </div>
        )}

        {lastScanResult && lastScanResult.errors.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
              Scan warnings:
            </div>
            {lastScanResult.errors.slice(0, 3).map((err, i) => (
              <div key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                • {err}
              </div>
            ))}
          </div>
        )}
      </BackupSection>

      {/* ─── Pending Transaction Modal ─────────────────────────────────────── */}
      {pendingTx && (
        <ModalOverlay onClick={(e) => { if (e.target === e.currentTarget) closePendingTx(); }}>
          <ModalBox>
            <ModalTitle>
              {pendingTx.type === 'withdraw' ? '💸 Withdraw Funds' :
               pendingTx.type === 'cancel' ? '✕ Cancel Contract' :
               '💰 Deposit Funds'}
            </ModalTitle>
            <ModalDesc>
              {pendingTx.type === 'withdraw' && 'Withdraw your locked BCH once the lock period has expired. This will send all funds to your wallet address.'}
              {pendingTx.type === 'cancel' && 'Cancel the SafeDelay contract and return all funds to your wallet immediately. No wait time required.'}
              {pendingTx.type === 'deposit' && `Deposit BCH into your SafeDelay contract at ${pendingTx.contractAddress.slice(0, 16)}...`}
            </ModalDesc>

            {pendingTx.status === 'error' && pendingTx.error && (
              <MessageBox $type="error" style={{ marginBottom: '16px' }}>
                {pendingTx.error}
              </MessageBox>
            )}

            {pendingTx.status === 'success' && pendingTx.txHash && (
              <MessageBox $type="info" style={{ marginBottom: '16px' }}>
                ⏳ Transaction submitted! Waiting for confirmation...<br />
                <TxHashLink href={getExplorerUrl(network, pendingTx.txHash)} target="_blank" rel="noopener noreferrer">
                  {pendingTx.txHash.slice(0, 24)}... ↗
                </TxHashLink>
              </MessageBox>
            )}

            {pendingTx.status === 'confirmed' && pendingTx.txHash && (
              <MessageBox $type="success" style={{ marginBottom: '16px' }}>
                ✅ Transaction confirmed!<br />
                <TxHashLink href={getExplorerUrl(network, pendingTx.txHash)} target="_blank" rel="noopener noreferrer">
                  {pendingTx.txHash.slice(0, 24)}... ↗
                </TxHashLink>
              </MessageBox>
            )}

            {pendingTx.status === 'broadcasting' && (
              <MessageBox $type="info" style={{ marginBottom: '16px' }}>
                ⏳ Signing & broadcasting transaction...
              </MessageBox>
            )}

            {pendingTx.status === 'confirm' && pendingTx.type === 'deposit' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
                  Deposit amount (BCH):
                </label>
                <ModalInput
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="0.01"
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    setPendingTx(prev => prev ? { ...prev, amount: parseFloat(e.target.value) || 0.01 } : null);
                  }}
                />
              </div>
            )}

            {/* ── Signing mode selector ── */}
            {pendingTx.status === 'confirm' && (
              <>
                {!wifMode ? (
                  /* CashScript wallet signing mode */
                  <>
                    {hasSigner ? (
                      <ModalDesc style={{ marginBottom: '8px', fontSize: '13px' }}>
                        This transaction will be signed by your connected CashScript wallet and broadcast to the {network} network.
                      </ModalDesc>
                    ) : (
                      <ModalDesc style={{ marginBottom: '8px', fontSize: '13px' }}>
                        No CashScript wallet detected. Use the WIF key option below to sign with your private key.
                      </ModalDesc>
                    )}
                    <ModalActions style={{ flexDirection: 'column', gap: '8px' }}>
                      {hasSigner ? (
                        <ModalConfirmBtn
                          style={{ width: '100%' }}
                          onClick={executePendingTx}
                          disabled={pendingTx.type === 'deposit' && !depositAmount}
                        >
                          {pendingTx.type === 'withdraw' ? '💸 Withdraw (Wallet)' :
                           pendingTx.type === 'cancel' ? '✕ Cancel Contract (Wallet)' :
                           '💰 Deposit (Wallet)'}
                        </ModalConfirmBtn>
                      ) : null}
                      <ModalCancelBtn
                        style={{ width: '100%', textAlign: 'center' }}
                        onClick={() => setWifMode(true)}
                      >
                        🔑 Sign with WIF Private Key
                      </ModalCancelBtn>
                      <ModalCancelBtn
                        style={{ width: '100%', textAlign: 'center' }}
                        onClick={closePendingTx}
                      >
                        Cancel
                      </ModalCancelBtn>
                    </ModalActions>
                  </>
                ) : (
                  /* WIF key signing mode */
                  <>
                    <ModalDesc style={{ marginBottom: '8px', fontSize: '13px', color: '#f59e0b' }}>
                      🔐 WIF signing keeps your key in memory only — it is never stored or transmitted.
                    </ModalDesc>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
                        Enter WIF Private Key:
                      </label>
                      <QrScanner onScan={handleWifKeyChange} />
                      <ModalInput
                        type="password"
                        placeholder="L1aW4aubWDZB...."
                        value={wifKey}
                        onChange={(e) => handleWifKeyChange(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '8px' }}
                      />
                      {wifError && (
                        <MessageBox $type="error" style={{ fontSize: '12px', marginTop: '6px' }}>
                          {wifError}
                        </MessageBox>
                      )}
                      {wifAddress && !wifError && (
                        <MessageBox $type="success" style={{ fontSize: '12px', marginTop: '6px' }}>
                          ✅ Key valid — Address: <span style={{ fontFamily: 'monospace' }}>{wifAddress.slice(0, 20)}...</span>
                        </MessageBox>
                      )}
                    </div>
                    <ModalActions style={{ flexDirection: 'column', gap: '8px' }}>
                      <ModalConfirmBtn
                        style={{ width: '100%' }}
                        onClick={executeWifTx}
                        disabled={!wifAddress || (pendingTx.type === 'deposit' && !depositAmount)}
                      >
                        {`🔑 Sign with WIF — ${pendingTx.type === 'withdraw' ? 'Withdraw' : pendingTx.type === 'cancel' ? 'Cancel' : 'Deposit'}`}
                      </ModalConfirmBtn>
                      <ModalCancelBtn
                        style={{ width: '100%', textAlign: 'center' }}
                        onClick={() => {
                          setWifMode(false);
                          setWifKey('');
                          setWifAddress('');
                          setWifError('');
                        }}
                      >
                        ← Back
                      </ModalCancelBtn>
                    </ModalActions>
                  </>
                )}
              </>
            )}

            {pendingTx.status !== 'success' && pendingTx.status !== 'confirm' && (
              <ModalActions>
                <ModalCancelBtn onClick={closePendingTx}>Cancel</ModalCancelBtn>
                <ModalConfirmBtn
                  onClick={executePendingTx}
                  disabled={pendingTx.status === 'broadcasting' || (pendingTx.type === 'deposit' && !depositAmount)}
                >
                  {pendingTx.status === 'broadcasting' ? '⏳ Signing & Broadcasting...' :
                   pendingTx.type === 'withdraw' ? '💸 Withdraw' :
                   pendingTx.type === 'cancel' ? '✕ Cancel Contract' :
                   '💰 Deposit'}
                </ModalConfirmBtn>
              </ModalActions>
            )}

            {(pendingTx.status === 'success' || pendingTx.status === 'confirmed') && (
              <ModalActions>
                <ModalConfirmBtn onClick={() => { closePendingTx(); onNavigateTab?.('dashboard'); }}>Done → Dashboard</ModalConfirmBtn>
              </ModalActions>
            )}
          </ModalBox>
        </ModalOverlay>
      )}
    </DashboardContainer>
  );
}
