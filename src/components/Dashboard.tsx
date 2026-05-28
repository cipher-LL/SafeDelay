import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useOnChainContractDiscovery, DiscoveredContract, ScanResult, clearSavedScanResult } from '../hooks/useOnChainContractDiscovery';
import { useAutoContractVerification } from '../hooks/useAutoContractVerification';
import { QRCodeSVG } from 'qrcode.react';
import QrScanner from './QrScanner';
import { ElectrumNetworkProvider, Network, Contract } from 'cashscript';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';
import { deposit, waitForTxConfirmation, extend } from '../utils/SafeDelayLibrary';

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
  min-height: 80px;
`;

const StatSkeleton = styled.div`
  height: 32px;
  width: 60%;
  margin: 0 auto 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  animation: pulse 1.5s ease-in-out infinite;
`;

const StatLabelSkeleton = styled.div`
  height: 14px;
  width: 45%;
  margin: 0 auto;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  animation: pulse 1.5s ease-in-out infinite;
`;

const ContractSkeletonCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
  animation: pulse 1.5s ease-in-out infinite;
`;

const ContractSkeletonLine = styled.div<{ $w?: string }>`
  height: 14px;
  width: ${({ $w }) => $w || '70%'};
  margin-bottom: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
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

const ExtendButton = styled(ActionButton)`
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;

  &:hover:not(:disabled) {
    background: rgba(139, 92, 246, 0.3);
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

const MessageBox = styled.div<{ $type: 'success' | 'error' | 'info' | 'warning' }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  background: ${({ $type }) => $type === 'success' ? 'rgba(16, 185, 129, 0.2)' : $type === 'error' ? 'rgba(239, 68, 68, 0.2)' : $type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(79, 70, 229, 0.2)'};
  color: ${({ $type }) => $type === 'success' ? '#10b981' : $type === 'error' ? '#ef4444' : $type === 'warning' ? '#f59e0b' : '#a5b4fc'};
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
  ownerPkh?: string;
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
  type: 'withdraw' | 'cancel' | 'deposit' | 'extend';
  amount?: number;
  lockEndBlock?: number;
  status: 'confirm' | 'broadcasting' | 'confirming' | 'confirmed' | 'success' | 'error';
  txHash?: string;
  error?: string;
  /** Optional warning message shown in the confirm modal (for withdraw/cancel actions) */
  warning?: string;
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
  const { contracts: storedContracts, updateContract } = useStoredContracts();
  const { contracts: contractsWithData, currentBlock, refresh } = useElectrumContractData(storedContracts, network);
  const { signWithdraw, signCancel, getAddressFromWif } = useWifSigner();
  const [contracts, setContracts] = useState<TimeLock[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdraw' | 'cancel' | 'create'>(() => {
    try { return (localStorage.getItem('safedelay-tx-filter') as any) || 'all'; } catch { return 'all'; }
  });
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    try { return (localStorage.getItem('safedelay-sort') as SortOption) || 'amount'; } catch { return 'amount'; }
  });
  const [walletFilter, setWalletFilter] = useState<'all' | 'mine'>(() => {
    try { return (localStorage.getItem('safedelay-wallet-filter') as 'all' | 'mine') || 'all'; } catch { return 'all'; }
  });
  const [unlockedFilter, setUnlockedFilter] = useState<boolean>(() => {
    try { return localStorage.getItem('safedelay-unlocked-filter') === 'true'; } catch { return false; }
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
  // WIF signing state — persisted so users don't re-enter key every session
  const [wifMode, setWifMode] = useState(() => localStorage.getItem('safedelay_wif_mode') === 'true');
  const [wifKey, setWifKey] = useState(() => localStorage.getItem('safedelay_wif_key') || '');
  const [wifAddress, setWifAddress] = useState(() => localStorage.getItem('safedelay_wif_address') || '');

  // Track bytecode mismatch warnings the user has dismissed
  const [dismissedMismatches, setDismissedMismatches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('safedelay_dismissed_mismatches') || '[]');
    } catch { return []; }
  });
  const [wifError, setWifError] = useState('');

  // Persist WIF state to localStorage so it's restored on next session
  useEffect(() => {
    localStorage.setItem('safedelay_wif_mode', wifMode ? 'true' : 'false');
  }, [wifMode]);

  useEffect(() => {
    localStorage.setItem('safedelay_wif_key', wifKey);
  }, [wifKey]);

  useEffect(() => {
    localStorage.setItem('safedelay_wif_address', wifAddress);
  }, [wifAddress]);

  // Persist dismissed bytecode mismatch warnings
  useEffect(() => {
    localStorage.setItem('safedelay_dismissed_mismatches', JSON.stringify(dismissedMismatches));
  }, [dismissedMismatches]);

  // Auto-scan state for on-chain history scanning
  const [autoScanProgress, setAutoScanProgress] = useState<string>('');
  const [autoScanCancellable, setAutoScanCancellable] = useState(false);

  const { fetchHistory } = useOnChainTxHistory();
  const { discoverContracts, scanning: recoveryScanning, scanProgress: recoveryScanProgress, abort: abortDiscovery, scanTimestamp } = useOnChainContractDiscovery();
  const [discoveredContracts, setDiscoveredContracts] = useState<DiscoveredContract[]>([]);
  const [recoveryScanDone, setRecoveryScanDone] = useState(false);
  // Restore saved scan result on mount so results persist across page refresh
  const savedScan = (() => {
    try {
      const raw = localStorage.getItem('safedelay_discovery_results');
      if (!raw) return null;
      const { result, timestamp } = JSON.parse(raw);
      const MAX_AGE = 24 * 60 * 60 * 1000;
      if (!result || Date.now() - timestamp > MAX_AGE) return null;
      return result as ScanResult;
    } catch { return null; }
  })();
  // Pre-populate from localStorage so results survive page refresh
  useEffect(() => {
    if (savedScan && savedScan.discovered.length > 0) {
      setDiscoveredContracts(savedScan.discovered);
      setRecoveryScanDone(true);
      setShowSavedBanner(true);
    }
  }, []);
  const [discoveryResult, setDiscoveryResult] = useState<ScanResult | null>(null);
  const [verifyStartTime, setVerifyStartTime] = useState<number | null>(null);
  // Show banner when saved scan results are restored on mount
  const [showSavedBanner, setShowSavedBanner] = useState(false);

  // Auto-verify stored contracts against on-chain state on app load
  const { verificationResult, isVerifying, verifyProgress, abort, reverify } = useAutoContractVerification(
    storedContracts,
    wallet.address,
    wallet.pubkeyHash,
    network
  );

  // Keyboard shortcut: Escape to dismiss first bytecode mismatch; Enter to re-verify first mismatch
  useEffect(() => {
    const active = verificationResult?.bytecodeMismatch.filter(a => !dismissedMismatches.includes(a.address)) || [];
    if (active.length === 0) return;
    const handleMismatchKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setDismissedMismatches(prev => [...prev, active[0].address]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        reverify();
      }
    };
    window.addEventListener('keydown', handleMismatchKeyDown);
    return () => window.removeEventListener('keydown', handleMismatchKeyDown);
  }, [verificationResult, dismissedMismatches]);

  // Track verification start time for elapsed display
  useEffect(() => {
    if (isVerifying && verifyStartTime === null) {
      setVerifyStartTime(Date.now());
    } else if (!isVerifying) {
      setVerifyStartTime(null);
    }
  }, [isVerifying]);

  // Mark confirmed contracts as verified to skip bytecode re-verification on future loads
  useEffect(() => {
    if (verificationResult?.confirmed) {
      for (const address of verificationResult.confirmed) {
        const contract = storedContracts.find(c => c.address === address);
        if (contract && !contract.contractVerified) {
          updateContract(address, { contractVerified: true });
        }
      }
    }
  }, [verificationResult]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDiscoveryResult(null);
    const result = await discoverContracts(wallet.address, wallet.pubkeyHash, network);
    setDiscoveredContracts(result.discovered);
    setDiscoveryResult(result);
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
        ownerPkh: c.ownerPkh,
      }));
      setContracts(timeLocks);
      setContractsLoaded(true);

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
    setAutoScanProgress('Starting on-chain scan...');
    setAutoScanCancellable(true);

    async function scanContracts() {
      // Build set of known tx hashes from localStorage for deduplication
      const knownHashes = new Set(transactions.map(t => t.txHash));

      const allOnChainTxs: Transaction[] = [];
      const totalContracts = contractsWithData.length;

      for (let i = 0; i < contractsWithData.length; i++) {
        if (cancelled) break;
        
        const contract = contractsWithData[i];
        // Update progress indicator
        setAutoScanProgress(`Scanning ${contract.address.slice(0, 12)}... (${i + 1}/${totalContracts})`);

        try {
          const onChainTxs = await fetchHistory(contract.address, network, knownHashes);

          for (const otx of onChainTxs) {
            if (cancelled) break;
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

      if (!cancelled) {
        if (allOnChainTxs.length > 0) {
          // Merge: new on-chain txs + existing local txs, sorted by timestamp desc
          const merged = [...allOnChainTxs, ...transactions];
          merged.sort((a, b) => b.timestamp - a.timestamp);
          saveTransactions(merged);
          setLastOnChainScan(Date.now());
          setAutoScanProgress(`Found ${allOnChainTxs.length} new transactions!`);
        } else {
          setAutoScanProgress('No new transactions found.');
        }
        
        // Clear progress after delay
        setTimeout(() => {
          if (!cancelled) {
            setAutoScanProgress('');
            setAutoScanCancellable(false);
          }
        }, 2000);
        
        setScanningOnChain(false);
      } else {
        setAutoScanProgress('Scan cancelled.');
        setAutoScanCancellable(false);
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

  // Filter by wallet (My Wallets vs All Contracts)
  const userPkh = wallet.pubkeyHash || '';
  const userAddr = wallet.address || '';
  let filteredContracts = walletFilter === 'mine' && userPkh
    ? sortedContracts.filter(c => {
        // Single-owner: compare ownerPkh directly
        if (c.type === 'single' && c.ownerPkh) return c.ownerPkh === userPkh;
        // MultiSig: check if any owner matches user's cash address
        if (c.type === 'multisig' && c.owners) {
          const userAddrNorm = userAddr.toLowerCase().replace(/^bitcoincash:/, '');
          return c.owners.some(owner => owner.toLowerCase().replace(/^bitcoincash:/, '') === userAddrNorm);
        }
        return false;
      })
    : sortedContracts;

  // Filter by unlocked status
  if (unlockedFilter) {
    filteredContracts = filteredContracts.filter(c => c.lockEndBlock <= c.currentBlock);
  }

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

  const estimateUnlockDate = (lockEnd: number, current: number): string | null => {
    if (current === 0 || lockEnd <= current) return null;
    const blocksRemaining = lockEnd - current;
    const daysRemaining = blocksRemaining / 144;
    if (daysRemaining > 60) return null;
    return new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      warning: `Withdraw ${contract.balance.toFixed(4)} BCH from this contract?\n\nAddress: ${contract.address.slice(0, 24)}...\n\nThis action cannot be undone.`,
    });
  }, []);

  // ─── Keyboard shortcut: W to quick-withdraw first unlocked wallet ─────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Ignore if modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'w' && e.key !== 'W') return;
      e.preventDefault();

      if (!wallet.connected) {
        setTxStatus({ type: 'error', message: 'Connect your wallet first.' });
        return;
      }

      const unlocked = sortedContracts.filter(c => c.balance > 0 && c.lockEndBlock <= c.currentBlock);
      if (unlocked.length === 0) {
        setTxStatus({ type: 'info', message: 'No unlocked wallets with balance to withdraw.' });
        return;
      }

      handleWithdraw(unlocked[0]);
      setTxStatus({ type: 'info', message: `↪ Quick-withdraw triggered for ${unlocked[0].address.slice(0, 16)}...` });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallet.connected, sortedContracts, handleWithdraw]);// ─── Cancel handler ──────────────────────────────────────────────────────
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
      warning: `Cancel and withdraw ${contract.balance.toFixed(4)} BCH from this contract?\n\nAddress: ${contract.address.slice(0, 24)}...\n\nThis action cannot be undone.`,
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

  // ─── Extend lock handler ─────────────────────────────────────────────────
  const [extendDays, setExtendDays] = useState('');
  const [extendDaysError, setExtendDaysError] = useState('');
  // Ref to track extend days for the current pending tx (avoids stale closure in executePendingTx)
  const extendDaysRef = useRef('');
  const handleExtendRequest = useCallback((contract: TimeLock) => {
    setExtendDays('');
    extendDaysRef.current = '';
    setPendingTx({
      id: `extend-${contract.address}-${Date.now()}`,
      contractAddress: contract.address,
      type: 'extend',
      lockEndBlock: contract.lockEndBlock,
      status: 'confirm',
    });
  }, []);

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
      } else if (pendingTx.type === 'extend') {
        // extend(pubkey ownerPk, sig ownerSig, int newLockEndBlock)
        // Withdraws all funds to owner's P2PKH — user must redeposit to new contract
        const currentLockEnd = pendingTx.lockEndBlock;
        if (!currentLockEnd) throw new Error('Missing lockEndBlock for extend.');
        const daysToAdd = parseInt(extendDaysRef.current || '0');
        if (daysToAdd <= 0) throw new Error('Please enter a valid number of days to extend (minimum 1).');
        const newEndBlock = currentLockEnd + (daysToAdd * 144);
        const extendTx = (contract as any).functions.extend(ownerPkh, BigInt(newEndBlock));
        tx = await extendTx
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

      // Trigger immediate balance refresh after tx broadcast
      refresh();

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

  // Keyboard shortcut: Escape to dismiss pending transaction modal
  const closePendingTxRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!pendingTx) return;
    const handlePendingTxKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      closePendingTxRef.current?.();
    };
    window.addEventListener('keydown', handlePendingTxKeyDown);
    return () => window.removeEventListener('keydown', handlePendingTxKeyDown);
  }, [pendingTx]);

  const closePendingTx = useCallback(() => {
    setPendingTx(null);
    setDepositAmount('');
    setTxStatus(null);
    setWifMode(false);
    // WIF key/address persist in localStorage so user doesn't re-enter on next transaction
  }, []);
  // Keep ref in sync so keyboard shortcut can call the latest closePendingTx
  closePendingTxRef.current = closePendingTx;

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
      } else if (pendingTx.type === 'extend') {
        // Extend lock period — withdraws all funds to owner, who must redeposit into new contract
        const currentLockEnd = pendingTx.lockEndBlock;
        if (!currentLockEnd) throw new Error('Missing lockEndBlock for extend.');
        const daysToAdd = parseInt(extendDaysRef.current || '0');
        if (daysToAdd <= 0) throw new Error('Please enter a valid number of days to extend (minimum 1).');
        const newEndBlock = currentLockEnd + (daysToAdd * 144);
        const result = await extend(
          wifKey.trim(),
          ownerPkh,
          currentLockEnd,
          newEndBlock,
          { network }
        );
        txHash = result.txHash;
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

      // Trigger immediate balance refresh after tx broadcast
      refresh();

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

      {/* Pending transaction indicator */}
      {pendingTx && (
        <MessageBox $type="info" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⏳</span>
            <span>Transaction pending: {pendingTx.type} — {pendingTx.contractAddress.slice(0, 16)}... (click to view)</span>
          </div>
          <button
            onClick={() => setPendingTx(null)}
            style={{
              padding: '4px 12px',
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </MessageBox>
      )}

      {/* Auto-verification progress */}
      {isVerifying && (
        <MessageBox $type="info" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span>
            <span>{verifyProgress || 'Verifying contracts on-chain...'}</span>
            {verifyStartTime && (
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                ({(Math.round((Date.now() - verifyStartTime) / 1000))}s elapsed)
              </span>
            )}
          </div>
          <button
            onClick={abort}
            style={{
              padding: '4px 12px',
              background: 'rgba(239, 68, 68, 0.8)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </MessageBox>
      )}

      {/* Auto-verification results: network errors — may resolve on retry */}
      {verificationResult?.networkErrors && verificationResult.networkErrors.length > 0 && (
        <MessageBox $type="warning" style={{ marginBottom: '20px' }}>
          ⚠️ {verificationResult.networkErrors.length} network error{verificationResult.networkErrors.length !== 1 ? 's' : ''} during verification — data may be incomplete. Connection issue detected.
          <ul style={{ margin: '8px 0 0 16px', fontSize: '12px', opacity: 0.8 }}>
            {verificationResult.networkErrors.slice(0, 3).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {verificationResult.networkErrors.length > 3 && (
              <li>...and {verificationResult.networkErrors.length - 3} more</li>
            )}
          </ul>
          <div style={{ marginTop: '8px' }}>
            <button
              onClick={reverify}
              style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #f59e0b', background: 'transparent', color: '#f59e0b' }}
            >
              ↻ Retry Verification
            </button>
          </div>
        </MessageBox>
      )}

      {/* Auto-verification results: bytecode mismatch detected */}
      {(() => {
        const active = verificationResult?.bytecodeMismatch.filter(a => !dismissedMismatches.includes(a.address)) || [];
        if (active.length === 0) return null;
        return (
          <MessageBox $type="error" style={{ marginBottom: '20px' }}>
            ⚠️ {active.length} contract(s) have bytecode that does NOT match the expected SafeDelay hash — they may be modified or not genuine SafeDelay contracts.
            {active.map(mismatch => (
              <div key={mismatch.address} style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: '12px' }}>{mismatch.address}</code>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>expected</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <code style={{ fontSize: '11px', color: '#86efac', fontFamily: 'monospace' }}>{mismatch.expectedHash.slice(0, 20)}…</code>
                        <button
                          onClick={async () => { await navigator.clipboard.writeText(mismatch.expectedHash); }}
                          title="Copy expected hash"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '10px', padding: '0', lineHeight: 1 }}
                        >
                          📋
                        </button>
                      </div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', alignSelf: 'center' }}>vs</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>actual</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <code style={{ fontSize: '11px', color: '#fca5a5', fontFamily: 'monospace' }}>{mismatch.actualHash.slice(0, 20)}…</code>
                        <button
                          onClick={async () => { await navigator.clipboard.writeText(mismatch.actualHash); }}
                          title="Copy actual hash"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '10px', padding: '0', lineHeight: 1 }}
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={reverify}
                    style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #6366f1', background: 'transparent', color: '#818cf8' }}
                    title="Re-verify all contracts"
                  >
                    Re-verify
                  </button>
                  <button
                    onClick={() => setDismissedMismatches(prev => [...prev, mismatch.address])}
                    style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </MessageBox>
        );
      })()}

      {/* Auto-verification results: orphaned contracts found */}
      {verificationResult && verificationResult.orphaned.length > 0 && (
        <MessageBox $type="error" style={{ marginBottom: '20px' }}>
          ⚠️ {verificationResult.orphaned.length} stored contract(s) not found on-chain. They may have been created on a different network or are invalid. Scroll down to the "On-Chain Contract Recovery" section to review.
        </MessageBox>
      )}

      {/* Auto-verification results: recoverable contracts found (localStorage was empty) */}
      {verificationResult && verificationResult.recoverable.length > 0 && (
        <MessageBox $type="success" style={{ marginBottom: '20px' }}>
          🎉 Found {verificationResult.recoverable.length} SafeDelay contract{verificationResult.recoverable.length !== 1 ? 's' : ''} on-chain that aren&apos;t in your local storage! Scroll down to &quot;On-Chain Contract Recovery&quot; to recover them.
        </MessageBox>
      )}

      {!contractsLoaded ? (
        <StatsGrid>
          {[0, 1, 2].map(i => (
            <StatCard key={i}>
              <StatSkeleton />
              <StatLabelSkeleton />
            </StatCard>
          ))}
        </StatsGrid>
      ) : (
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
      )}

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
      <TransactionSection id="milestone-notifications">
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
                {notifications.slice(-3).reverse().map((n, i) => {
                  const isExpired = n.type === 'expired';
                  return (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      background: isExpired ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>
                      {isExpired
                        ? <>🔓 Lock expired! {n.address.slice(0, 12)}... is now withdrawable</>
                        : <>📬 {n.address.slice(0, 12)}... reached {n.percent}%</>
                      }
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
                );
                })}
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
            <SortLabel>Filter:</SortLabel>
            <SortSelect value={walletFilter} onChange={(e) => { const val = e.target.value as 'all' | 'mine'; setWalletFilter(val); try { localStorage.setItem('safedelay-wallet-filter', val); } catch {} }}>
              <option value="all">All Contracts</option>
              <option value="mine">My Wallets</option>
            </SortSelect>
            <SortLabel style={{ marginLeft: '12px' }}>Sort by:</SortLabel>
            <SortSelect value={sortBy} onChange={(e) => { const val = e.target.value as SortOption; setSortBy(val); try { localStorage.setItem('safedelay-sort', val); } catch {} }} style={{ fontWeight: sortBy !== 'amount' ? 600 : 400 }}>
              <option value="date">Unlock Date</option>
              <option value="amount">Amount</option>
              <option value="unlock">Time Remaining</option>
            </SortSelect>
            <button
              onClick={() => { const next = !unlockedFilter; setUnlockedFilter(next); try { localStorage.setItem('safedelay-unlocked-filter', String(next)); } catch {} }}
              style={{
                marginLeft: '12px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                background: unlockedFilter ? 'rgba(79, 70, 229, 0.6)' : 'rgba(255,255,255,0.05)',
                border: '1px solid',
                borderColor: unlockedFilter ? 'rgba(79, 70, 229, 0.8)' : 'rgba(255,255,255,0.15)',
                color: unlockedFilter ? '#a5b4fc' : 'rgba(255,255,255,0.5)',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Unlocked Only
            </button>
          </SortBar>
        )}

        {wallet.connected && contracts.length > 0 && (
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px', marginLeft: '8px' }}>Press W to quick-withdraw first unlocked wallet</div>
        )}

        {/* On-chain scan progress indicator */}
        {scanningOnChain && autoScanProgress && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(79, 70, 229, 0.15)',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>🔄</span>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>{autoScanProgress}</span>
            </div>
            {autoScanCancellable && (
              <button
                onClick={() => { setScanningOnChain(false); setAutoScanProgress('Scan cancelled.'); setAutoScanCancellable(false); }}
                style={{
                  padding: '4px 12px',
                  background: 'rgba(239, 68, 68, 0.8)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Skeleton while loading contracts from Electrum */}
        {!contractsLoaded && wallet.connected && (
          <ContractList>
            {[0, 1, 2].map(i => (
              <ContractSkeletonCard key={i}>
                <ContractSkeletonLine $w="40%" />
                <ContractSkeletonLine $w="75%" />
                <ContractSkeletonLine $w="55%" />
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <ContractSkeletonLine $w="80px" />
                  <ContractSkeletonLine $w="80px" />
                  <ContractSkeletonLine $w="80px" />
                </div>
              </ContractSkeletonCard>
            ))}
          </ContractList>
        )}

        {/* Scanning indicator: shown when recovery scan is running but no contracts loaded yet */}
        {contractsLoaded && wallet.connected && !sortedContracts.length && recoveryScanning && (
          <ContractList>
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.6)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔄</div>
              <div>{recoveryScanProgress || 'Scanning blockchain for SafeDelay contracts...'}</div>
            </div>
          </ContractList>
        )}

        {wallet.connected ? (
          filteredContracts.length > 0 ? (
            <ContractList>
              {filteredContracts.map((contract) => {
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
                        {(() => {
                          const blocksRemaining = contract.lockEndBlock - contract.currentBlock;
                          if (blocksRemaining <= 0) return null;
                          const daysRemaining = blocksRemaining / 144;
                          if (daysRemaining > 60) return null;
                          const estDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
                          return <span> (~{estDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})</span>;
                        })()}
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
                      <ExtendButton
                        onClick={() => handleExtendRequest(contract)}
                        title="Extend the lock period to a later block (one-way, cannot shorten)"
                      >
                        Extend
                      </ExtendButton>
                    </ContractActions>
                  </ContractCard>
                );
              })}
            </ContractList>
          ) : (
            <EmptyState>
              <div style={{ marginBottom: '8px' }}>📭 No time-locked wallets yet</div>
              <div style={{ fontSize: '13px', marginBottom: '12px', opacity: 0.7 }}>Create your first SafeDelay to get started.</div>
              <button
                onClick={() => onNavigateTab?.('create')}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(79, 70, 229, 0.8)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                → Create SafeDelay
              </button>
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

      {/* ─── Emergency Recovery Section ─────────────────────────────────────── */}
      <BackupSection>
        <SectionTitle>⚠️ Emergency Recovery</SectionTitle>
        <Description>
          Immediately cancel a time-lock and recover all funds to your wallet address. Use this if you made a mistake or need urgent access — funds are sent directly to your wallet and the lock is permanently destroyed.
        </Description>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' }}>
            <strong style={{ color: '#ef4444' }}>Warning:</strong> Cancel is immediate and irreversible. Funds are sent to your wallet address and the contract is permanently destroyed. Only use this for emergency recovery.
          </div>
        </div>
        {wallet.connected && filteredContracts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredContracts
              .filter(c => c.lockEndBlock > c.currentBlock) // only locked contracts
              .map(c => (
                <div key={c.address} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
                      {c.address.slice(0, 24)}...{c.address.slice(-8)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                      {c.balance.toFixed(4)} BCH · 🔒 Locked for {Math.max(0, c.lockEndBlock - c.currentBlock).toLocaleString()} more blocks
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancel(c)}
                    style={{
                      padding: '6px 14px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🚨 Cancel & Recover
                  </button>
                </div>
              ))}
            {sortedContracts.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                No SafeDelay wallets yet.
              </div>
            ) : sortedContracts.filter(c => c.lockEndBlock > c.currentBlock).length === 0 ? (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                ✅ All SafeDelay wallets are currently unlocked. Total: {sortedContracts.reduce((sum, c) => sum + c.balance, 0).toFixed(4)} BCH
              </div>
            ) : null}
          </div>
        ) : wallet.connected ? (
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
              <span>No time-locked wallets yet.</span>
              <button
                onClick={() => onNavigateTab?.('create')}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                → Create SafeDelay
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
            Connect your wallet to manage emergency recovery.
          </div>
        )}
      </BackupSection>

      {/* ─── On-Chain Contract Recovery Section ─────────────────────────────── */}
      <BackupSection id="onchain-recovery-section">
        <SectionTitle>🔍 On-Chain Contract Recovery</SectionTitle>
        <Description>
          Lost your contracts due to browser data clearing? Scan the blockchain to recover them using your wallet address.
        </Description>

        {/* Banner shown when saved scan results were restored from localStorage */}
        {showSavedBanner && (
          <MessageBox $type="success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span>
              📋 Previous scan found <strong>{discoveredContracts.length}</strong> contract{discoveredContracts.length !== 1 ? 's' : ''} on-chain.
              {!recoveryScanDone && ' Click "Review" to see them, or run a new scan below.'}
              {recoveryScanDone && ' Review them below or run a fresh scan.'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {recoveryScanDone && (
                <button
                  onClick={() => setShowSavedBanner(false)}
                  style={{
                    padding: '4px 12px',
                    background: 'rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              )}
              <button
                onClick={() => {
                  setShowSavedBanner(false);
                  // Trigger the section to scroll into view
                  document.getElementById('onchain-recovery-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  padding: '4px 12px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Review
              </button>
            </div>
          </MessageBox>
        )}

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <MessageBox $type="success" style={{ margin: 0, flex: 1 }}>
                Found {discoveredContracts.length} SafeDelay contract{discoveredContracts.length !== 1 ? 's' : ''} on-chain!
                {scanTimestamp && (
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginLeft: '8px' }}>
                    Scanned {(() => {
                      const mins = Math.floor((Date.now() - scanTimestamp) / 60000);
                      if (mins < 1) return 'just now';
                      if (mins < 60) return `${mins}m ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      return `${Math.floor(hrs / 24)}d ago`;
                    })()}
                  </span>
                )}
              </MessageBox>
              <button
                onClick={() => {
                  setDiscoveredContracts([]);
                  setRecoveryScanDone(false);
                  setDiscoveryResult(null);
                  setShowSavedBanner(false);
                  clearSavedScanResult();
                }}
                style={{
                  padding: '4px 12px',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Clear Scan
              </button>
            </div>
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
                      {estimateUnlockDate(c.lockEndBlock, currentBlock ?? 0) && (
                        <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.5)' }}>
                          (~{estimateUnlockDate(c.lockEndBlock, currentBlock ?? 0)})
                        </span>
                      )}
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
          {recoveryScanning && recoveryScanProgress && (
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginLeft: '10px', minWidth: '180px' }}>
              {recoveryScanProgress}
            </span>
          )}
          {recoveryScanning && (
            <button
              onClick={abortDiscovery}
              style={{
                padding: '10px 20px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel Scan
            </button>
          )}
        </BackupActions>

        {!recoveryScanning && recoveryScanDone && discoveredContracts.length > 0 && (
          <button
            onClick={() => {
              setDiscoveredContracts([]);
              setRecoveryScanDone(false);
              setDiscoveryResult(null);
              clearSavedScanResult();
            }}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            Clear
          </button>
        )}

        {!wallet.connected && (
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>
            Connect your wallet to scan for contracts
          </div>
        )}

        {discoveryResult && discoveryResult.errors.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
              Scan warnings:
            </div>
            {discoveryResult.errors.slice(0, 3).map((err, i) => (
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
               pendingTx.type === 'extend' ? '🔒 Extend Lock' :
               '💰 Deposit Funds'}
            </ModalTitle>
            <ModalDesc>
              {pendingTx.type === 'withdraw' && 'Withdraw your locked BCH once the lock period has expired. This will send all funds to your wallet address.'}
              {pendingTx.type === 'cancel' && 'Cancel the SafeDelay contract and return all funds to your wallet immediately. No wait time required.'}
              {pendingTx.type === 'extend' && 'One-way extend: your lock end block moves forward. All funds are sent to your wallet — you must create a new SafeDelay and deposit again. Cannot be undone.'}
              {pendingTx.type === 'deposit' && `Deposit BCH into your SafeDelay contract at ${pendingTx.contractAddress.slice(0, 16)}...`}
            </ModalDesc>

            {pendingTx.status === 'confirm' && pendingTx.warning && (
              <MessageBox $type="warning" style={{ marginBottom: '16px', fontSize: '13px', whiteSpace: 'pre-line' }}>
                {pendingTx.warning}
              </MessageBox>
            )}

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

            {pendingTx.status === 'confirm' && pendingTx.type === 'extend' && (
              <div style={{ marginBottom: '16px' }}>
                <MessageBox $type="warning" style={{ marginBottom: '12px', fontSize: '13px' }}>
                  ⚠️ This will send ALL funds to your wallet. You must create a new SafeDelay with the extended lock and deposit again. Cannot be undone.
                </MessageBox>
                <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
                  Current lock: block {pendingTx.lockEndBlock} — add days to extend:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ModalInput
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g. 30"
                    value={extendDays}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExtendDays(val);
                      extendDaysRef.current = val;
                      // Real-time validation
                      if (val && parseInt(val) <= 0) {
                        setExtendDaysError('Enter a positive number of days');
                      } else {
                        setExtendDaysError('');
                      }
                    }}
                    style={extendDaysError ? { borderColor: '#f44336' } : {}}
                  />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>days</span>
                </div>
                {extendDaysError && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#f44336' }}>
                    {extendDaysError}
                  </div>
                )}
                {extendDays && pendingTx.lockEndBlock && parseInt(extendDays) > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                    New lock end block: {pendingTx.lockEndBlock + (parseInt(extendDays) * 144)} (~{extendDays} days from now)
                  </div>
                )}
              </div>
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
                          disabled={pendingTx.type === 'deposit' && !depositAmount || pendingTx.type === 'extend' && !extendDays}
                        >
                          {pendingTx.type === 'withdraw' ? '💸 Withdraw (Wallet)' :
                           pendingTx.type === 'cancel' ? '✕ Cancel Contract (Wallet)' :
                           pendingTx.type === 'extend' ? '🔒 Extend Lock (Wallet)' :
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
                      <QrScanner onScan={handleWifKeyChange} addressMode={pendingTx.type === 'deposit'} />
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
                        disabled={!wifAddress || (pendingTx.type === 'deposit' && !depositAmount) || (pendingTx.type === 'extend' && !extendDays)}
                      >
                        {`🔑 Sign with WIF — ${pendingTx.type === 'withdraw' ? 'Withdraw' : pendingTx.type === 'cancel' ? 'Cancel' : pendingTx.type === 'extend' ? 'Extend Lock' : 'Deposit'}`}
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
                   pendingTx.type === 'extend' ? '🔒 Extend Lock' :
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
