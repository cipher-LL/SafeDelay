import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { useWalletLabels } from '../hooks/useWalletLabels';
import { useWalletBackup } from '../hooks/useWalletBackup';
import { useDepositMilestones } from '../hooks/useDepositMilestones';
import { useStoredContracts, useElectrumContractData } from '../hooks/useSafeDelayContracts';
import { QRCodeSVG } from 'qrcode.react';
import { ElectrumNetworkProvider, Network, Contract } from 'cashscript';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';

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
  status: 'confirm' | 'broadcasting' | 'success' | 'error';
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

export default function Dashboard() {
  const { network } = useNetwork();
  const { wallet, hasSigner } = useWallet();
  const { getLabel, setLabel, removeLabel } = useWalletLabels();
  const { contracts: storedContracts } = useStoredContracts();
  const { contracts: contractsWithData, currentBlock } = useElectrumContractData(storedContracts, network);
  const [contracts, setContracts] = useState<TimeLock[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdraw' | 'cancel' | 'create'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
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

  // Load saved transactions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTransactions(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading transactions:', e);
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
      console.error('Error creating contract instance:', e);
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
        message: 'No wallet signing available. SafeDelay requires a CashScript-compatible wallet (Paytaca, Electron Cash SLP) to sign transactions. Manual WIF signing is not yet supported.',
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
        message: `${pendingTx.type.charAt(0).toUpperCase() + pendingTx.type.slice(1)} transaction broadcast! TxHash: ${txHash.slice(0, 16)}...`,
      });

      setTimeout(() => {
        setPendingTx(null);
        setDepositAmount('');
      }, 4000);
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
  }, []);

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
          <FilterButton $active={txFilter === 'all'} onClick={() => setTxFilter('all')}>
            All
          </FilterButton>
          <FilterButton $active={txFilter === 'deposit'} onClick={() => setTxFilter('deposit')}>
            Deposits
          </FilterButton>
          <FilterButton $active={txFilter === 'withdraw'} onClick={() => setTxFilter('withdraw')}>
            Withdrawals
          </FilterButton>
          <FilterButton $active={txFilter === 'cancel'} onClick={() => setTxFilter('cancel')}>
            Cancels
          </FilterButton>
          <FilterButton $active={txFilter === 'create'} onClick={() => setTxFilter('create')}>
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
            <SortSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
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
              {' '}Transaction will be signed with your WIF private key.
            </ModalDesc>

            {pendingTx.status === 'error' && pendingTx.error && (
              <MessageBox $type="error" style={{ marginBottom: '16px' }}>
                {pendingTx.error}
              </MessageBox>
            )}

            {pendingTx.status === 'success' && pendingTx.txHash && (
              <MessageBox $type="success" style={{ marginBottom: '16px' }}>
                ✅ Transaction broadcast!<br />
                <TxHashLink href={getExplorerUrl(network, pendingTx.txHash)} target="_blank" rel="noopener noreferrer">
                  {pendingTx.txHash.slice(0, 24)}... ↗
                </TxHashLink>
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

            {pendingTx.status === 'confirm' && !hasSigner && (
              <MessageBox $type="error" style={{ marginBottom: '16px', fontSize: '13px' }}>
                ⚠️ No wallet signer detected. SafeDelay requires a CashScript-compatible wallet (Paytaca, Electron Cash SLP with CashScript extension) to sign and send transactions.
              </MessageBox>
            )}

            {pendingTx.status === 'confirm' && hasSigner && (
              <ModalDesc style={{ marginBottom: '8px', fontSize: '13px' }}>
                This transaction will be signed by your connected CashScript wallet and broadcast to the {network} network.
              </ModalDesc>
            )}

            {pendingTx.status !== 'success' && (
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

            {pendingTx.status === 'success' && (
              <ModalActions>
                <ModalConfirmBtn onClick={closePendingTx}>Done</ModalConfirmBtn>
              </ModalActions>
            )}
          </ModalBox>
        </ModalOverlay>
      )}
    </DashboardContainer>
  );
}
