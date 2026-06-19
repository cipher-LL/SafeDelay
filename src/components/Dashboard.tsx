import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { useWalletLabels } from '../hooks/useWalletLabels';
import { debug, debugLog } from '../utils/debug';
import { useWalletBackup } from '../hooks/useWalletBackup';
import { useDepositMilestones } from '../hooks/useDepositMilestones';
import { useStoredContracts, useElectrumContractData } from '../hooks/useSafeDelayContracts';
import { useOnChainTxHistory } from '../hooks/useOnChainTxHistory';
import { useWifSigner } from '../hooks/useWifSigner';
import { useOnChainContractDiscovery, DiscoveredContract, ScanResult, clearSavedScanResult } from '../hooks/useOnChainContractDiscovery';
import { useAutoContractVerification } from '../hooks/useAutoContractVerification';
import { Network, Contract } from 'cashscript';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';
import { deposit, waitForTxConfirmation, extend } from '../utils/SafeDelayLibrary';
import {
  DashboardContainer, Title, Description, AutoRefreshToggle,
  MessageBox,
  BackupSection, BackupActions, ExportBtn, ImportBtn, FileInput,
  PasswordInput, PasswordLabel, EncryptNote, SectionTitle,
} from './Dashboard.styles';

// Sub-components
import DashboardVerificationBanners from './Dashboard/DashboardVerificationBanners';
import DashboardStatsCards from './Dashboard/DashboardStatsCards';
import DashboardTransactionList from './Dashboard/DashboardTransactionList';
import DashboardContractList from './Dashboard/DashboardContractList';
import DashboardRecoveryScanSection from './Dashboard/DashboardRecoveryScanSection';
import DashboardPendingTxModal from './Dashboard/DashboardPendingTxModal';

// Re-export types for consumers
export type { TimeLock, Transaction, PendingTx, SortOption } from './Dashboard/types';

// Local type alias for network (our app uses 'mainnet' | 'testnet' | 'chipnet')
type AppNetwork = 'mainnet' | 'testnet' | 'chipnet';

const STORAGE_KEY = 'safedelay_transactions';

// Map our network strings to CashScript Network type
function toCashScriptNetwork(network: AppNetwork): Network {
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

export default function Dashboard({ onNavigateTab }: { onNavigateTab?: (tab: 'create' | 'multisig' | 'dashboard' | 'manager') => void }) {
  const { network } = useNetwork();
  const { wallet, hasSigner } = useWallet();
  const { getLabel, setLabel } = useWalletLabels();
  const { contracts: storedContracts } = useStoredContracts();
  const { contracts: contractsWithData, currentBlock, refresh } = useElectrumContractData(storedContracts, network);
  const { signWithdraw, signCancel, getAddressFromWif } = useWifSigner();
  const [contracts, setContracts] = useState<import('./Dashboard/types').TimeLock[]>([]);

  // Apply wallet labels atomically with contract data to prevent label flash during on-chain scans
  const labeledContracts = useMemo(() => {
    return contracts.map(c => ({
      ...c,
      displayLabel: getLabel(c.address) ?? undefined,
    }));
  }, [contracts, getLabel]);

  const [transactions, setTransactions] = useState<import('./Dashboard/types').Transaction[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdraw' | 'cancel' | 'create'>(() => {
    try { return (localStorage.getItem('safedelay-tx-filter') as any) || 'all'; } catch { return 'all'; }
  });
  const [sortBy, setSortBy] = useState<import('./Dashboard/types').SortOption>(() => {
    try { return (localStorage.getItem('safedelay-sort') as import('./Dashboard/types').SortOption) || 'amount'; } catch { return 'amount'; }
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
  const [pendingTx, setPendingTx] = useState<import('./Dashboard/types').PendingTx | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [txStatus, setTxStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [scanningOnChain, setScanningOnChain] = useState(false);
  const [lastOnChainScan, setLastOnChainScan] = useState<number>(0);
  // WIF signing state — persisted so users don't re-enter key every session
  const [wifMode, setWifMode] = useState(() => localStorage.getItem('safedelay_wif_mode') === 'true');
  const [wifKey, setWifKey] = useState(() => localStorage.getItem('safedelay_wif_key') || '');
  const [wifAddress, setWifAddress] = useState(() => localStorage.getItem('safedelay_wif_address') || '');
  const [dismissedMismatches, setDismissedMismatches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('safedelay_dismissed_mismatches') || '[]'); } catch { return []; }
  });
  const [wifError, setWifError] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    try { return localStorage.getItem('safedelay-auto-refresh') !== 'false'; } catch { return true; }
  });
  const autoRefreshRef = useRef(false);

  useEffect(() => {
    autoRefreshRef.current = autoRefreshEnabled;
  }, [autoRefreshEnabled]);

  useEffect(() => {
    if (!autoRefreshEnabled || !storedContracts.length) return;
    const interval = setInterval(() => {
      if (autoRefreshRef.current) refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, storedContracts.length, refresh]);

  useEffect(() => {
    if (wallet.connected && storedContracts.length > 0) {
      setContractsLoaded(true);
    }
  }, [wallet.connected, storedContracts.length]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const filtered = parsed.filter((tx: any) =>
          tx.timestamp > Date.now() - 90 * 24 * 60 * 60 * 1000
        );
        setTransactions(filtered);
      } catch {}
    }
  }, []);

  const [autoScanProgress, setAutoScanProgress] = useState<string>('');
  const [autoScanCancellable, setAutoScanCancellable] = useState(false);

  const { fetchHistory } = useOnChainTxHistory();
  const { discoverContracts, scanning: recoveryScanning, scanProgress: recoveryScanProgress, abort: abortDiscovery, scanTimestamp } = useOnChainContractDiscovery();
  const [discoveredContracts, setDiscoveredContracts] = useState<DiscoveredContract[]>([]);
  const [recoveryScanDone, setRecoveryScanDone] = useState(false);

  const savedScan = (() => {
    try {
      const raw = localStorage.getItem('safedelay_discovery_results');
      if (!raw) return null;
      const { result, timestamp } = JSON.parse(raw);
      const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
      if (!result || Date.now() - timestamp > MAX_AGE) return null;
      return result as ScanResult;
    } catch { return null; }
  })();

  useEffect(() => {
    if (!savedScan) return;
    setDiscoveredContracts(savedScan.discovered);
    setDiscoveryResult(savedScan);
    setRecoveryScanDone(true);
    setShowSavedBanner(true);
  }, []);

  const [discoveryResult, setDiscoveryResult] = useState<ScanResult | null>(null);

  const [showSavedBanner, setShowSavedBanner] = useState(false);

  const { verificationResult, isVerifying, verifyProgress, verifyProgressDetail, abort, pause, reverify } = useAutoContractVerification(
    storedContracts,
    wallet.address,
    wallet.pubkeyHash,
    network,
  );

  // Pause/resume auto-verification via keyboard shortcut
  useEffect(() => {
    const handleMismatchKeyDown = (e: KeyboardEvent) => {
      if (!verificationResult) return;
      if (active.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== 'p' && e.key !== 'P') return;
      e.preventDefault();
      pause();
    };
    window.addEventListener('keydown', handleMismatchKeyDown);
    return () => window.removeEventListener('keydown', handleMismatchKeyDown);
  }, [verificationResult, pause]);

  const active = verificationResult?.bytecodeMismatch.filter(a => !dismissedMismatches.includes(a.address)) || [];

  // Auto-scan when wallet connects and contracts are empty
  useEffect(() => {
    if (!wallet.connected || contractsWithData.length === 0) return;
    if (scanningOnChain) return; // Already scanning
    if (Date.now() - lastOnChainScan < 5 * 60 * 1000) return;
    handleRecoveryScan();
  }, [wallet.connected]);

  // Periodic re-verification (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (labeledContracts.length > 0) reverify();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [labeledContracts.length, reverify]);

  // Update block height for milestone tracking when it changes
  useEffect(() => {
    if (currentBlock === undefined || !wallet.connected) return;
  }, [currentBlock, wallet.connected]);

  const saveTransactions = useCallback((txs: import('./Dashboard/types').Transaction[]) => {
    try {
      const filtered = txs.filter(tx => tx.timestamp > Date.now() - 90 * 24 * 60 * 60 * 1000);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      setTransactions(filtered);
    } catch {}
  }, []);

  const addTransactionRecord = useCallback((tx: Omit<import('./Dashboard/types').Transaction, 'id' | 'timestamp'>) => {
    const newTx: import('./Dashboard/types').Transaction = {
      ...tx,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    };
    setTransactions(prev => {
      const next = [newTx, ...prev].slice(0, 100);
      saveTransactions(next);
      return next;
    });
  }, [saveTransactions]);

  const getWalletData = useCallback(() => ({
    pubkeyHash: wallet.pubkeyHash,
    address: wallet.address,
    network: toCashScriptNetwork(network),
  }), [wallet.pubkeyHash, wallet.address, network]);

  const { exportBackup, importBackup, exporting, importing, error: backupError, success: backupSuccess, clearMessages: clearBackupMessages } = useWalletBackup(getWalletData);

  // Milestone notifications
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

  const handleRecoveryScan = useCallback(async () => {
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
  }, [wallet.connected, wallet.pubkeyHash, wallet.address, network, discoverContracts]);

  const handleRecoverContract = useCallback((contract: DiscoveredContract) => {
    if (!wallet.pubkeyHash) return;
    const newContract: import('../hooks/useSafeDelayContracts').StoredContract = {
      address: contract.address,
      ownerPkh: wallet.pubkeyHash,
      lockEndBlock: contract.lockEndBlock,
      type: contract.type,
      owners: contract.owners,
      createdAt: Date.now(),
    };
    const existing = storedContracts.find(c => c.address === contract.address);
    if (!existing) {
      const merged = [...storedContracts, newContract];
      localStorage.setItem('safedelay_contracts', JSON.stringify(merged));
      setTxStatus({ type: 'success', message: `✅ Contract ${contract.address.slice(0, 16)}... recovered! Refreshing page...` });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setTxStatus({ type: 'info', message: `ℹ️ Contract ${contract.address.slice(0, 16)}... is already in your list.` });
    }
  }, [wallet.pubkeyHash, storedContracts]);

  const handleRecoverAll = useCallback(() => {
    discoveredContracts.forEach(c => handleRecoverContract(c));
  }, [discoveredContracts, handleRecoverContract]);

  // Set contracts + track milestones when data loads
  useEffect(() => {
    if (wallet.connected && contractsWithData.length > 0) {
      const timeLocks: import('./Dashboard/types').TimeLock[] = contractsWithData.map(c => ({
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
    if (Date.now() - lastOnChainScan < 5 * 60 * 1000) return;

    let cancelled = false;
    setScanningOnChain(true);
    setAutoScanProgress('Starting on-chain scan...');
    setAutoScanCancellable(true);

    async function scanContracts() {
      const knownHashes = new Set(transactions.map(t => t.txHash));
      const allOnChainTxs: import('./Dashboard/types').Transaction[] = [];
      const totalContracts = contractsWithData.length;

      for (let i = 0; i < contractsWithData.length; i++) {
        if (cancelled) break;

        const contract = contractsWithData[i];
        setAutoScanProgress(`Scanning ${contract.address.slice(0, 12)}... (${i + 1}/${totalContracts})`);

        try {
          const onChainTxs = await fetchHistory(contract.address, network, knownHashes);

          for (const otx of onChainTxs) {
            if (cancelled) break;
            if (knownHashes.has(otx.txHash)) continue;
            if (otx.type === 'unknown' || otx.type === 'send' || otx.type === 'receive') {
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
          const merged = [...allOnChainTxs, ...transactions];
          merged.sort((a, b) => b.timestamp - a.timestamp);
          saveTransactions(merged);
          setLastOnChainScan(Date.now());
          setAutoScanProgress(`Found ${allOnChainTxs.length} new transactions!`);
        } else {
          setAutoScanProgress('No new transactions found.');
        }
        setTimeout(() => {
          if (!cancelled) {
            setAutoScanProgress('');
            setAutoScanCancellable(false);
          }
        }, 2000);
      }
    }

    scanContracts().catch(() => {
      if (!cancelled) {
        setScanningOnChain(false);
        setAutoScanProgress('');
        setAutoScanCancellable(false);
      }
    });

    return () => { cancelled = true; };
  }, [wallet.connected, contractsWithData, scanningOnChain, lastOnChainScan, transactions, network, fetchHistory, saveTransactions]);

  const sortedContracts = useMemo(() => [...labeledContracts].sort((a, b) => {
    if (sortBy === 'amount') return b.balance - a.balance;
    if (sortBy === 'date') {
      const aRemaining = Math.max(0, a.lockEndBlock - a.currentBlock);
      const bRemaining = Math.max(0, b.lockEndBlock - b.currentBlock);
      return aRemaining - bRemaining;
    }
    return a.lockEndBlock - b.lockEndBlock;
  }), [labeledContracts, sortBy]);

  const userPkh = wallet.pubkeyHash || '';
  const userAddr = wallet.address || '';
  const userAddrNorm = userAddr.toLowerCase().replace(/^bitcoincash:/, '');

  const filteredContracts = useMemo(() => {
    let result = sortedContracts;
    if (walletFilter === 'mine') {
      result = result.filter(c => {
        if (c.type === 'single' && c.ownerPkh) return c.ownerPkh === userPkh;
        if (c.type === 'multisig' && c.owners) {
          return c.owners.some(owner => owner.toLowerCase().replace(/^bitcoincash:/, '') === userAddrNorm);
        }
        return false;
      });
    }
    if (unlockedFilter) {
      result = result.filter(c => c.lockEndBlock <= c.currentBlock);
    }
    return result;
  }, [sortedContracts, walletFilter, userPkh, userAddrNorm, unlockedFilter]);

  const handleSaveLabel = (address: string) => {
    setLabel(address, labelInput);
    setEditingLabel(null);
    setLabelInput('');
  };

  const handleEditLabel = (address: string) => {
    setEditingLabel(address);
    setLabelInput(getLabel(address) || '');
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {}
  };

  const handleToggleQR = (address: string) => {
    setShowQRCode(showQRCode === address ? null : address);
  };

  const getContractInstance = useCallback(async (contract: import('./Dashboard/types').TimeLock) => {
    const artifact = contract.type === 'multisig' ? SafeDelayMultiSigArtifact : SafeDelayArtifact;
    const artifactNetworks = artifact.networks as Record<string, any>;
    const networkKey = network === 'mainnet' ? 'mainnet' : network === 'testnet' ? 'testnet' : 'chipnet';
    const fund = artifactNetworks[networkKey];
    if (!fund) return null;
    try {
      if (contract.type === 'multisig' && contract.owners) {
        return new Contract(
          artifact,
          [2, contract.owners],
          { address: contract.address }
        );
      }
      return new Contract(
        artifact,
        [],
        { address: contract.address }
      );
    } catch {
      return null;
    }
  }, [network]);

  const handleWithdraw = useCallback(async (contract: import('./Dashboard/types').TimeLock) => {
    debug('Withdraw triggered for:', contract.address);
    if (!hasSigner && !wifKey) {
      setPendingTx({
        id: Math.random().toString(36).slice(2),
        contractAddress: contract.address,
        type: 'withdraw',
        status: 'confirm',
      });
      return;
    }
    setPendingTx({
      id: Math.random().toString(36).slice(2),
      contractAddress: contract.address,
      type: 'withdraw',
      status: 'confirm',
    });
  }, [hasSigner, wifKey]);

  // Keyboard shortcut: W = quick-withdraw first unlocked
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!wallet.connected) return;
      if (!hasSigner && !wifKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'w' && e.key !== 'W') return;
      const unlocked = sortedContracts.filter(c => c.lockEndBlock <= c.currentBlock);
      if (unlocked.length === 0) return;
      e.preventDefault();
      handleWithdraw(unlocked[0]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallet.connected, sortedContracts, handleWithdraw, hasSigner, wifKey]);

  const handleCancel = useCallback((contract: import('./Dashboard/types').TimeLock) => {
    debug('Cancel triggered for:', contract.address);
    setPendingTx({
      id: Math.random().toString(36).slice(2),
      contractAddress: contract.address,
      type: 'cancel',
      status: 'confirm',
    });
  }, []);

  const handleDepositRequest = useCallback((contract: import('./Dashboard/types').TimeLock) => {
    debug('Deposit request for:', contract.address);
    setPendingTx({
      id: Math.random().toString(36).slice(2),
      contractAddress: contract.address,
      type: 'deposit',
      status: 'confirm',
    });
  }, []);

  const [extendDays, setExtendDays] = useState('');
  const [extendDaysError, setExtendDaysError] = useState('');
  const extendDaysRef = useRef('');

  const handleExtendRequest = useCallback((contract: import('./Dashboard/types').TimeLock) => {
    debug('Extend request for:', contract.address);
    setPendingTx({
      id: Math.random().toString(36).slice(2),
      contractAddress: contract.address,
      type: 'extend',
      lockEndBlock: contract.lockEndBlock,
      status: 'confirm',
    });
  }, []);

  const executePendingTx = useCallback(async () => {
    if (!pendingTx) return;
    try {
      if (pendingTx.type === 'deposit' && pendingTx.contractAddress) {
        const amt = parseFloat(depositAmount) || 0.01;
        setPendingTx(prev => prev ? { ...prev, status: 'broadcasting' } : null);
        const txHash = await deposit({
          address: pendingTx.contractAddress,
          amount: amt,
        });
        if (txHash) {
          setPendingTx(prev => prev ? { ...prev, status: 'success', txHash } : null);
          addTransactionRecord({ type: 'deposit', amount: amt, txHash, contractAddress: pendingTx.contractAddress });
          setDepositAmount('');
          await waitForTxConfirmation(txHash);
          setPendingTx(prev => prev ? { ...prev, status: 'confirmed' } : null);
          return;
        }
      }
      if (pendingTx.type === 'withdraw' || pendingTx.type === 'cancel' || pendingTx.type === 'extend') {
        const contract = contracts.find(c => c.address === pendingTx.contractAddress);
        if (!contract) throw new Error('Contract not found');
        const instance = await getContractInstance(contract);
        if (!instance) throw new Error('Failed to create contract instance');
        setPendingTx(prev => prev ? { ...prev, status: 'broadcasting' } : null);

        let txHash: string | undefined;
        if (pendingTx.type === 'withdraw') {
          txHash = await signWithdraw(instance);
        } else if (pendingTx.type === 'cancel') {
          txHash = await signCancel(instance);
        } else if (pendingTx.type === 'extend') {
          const days = parseInt(extendDays);
          if (isNaN(days) || days <= 0) {
            setExtendDaysError('Enter a positive number of days');
            setPendingTx(prev => prev ? { ...prev, status: 'confirm' } : null);
            return;
          }
          const newLockBlock = pendingTx.lockEndBlock! + days * 144;
          txHash = await extend(instance, newLockBlock);
        }
        if (!txHash) throw new Error('No transaction hash returned from the network.');
        setPendingTx(prev => prev ? { ...prev, status: 'success', txHash } : null);
        addTransactionRecord({
          type: pendingTx.type === 'extend' ? 'create' : pendingTx.type,
          amount: contract.balance,
          txHash,
          contractAddress: contract.address,
        });
        await waitForTxConfirmation(txHash);
        setPendingTx(prev => prev ? { ...prev, status: 'confirmed' } : null);
      }
    } catch (err: any) {
      debug('Transaction error:', err);
      setPendingTx(prev => prev ? { ...prev, status: 'error', error: err.message || 'Transaction failed' } : null);
    }
  }, [pendingTx, depositAmount, contracts, getContractInstance, signWithdraw, signCancel, addTransactionRecord]);

  // Close modal on Escape
  useEffect(() => {
    const handlePendingTxKeyDown = (e: KeyboardEvent) => {
      if (!pendingTx) return;
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    };
    window.addEventListener('keydown', handlePendingTxKeyDown);
    return () => window.removeEventListener('keydown', handlePendingTxKeyDown);
  }, [pendingTx]);

  const closePendingTx = useCallback(() => {
    setPendingTx(null);
    setDepositAmount('');
    setExtendDays('');
    setExtendDaysError('');
    setWifMode(false);
  }, []);

  const executeWifTx = useCallback(async () => {
    if (!pendingTx) return;
    try {
      setPendingTx(prev => prev ? { ...prev, status: 'broadcasting' } : null);
      // WIF transactions require manual signing logic via useWifSigner
      const addr = await getAddressFromWif(wifKey);
      if (!addr) throw new Error('Could not derive address from WIF key');

      if (pendingTx.type === 'withdraw' || pendingTx.type === 'cancel') {
        const contract = contracts.find(c => c.address === pendingTx.contractAddress);
        if (!contract) throw new Error('Contract not found');
        const instance = await getContractInstance(contract);
        if (!instance) throw new Error('Failed to create contract instance');

        let txHash: string | undefined;
        if (pendingTx.type === 'withdraw') txHash = await signWithdraw(instance);
        else txHash = await signCancel(instance);

        if (!txHash) throw new Error('No transaction hash returned from the network.');
        setPendingTx(prev => prev ? { ...prev, status: 'success', txHash } : null);
        addTransactionRecord({
          type: pendingTx.type,
          amount: contract.balance,
          txHash,
          contractAddress: contract.address,
        });
        await waitForTxConfirmation(txHash);
        setPendingTx(prev => prev ? { ...prev, status: 'confirmed' } : null);
      }
    } catch (err: any) {
      debug('WIF transaction error:', err);
      setWifError(err.message || 'Transaction failed');
      setPendingTx(prev => prev ? { ...prev, status: 'error', error: err.message || 'Transaction failed' } : null);
    }
  }, [pendingTx, wifKey, contracts, getContractInstance, getAddressFromWif, signWithdraw, signCancel, addTransactionRecord]);

  const handleWifKeyChange = useCallback((value: string) => {
    setWifKey(value);
    if (!value) {
      setWifAddress('');
      setWifError('');
      return;
    }
    if (!/^[KLc][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(value)) {
      setWifError('Invalid WIF key format');
      setWifAddress('');
      return;
    }
    setWifError('');
    // Basic display of WIF address (partial for UX)
    setWifAddress(value.slice(0, 10) + '...' + value.slice(-6));
    try {
      localStorage.setItem('safedelay_wif_key', value);
    } catch {}
  }, []);

  const filteredTransactions = txFilter === 'all'
    ? transactions
    : transactions.filter(tx => tx.type === txFilter);

  return (
    <DashboardContainer>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <Title>Dashboard</Title>
          <Description>
            View and manage your time-locked wallets
          </Description>
        </div>
        <AutoRefreshToggle
          $active={autoRefreshEnabled}
          $loading={false}
          onClick={() => {
            const next = !autoRefreshEnabled;
            setAutoRefreshEnabled(next);
            try { localStorage.setItem('safedelay-auto-refresh', String(next)); } catch {}
          }}
          title={autoRefreshEnabled ? 'Auto-refresh ON — click to disable' : 'Auto-refresh OFF — click to enable'}
        >
          <span>{autoRefreshEnabled ? '⟳' : '↻'}</span>
          {autoRefreshEnabled ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        </AutoRefreshToggle>
      </div>

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

      {/* Verification banners */}
      <DashboardVerificationBanners
        network={network}
        verificationResult={verificationResult}
        isVerifying={isVerifying}
        verifyProgress={verifyProgress}
        verifyProgressDetail={verifyProgressDetail}
        dismissedMismatches={dismissedMismatches}
        onDismissMismatch={(addr) => {
          setDismissedMismatches(prev => [...prev, addr]);
          try { localStorage.setItem('safedelay_dismissed_mismatches', JSON.stringify([...dismissedMismatches, addr])); } catch {}
        }}
        onReverify={reverify}
        onPause={pause}
        onAbort={abort}
        getLabel={getLabel}
      />

      {/* Stats Cards + Analytics + Milestone Notifications */}
      <DashboardStatsCards
        contracts={labeledContracts}
        contractsLoaded={contractsLoaded}
        transactions={transactions}
        permission={permission}
        milestones={milestones}
        notifications={notifications}
        onRequestPermission={requestPermission}
        onSetMilestones={setMilestoneTargets}
        onDismissNotification={dismissNotification}
        onClearNotifications={clearNotifications}
      />

      {/* Transaction History */}
      <DashboardTransactionList
        network={network}
        walletConnected={wallet.connected}
        transactions={filteredTransactions}
        txFilter={txFilter}
        onSetTxFilter={setTxFilter}
      />

      {/* Active Contracts */}
      <DashboardContractList
        network={network}
        walletConnected={wallet.connected}
        contracts={contracts}
        contractsLoaded={contractsLoaded}
        sortedContracts={sortedContracts}
        filteredContracts={filteredContracts}
        walletFilter={walletFilter}
        sortBy={sortBy}
        unlockedFilter={unlockedFilter}
        editingLabel={editingLabel}
        labelInput={labelInput}
        showQRCode={showQRCode}
        copiedAddress={copiedAddress}
        scanningOnChain={scanningOnChain}
        autoScanProgress={autoScanProgress}
        autoScanCancellable={autoScanCancellable}
        recoveryScanning={recoveryScanning}
        recoveryScanProgress={recoveryScanProgress}
        onNavigateTab={onNavigateTab}
        onSetWalletFilter={setWalletFilter}
        onSetSortBy={setSortBy}
        onSetUnlockedFilter={setUnlockedFilter}
        onEditLabel={handleEditLabel}
        onSaveLabel={handleSaveLabel}
        onCancelEditLabel={() => { setEditingLabel(null); setLabelInput(''); }}
        onSetLabelInput={setLabelInput}
        onCopyAddress={handleCopyAddress}
        onToggleQR={handleToggleQR}
        onWithdraw={handleWithdraw}
        onCancel={handleCancel}
        onDepositRequest={handleDepositRequest}
        onExtendRequest={handleExtendRequest}
        onCancelScan={() => { setScanningOnChain(false); setAutoScanProgress('Scan cancelled.'); setAutoScanCancellable(false); }}
      />

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

      {/* Emergency Recovery Section */}
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
              .filter(c => c.lockEndBlock > c.currentBlock)
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

      {/* On-Chain Recovery Scan Section */}
      <DashboardRecoveryScanSection
        network={network}
        walletConnected={wallet.connected}
        recoveryScanning={recoveryScanning}
        recoveryScanProgress={recoveryScanProgress}
        recoveryScanDone={recoveryScanDone}
        discoveredContracts={discoveredContracts}
        scanTimestamp={scanTimestamp ?? null}
        discoveryResult={discoveryResult}
        showSavedBanner={showSavedBanner}
        currentBlock={currentBlock}
        onHandleRecoveryScan={handleRecoveryScan}
        onAbortDiscovery={abortDiscovery}
        onHandleRecoverContract={handleRecoverContract}
        onHandleRecoverAll={handleRecoverAll}
        onClearScanResults={() => {
          setDiscoveredContracts([]);
          setRecoveryScanDone(false);
          setDiscoveryResult(null);
          setShowSavedBanner(false);
          clearSavedScanResult();
        }}
        onDismissSavedBanner={() => setShowSavedBanner(false)}
      />

      {/* Pending Transaction Modal */}
      <DashboardPendingTxModal
        network={network}
        pendingTx={pendingTx}
        wifMode={wifMode}
        wifKey={wifKey}
        wifAddress={wifAddress}
        wifError={wifError}
        hasSigner={hasSigner}
        extendDays={extendDays}
        extendDaysError={extendDaysError}
        depositAmount={depositAmount}
        onNavigateTab={onNavigateTab}
        onClosePendingTx={closePendingTx}
        onExecutePendingTx={executePendingTx}
        onExecuteWifTx={executeWifTx}
        onSetWifMode={setWifMode}
        onSetWifKey={handleWifKeyChange}
        onSetWifAddress={setWifAddress}
        onSetWifError={setWifError}
        onSetExtendDays={(val) => {
          setExtendDays(val);
          extendDaysRef.current = val;
          if (val && parseInt(val) <= 0) setExtendDaysError('Enter a positive number of days');
          else setExtendDaysError('');
        }}
        onSetDepositAmount={setDepositAmount}
        onSetPendingTx={setPendingTx}
      />
    </DashboardContainer>
  );
}
