/**
 * SafeDelayManagerDashboard.tsx
 *
 * Frontend dashboard for the SafeDelayManager registry contract.
 *
 * Features:
 * - Browse all SafeDelay wallets registered in a manager
 * - Filter by connected wallet's PKH
 * - Compute new SafeDelay addresses and guide funding
 * - Register funded SafeDelay addresses with the manager
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { getManagerAddress, getServiceProviderPkh, isManagerDeployed } from '../config/contracts';
import { ElectrumNetworkProvider, Network, Contract } from 'cashscript';
import SafeDelayManagerArtifact from '../../artifacts/SafeDelayManager.artifact.json';
import {
  computeSafeDelayAddress,
  parseManagerCommitment,
  setSafeDelayBytecode,
  type Network as LibNetwork,
} from '../utils/SafeDelayManagerLibrary';
import SafeDelayArtifact from '../../artifacts/SafeDelay.artifact.json';
import SafeDelayMultiSigArtifact from '../../artifacts/SafeDelayMultiSig.artifact.json';
import { deploySafeDelay, addressToPubkeyHash } from '../utils/deployContract';
import { verifyContract } from '../contractVerification';
import type { SafeDelayManagerEntry } from '../types/index';
import QrScanner from './QrScanner';
import { debug } from '../utils/debug';
import { useOnChainTxHistory, OnChainTx } from '../hooks/useOnChainTxHistory';
import { useAutoContractVerification } from '../hooks/useAutoContractVerification';
import { useStoredContracts } from '../hooks/useSafeDelayContracts';
import { showToast } from './Toast';

function getExplorerAddressUrl(n: 'mainnet' | 'testnet' | 'chipnet', addr: string): string {
  const clean = addr.replace(/^(bitcoincash:|bchtest:|bchreg:)/, '');
  if (n === 'mainnet') return `https://blockchair.com/bitcoin-cash/address/${clean}`;
  return `https://chipnet.blockchair.com/bitcoin-cash/address/${clean}`;
}

// Map our network strings to CashScript Network type
function toCashScriptNetwork(n: 'mainnet' | 'testnet' | 'chipnet'): Network {
  switch (n) {
    case 'mainnet': return Network.MAINNET;
    case 'testnet': return Network.TESTNET3;
    case 'chipnet': return Network.CHIPNET;
    default: return Network.TESTNET3;
  }
}

function toLibNetwork(n: 'mainnet' | 'testnet' | 'chipnet'): LibNetwork {
  return n as LibNetwork;
}

// ─── Styled Components ───────────────────────────────────────────────────────

const Container = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h2`font-size: 24px; margin-bottom: 8px;`;
const Description = styled.p`color: rgba(255, 255, 255, 0.6); margin-bottom: 24px;`;

const Section = styled.div`
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

const SectionTitle = styled.h3`font-size: 18px; margin-bottom: 12px; color: rgba(255, 255, 255, 0.9);`;

const FormRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  &:focus { outline: none; border-color: #4f46e5; }
  &::placeholder { color: rgba(255, 255, 255, 0.3); }
`;

const PrimaryBtn = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryBtn = styled.button`
  padding: 10px 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SuccessBtn = styled(PrimaryBtn)`
  background: linear-gradient(135deg, #059669, #10b981);
  &:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const MessageBox = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  background: ${({ $type }) =>
    $type === 'success' ? 'rgba(16, 185, 129, 0.2)' :
    $type === 'error' ? 'rgba(239, 68, 68, 0.2)' :
    'rgba(79, 70, 229, 0.2)'};
  color: ${({ $type }) =>
    $type === 'success' ? '#10b981' :
    $type === 'error' ? '#ef4444' : '#a5b4fc'};
  white-space: pre-wrap;
`;

const ScanMessageBox = styled(MessageBox)`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Spinner = styled.span`
  display: inline-block;
  font-size: 16px;
  animation: ${spin} 1s linear infinite;
  flex-shrink: 0;
`;

const Grid3 = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
  align-items: center;
`;

const AutoRefreshToggle = styled.button<{ $active: boolean; $loading: boolean }>`
  background: ${({ $active }) => $active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'};
  border: 1px solid ${({ $active }) => $active ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255,255,255,0.1)'};
  border-radius: 8px;
  padding: 8px 14px;
  color: ${({ $active }) => $active ? '#10b981' : 'rgba(255,255,255,0.6)'};
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  animation: ${({ $loading }) => $loading ? pulse : 'none'} 1.5s ease-in-out infinite;
  &:hover { background: ${({ $active }) => $active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}; }
`;

const DeploymentStatusBanner = styled.div`
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
`;

const BannerTitle = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: #ef4444;
  margin-bottom: 8px;
`;

const BannerBody = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
`;

const StatCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
`;

const StatValue = styled.div`font-size: 28px; font-weight: 700; color: #4f46e5;`;
const StatLabel = styled.div`font-size: 13px; color: rgba(255, 255, 255, 0.6); margin-top: 4px;`;

const WalletList = styled.div`display: flex; flex-direction: column; gap: 12px;`;

const WalletCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const WalletInfo = styled.div`flex: 1; min-width: 200px;`;
const WalletAddress = styled.div`font-family: monospace; font-size: 13px; word-break: break-all; color: rgba(255,255,255,0.8);`;
const WalletMeta = styled.div`font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px;`;
const WalletBalance = styled.div`font-size: 20px; font-weight: 700; color: #10b981;`;

const WalletStatus = styled.span<{ $locked: boolean }>`
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $locked }) => $locked ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};
  color: ${({ $locked }) => $locked ? '#ef4444' : '#10b981'};
`;

const CopyBtn = styled.button`
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  background: rgba(79,70,229,0.2);
  color: #a5b4fc;
  cursor: pointer;
  &:hover { background: rgba(79,70,229,0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const RefreshBtn = styled(CopyBtn)`
  background: rgba(16,185,129,0.15);
  color: #10b981;
  &:hover:not(:disabled) { background: rgba(16,185,129,0.3); }
`;

const WithdrawBtn = styled(CopyBtn)`
  background: rgba(16,185,129,0.25);
  color: #10b981;
  font-weight: 600;
  &:hover:not(:disabled) { background: rgba(16,185,129,0.45); }
`;

const CancelBtn = styled(CopyBtn)`
  background: rgba(245,158,11,0.2);
  color: #fbbf24;
  font-weight: 600;
  &:hover:not(:disabled) { background: rgba(245,158,11,0.4); }
`;

const ExternalLinkBtn = styled.a`
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  background: rgba(99,102,241,0.2);
  color: #a5b4fc;
  cursor: pointer;
  text-decoration: none;
  &:hover { background: rgba(99,102,241,0.4); }
`;

const ConfirmOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

const ConfirmBox = styled.div`
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 32px;
  max-width: 480px;
  width: 90%;
`;

const ConfirmTitle = styled.h3`
  font-size: 20px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.95);
`;

const ConfirmDesc = styled.p`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
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
  &:hover { background: rgba(255, 255, 255, 0.05); }
`;

const ModalConfirmBtn = styled.button`
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: white;
  transition: all 0.2s;
  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const AddressBox = styled.div`
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(79,70,229,0.4);
  border-radius: 8px;
  padding: 12px 16px;
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const OnboardingCard = styled.div`
  background: linear-gradient(135deg, rgba(79,70,229,0.15), rgba(139,92,246,0.1));
  border: 1px solid rgba(79,70,229,0.3);
  border-radius: 16px;
  padding: 28px 32px;
  margin-top: 16px;
`;

const OnboardingTitle = styled.h3`
  font-size: 20px;
  font-weight: 700;
  color: #c7d2fe;
  margin-bottom: 6px;
`;

const OnboardingSubtitle = styled.p`
  font-size: 14px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 24px;
  line-height: 1.5;
`;

const OnboardingSteps = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const OnboardingStepRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
`;

const StepNumber = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  margin-bottom: 3px;
`;

const StepDesc = styled.div`
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  line-height: 1.4;
`;

const StepCommand = styled.code`
  font-family: monospace;
  font-size: 12px;
  background: rgba(0,0,0,0.3);
  padding: 2px 6px;
  border-radius: 4px;
  color: #a5b4fc;
`;

const OnboardingActions = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
`;

const OnboardingLink = styled.a`
  font-size: 13px;
  color: #a5b4fc;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
  &:hover { text-decoration: underline; }
`;

const ConfigWarningBox = styled.div`
  background: rgba(234,179,8,0.1);
  border: 1px solid rgba(234,179,8,0.3);
  border-radius: 10px;
  padding: 14px 18px;
  margin-top: 16px;
  font-size: 13px;
  color: #fbbf24;
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const DashboardTabToggle = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 4px;
`;

const TabBtn = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $active }) => $active ? 'rgba(79, 70, 229, 0.35)' : 'transparent'};
  color: ${({ $active }) => $active ? '#c7d2fe' : 'rgba(255, 255, 255, 0.5)'};
  &:hover { background: ${({ $active }) => $active ? 'rgba(79, 70, 229, 0.45)' : 'rgba(255, 255, 255, 0.08)'}; }
`;

const TxList = styled.div`display: flex; flex-direction: column; gap: 8px;`;

const TxCard = styled.div`
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const TxInfo = styled.div`flex: 1;`;

const TxType = styled.span<{ $type: OnChainTx['type'] }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${({ $type }) => {
    switch ($type) {
      case 'deposit': return 'rgba(16, 185, 129, 0.25)';
      case 'withdraw': return 'rgba(239, 68, 68, 0.25)';
      case 'cancel': return 'rgba(245, 158, 11, 0.25)';
      case 'receive': return 'rgba(59, 130, 246, 0.25)';
      case 'send': return 'rgba(156, 163, 175, 0.25)';
      default: return 'rgba(156, 163, 175, 0.15)';
    }
  }};
  color: ${({ $type }) => {
    switch ($type) {
      case 'deposit': return '#10b981';
      case 'withdraw': return '#ef4444';
      case 'cancel': return '#f59e0b';
      case 'receive': return '#3b82f6';
      case 'send': return '#9ca3af';
      default: return '#9ca3af';
    }
  }};
`;

const TxAmount = styled.span<{ $type: OnChainTx['type'] }>`
  font-size: 16px;
  font-weight: 700;
  color: ${({ $type }) =>
    $type === 'deposit' || $type === 'receive' ? '#10b981' :
    $type === 'withdraw' || $type === 'cancel' || $type === 'send' ? '#ef4444' :
    'rgba(255,255,255,0.7)'};
`;

const TxMeta = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
  display: flex;
  gap: 12px;
`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface EntryWithBalance extends SafeDelayManagerEntry {
  balance: number;
  currentBlock: number;
}

// Cast Electrum UTXO to include NFT fields
interface NftUtxo {
  satoshis: bigint;
  tokenCategory: string;
  nftCommitment?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SafeDelayManagerDashboard() {
  const { network } = useNetwork();
  const { wallet, hasSigner } = useWallet();

  // Config
  const [managerAddress, setManagerAddress] = useState('');
  const [managerAddressInput, setManagerAddressInput] = useState('');
  const [serviceProviderPkh, setServiceProviderPkh] = useState(''); // required for createDelay

  // Registry data
  const [allEntries, setAllEntries] = useState<SafeDelayManagerEntry[]>([]);
  const [myEntries, setMyEntries] = useState<EntryWithBalance[]>([]);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [refreshingEntries, setRefreshingEntries] = useState<Set<string>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    try { return localStorage.getItem('safedelay-auto-refresh') !== 'false'; } catch { return true; }
  });

  // Compute address form
  const [lockBlocks, setLockBlocks] = useState('144'); // ~1 day
  const [computedAddress, setComputedAddress] = useState<string | null>(null);
  const [computedLockEnd, setComputedLockEnd] = useState<number | null>(null);

  // Funded address for registration
  const [fundedAddress, setFundedAddress] = useState('');
  const [fundedLockEnd, setFundedLockEnd] = useState<number>(0);
  const [registerFee, setRegisterFee] = useState('1000');

  // Registration
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<React.ReactNode | null>(null);

  // Contract verification
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ verified: boolean; message: string } | null>(null);

  // UI
  const [copied, setCopied] = useState<string | null>(null);
  const [viewMode, setViewModeRaw] = useState<'mine' | 'all'>(() => {
    try { return (localStorage.getItem('safedelay-view-mode') as 'mine' | 'all') || 'mine'; }
    catch { return 'mine'; }
  });
  const setViewMode = (val: 'mine' | 'all') => {
    setViewModeRaw(val);
    try { localStorage.setItem('safedelay-view-mode', val); } catch {}
  };
  const [dashboardTab, setDashboardTab] = useState<'wallets' | 'transactions'>('wallets');
  // Lock status sub-filter: 'all' | 'locked' | 'unlocked'
  const [lockStatusFilter, setLockStatusFilterRaw] = useState<'all' | 'locked' | 'unlocked'>(() => {
    try { return (localStorage.getItem('safedelay-lock-status-filter') as 'all' | 'locked' | 'unlocked') || 'all'; }
    catch { return 'all'; }
  });
  const setLockStatusFilter = (val: 'all' | 'locked' | 'unlocked') => {
    setLockStatusFilterRaw(val);
    try { localStorage.setItem('safedelay-lock-status-filter', val); } catch {}
  };

  // Transaction history
  const [txHistory, setTxHistory] = useState<OnChainTx[]>([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryError, setTxHistoryError] = useState<string | null>(null);
  const [selectedEntryForTx, setSelectedEntryForTx] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(1);
  const TX_PER_PAGE = 50;

  // Contract verification (orphan + recoverable counts)
  const { contracts: storedContracts } = useStoredContracts();
  const { verificationResult: autoVerifyResult, isVerifying, verifyProgress } = useAutoContractVerification(
    storedContracts,
    wallet.address,
    wallet.pubkeyHash,
    network
  );

  // Lock expiry notifications
  const notifiedRef = useRef<Set<string>>(new Set());
  const [expiringEntries, setExpiringEntries] = useState<string[]>([]);

  // CSV export for transaction history
  const handleExportTxCSV = () => {
    const headers = ['Type', 'Block Height', 'Timestamp', 'Tx Hash', 'Amount (BCH)'];
    const rows = txHistory.map(tx => [
      tx.type,
      tx.blockHeight.toString(),
      new Date(tx.timestamp).toISOString(),
      tx.txHash,
      tx.amount > 0 ? tx.amount.toFixed(8) : '0',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `safedelay-tx-history-${selectedEntryForTx?.slice(0, 8) || 'wallet'}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // External SafeDelay tracking (e.g. from BadgerSurvivors prize claims)
  const [externalAddressInput, setExternalAddressInput] = useState('');
  const [externalOwnerPkh, setExternalOwnerPkh] = useState('');
  const [externalLockEnd, setExternalLockEnd] = useState<number>(0);
  const [externalError, setExternalError] = useState<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [externalResult, setExternalResult] = useState<{
    address: string;
    locked: boolean;
    remaining: number;
    days: number;
    balance: number;
    verified: boolean | null;
    computedAddress: string | null;
    unlockDate: string | null;
  } | null>(null);

  // ─── Track external SafeDelay address ────────────────────────────────────
  const handleTrackExternal = useCallback(async () => {
    setExternalError(null);
    setExternalResult(null);

    if (!externalAddressInput && !externalOwnerPkh) {
      setExternalError('Enter a SafeDelay address or owner PKH');
      addressInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      addressInputRef.current?.focus();
      return;
    }

    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const blockHeight = await provider.getBlockHeight();
      const bh = Number(blockHeight);

      let address = externalAddressInput.trim();
      let ownerPkh = externalOwnerPkh.trim();
      let lockEndBlock = externalLockEnd;
      let verified: boolean | null = null;
      let computedAddress: string | null = null;

      // Validate owner PKH format if provided
      if (ownerPkh && !/^[0-9a-f]{40}$/i.test(ownerPkh)) {
        setExternalError('Owner PKH must be 40 hex characters');
        return;
      }

      // Compute expected address from owner PKH + lock end block
      if (ownerPkh && lockEndBlock > 0) {
        computedAddress = computeSafeDelayAddress(ownerPkh, lockEndBlock, toLibNetwork(network));

        // If address was also provided, verify they match (confirms lock params are correct)
        if (address) {
          const normalizedProvided = address.replace(/^(bitcoincash:|bchtest:|bchreg:)/i, '');
          const normalizedComputed = computedAddress.replace(/^(bitcoincash:|bchtest:|bchreg:)/i, '');
          verified = normalizedProvided.toLowerCase() === normalizedComputed.toLowerCase();
          if (!verified) {
            setExternalError(
              `⚠️ Mismatch: The provided address doesn't match the address computed from ` +
              `owner PKH + lock end block. Either the lock end block is incorrect, ` +
              `or you're tracking a different SafeDelay.\n\n` +
              `Provided: ${address}\nComputed: ${computedAddress}`
            );
            return;
          }
        } else {
          // No address provided, use the computed one
          address = computedAddress;
        }
      }

      if (!address) {
        setExternalError('Enter a SafeDelay address or provide owner PKH + lock end block');
        return;
      }

      // Fetch UTXOs to get balance and current lock status
      const utxos = await provider.getUtxos(address);
      const balance = utxos.reduce((sum: number, u: any) => sum + Number(u.value), 0) / 1e8;

      // Determine effective lock end block
      // If we don't have it from form input, try from UTXO data
      let effectiveLockEnd = lockEndBlock;
      if (effectiveLockEnd === 0 && utxos.length > 0) {
        // We can't derive lockEndBlock from UTXO alone without the contract.
        // Ask user to provide it — don't set a result with unknown lock status.
        setExternalError(
          `Found ${utxos.length} UTXO(s) with ${balance.toFixed(4)} BCH. ` +
          `Provide the lock end block (from your prize claim) to check unlock status.`
        );
        return;
      }

      if (effectiveLockEnd === 0) {
        setExternalError('Could not determine lock end block. Provide it manually.');
        return;
      }

      const remaining = Math.max(0, effectiveLockEnd - bh);
      const days = Math.floor(remaining / 144);
      const locked = effectiveLockEnd > bh;
      const msPerBlock = 10 * 60 * 1000;
      const unlockMs = Date.now() + (remaining * msPerBlock);
      const unlockDate = new Date(unlockMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      setExternalResult({ address, locked, remaining, days, balance, verified, computedAddress, unlockDate: locked ? unlockDate : null });
    } catch (err) {
      setExternalError(err instanceof Error ? err.message : 'Failed to fetch SafeDelay status');
    }
  }, [externalAddressInput, externalOwnerPkh, externalLockEnd, network]);

  // ─── Initialize SafeDelay bytecode ─────────────────────────────────────────
  useEffect(() => {
    const bytecode = (SafeDelayArtifact as any).debug?.bytecode;
    if (bytecode) {
      setSafeDelayBytecode(bytecode);
    }
  }, []);

  // ─── Auto-populate manager address from config on network change ──────────
  useEffect(() => {
    const net = network as 'mainnet' | 'chipnet' | 'testnet';
    const configAddr = getManagerAddress(net);
    const configSpPkh = getServiceProviderPkh(net);
    if (configAddr) {
      setManagerAddressInput(configAddr);
      setManagerAddress(configAddr);
    } else {
      setManagerAddressInput('');
      setManagerAddress('');
    }
    if (configSpPkh) {
      setServiceProviderPkh(configSpPkh);
    }
  }, [network]);

  // ─── Load registry ─────────────────────────────────────────────────────────
  const loadRegistry = useCallback(async (address: string) => {
    if (!address) return;
    setLoadingEntries(true);
    setEntriesError(null);
    setLoadingStartTime(Date.now());
    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const bh = await provider.getBlockHeight();
      setCurrentBlock(Number(bh));

      const utxos = await provider.getUtxos(address) as unknown as NftUtxo[];
      const nftUtxos = utxos.filter(u =>
        u.tokenCategory &&
        u.tokenCategory !== '0x' &&
        u.tokenCategory !== '00'.repeat(32)
      );

      if (nftUtxos.length === 0) {
        setAllEntries([]);
        setEntriesError('No manager UTXOs found. Is the contract deployed at this address?');
        setLoadingEntries(false);
        return;
      }

      const entries: SafeDelayManagerEntry[] = [];
      for (const utxo of nftUtxos) {
        if (!utxo.nftCommitment) continue;
        const commitmentBytes = Uint8Array.from(
          Buffer.from(utxo.nftCommitment.replace(/^0x/, ''), 'hex')
        );
        const parsed = parseManagerCommitment(commitmentBytes);
        for (const entry of parsed) {
          entries.push({
            ownerPkh: entry.ownerPkh,
            lockEndBlock: entry.lockEndBlock,
            address: computeSafeDelayAddress(entry.ownerPkh, entry.lockEndBlock, toLibNetwork(network)),
          });
        }
      }
      setAllEntries(entries);
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : 'Failed to load registry');
      setAllEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [network]);

  // ─── Fetch balances for filtered entries ───────────────────────────────────
  const filteredWallets = useMemo(() => {
    if (allEntries.length === 0) return [];
    const walletPkh = wallet.pubkeyHash?.toLowerCase();
    return viewMode === 'mine' && walletPkh
      ? allEntries.filter(e => e.ownerPkh.toLowerCase() === walletPkh)
      : allEntries;
  }, [allEntries, wallet.pubkeyHash, viewMode]);

  // Apply lock-status sub-filter (locked/unlocked/all)
  const filteredByStatus = useMemo(() => {
    if (lockStatusFilter === 'all' || currentBlock === 0) return filteredWallets;
    return filteredWallets.filter(entry => {
      const locked = entry.lockEndBlock > currentBlock;
      return lockStatusFilter === 'locked' ? locked : !locked;
    });
  }, [filteredWallets, lockStatusFilter, currentBlock]);

  useEffect(() => {
    if (filteredByStatus.length === 0) { setMyEntries([]); return; }

    // Track cancellation at the effect level so cleanup always refers to the right flag
    let cancelled = false;

    async function fetchBalances(provider: InstanceType<typeof ElectrumNetworkProvider>) {
      const results: EntryWithBalance[] = [];
      for (const entry of filteredByStatus) {
        if (!entry.address || cancelled) continue;
        try {
          const utxos = await provider.getUtxos(entry.address);
          const balance = utxos.reduce((sum, u) => sum + Number(u.satoshis) / 1e8, 0);
          if (!cancelled) results.push({ ...entry, balance, currentBlock });
        } catch {
          if (!cancelled) results.push({ ...entry, balance: 0, currentBlock });
        }
      }
      if (!cancelled) {
        results.sort((a, b) => a.lockEndBlock - b.lockEndBlock);
        setMyEntries(results);
      }
    }

    const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
    fetchBalances(provider);
    return () => { cancelled = true; };
  }, [filteredByStatus, network, currentBlock]);

  // ─── Auto-refresh registry every 60s ──────────────────────────────────────
  const autoRefreshRef = useRef(false);
  useEffect(() => {
    if (!managerAddress || !autoRefreshEnabled) return;
    const interval = setInterval(async () => {
      // Skip if a load is already in progress — will retry next interval
      if (autoRefreshRef.current || loadingEntries) return;
      autoRefreshRef.current = true;
      try {
        await loadRegistry(managerAddress);
        setLastRefreshed(Date.now());
      } catch {
        // silent — non-blocking
      } finally {
        autoRefreshRef.current = false;
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [managerAddress, loadingEntries, loadRegistry, autoRefreshEnabled]);

  // ─── Network timeout sentinel ─────────────────────────────────────────────
  useEffect(() => {
    if (!managerAddress || !loadingStartTime) return;
    const timeout = setTimeout(() => {
      if (loadingEntries) {
        setEntriesError('Network timeout — check your connection and try again.');
        setLoadingEntries(false);
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, [managerAddress, loadingStartTime, loadingEntries]);

  // ─── Lock expiry notifications ────────────────────────────────────────────
  useEffect(() => {
    if (myEntries.length === 0 || currentBlock === 0) return;

    const nowExpiring: string[] = [];
    for (const entry of myEntries) {
      const remaining = entry.lockEndBlock - entry.currentBlock;
      // Notify when ~10 blocks remain (~100 min on mainnet, ~20 min on chipnet)
      const key = entry.address || entry.ownerPkh;
      if (remaining > 0 && remaining <= 10 && !notifiedRef.current.has(key)) {
        notifiedRef.current.add(key);
        showToast(
          `🔔 SafeDelay at ${entry.address?.slice(0, 16)}... unlocks in ~${remaining} block${remaining !== 1 ? 's' : ''}!`,
          'warning',
          8000
        );
      }
      // Collect entries that will expire within ~500 blocks for badge
      if (remaining > 0 && remaining <= 500) {
        nowExpiring.push(key);
      }
    }
    setExpiringEntries(nowExpiring);
  }, [myEntries, currentBlock]);

  // ─── Compute new SafeDelay address ─────────────────────────────────────────
  const handleComputeAddress = useCallback(async () => {
    if (!wallet.connected || !wallet.pubkeyHash) {
      setEntriesError('Connect your wallet first');
      return;
    }
    const blocks = parseInt(lockBlocks);
    if (isNaN(blocks) || blocks <= 0) {
      setEntriesError('Invalid lock duration');
      return;
    }

    // Fetch current block if we don't have it
    let bh = currentBlock;
    if (bh === 0) {
      try {
        const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
        bh = Number(await provider.getBlockHeight());
        setCurrentBlock(bh);
      } catch {
        setEntriesError('Could not fetch current block height');
        return;
      }
    }

    const lockEnd = bh + blocks;
    const addr = computeSafeDelayAddress(wallet.pubkeyHash, lockEnd, toLibNetwork(network));
    setComputedAddress(addr);
    setComputedLockEnd(lockEnd);
    setEntriesError(null);
    setRegisterSuccess(null);
  }, [wallet.pubkeyHash, wallet.connected, lockBlocks, network, currentBlock]);

  // ─── Deploy SafeDelay to computed address ─────────────────────────────────
  const handleDeploy = useCallback(async () => {
    if (!computedAddress || computedLockEnd === null) return;
    if (!wallet.connected || !wallet.pubkeyHash) {
      setRegisterError('Connect your wallet first');
      return;
    }

    setRegistering(true);
    setRegisterError(null);

    try {
      const ownerPkh = await addressToPubkeyHash(wallet.address!);
      const result = await deploySafeDelay({
        ownerPubkeyHash: ownerPkh,
        lockEndBlock: computedLockEnd - currentBlock, // relative blocks
        network: network as 'mainnet' | 'testnet' | 'chipnet',
      });

      setFundedAddress(result.contractAddress);
      setFundedLockEnd(result.actualLockEndBlock);
      setComputedAddress(null);
      setRegisterSuccess(
        `✅ SafeDelay deployed at:\n${result.contractAddress}\n\n` +
        `Lock end: block ${result.actualLockEndBlock} (~${Math.round((result.actualLockEndBlock - currentBlock) / 144)} days)\n\n` +
        `Now click "Register with Manager" to add it to the registry.`
      );
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setRegistering(false);
    }
  }, [computedAddress, computedLockEnd, wallet, currentBlock, network]);

  // ─── Register with SafeDelayManager ────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    if (!fundedAddress || !fundedLockEnd) {
      setRegisterError('Deploy a SafeDelay first');
      return;
    }
    if (!serviceProviderPkh || !/^[0-9a-f]{40}$/i.test(serviceProviderPkh)) {
      setRegisterError('Enter a valid 40-char hex service provider PKH');
      return;
    }
    if (!wallet.connected) {
      setRegisterError('Connect your wallet first');
      return;
    }

    setRegistering(true);
    setRegisterError(null);

    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));

      // Get manager NFT UTXOs
      const managerUtxos = await provider.getUtxos(managerAddress) as unknown as NftUtxo[];
      const nftUtxos = managerUtxos.filter(u =>
        u.tokenCategory && u.tokenCategory !== '0x' && u.tokenCategory !== '00'.repeat(32)
      );

      if (nftUtxos.length === 0) {
        throw new Error('No manager UTXOs found. Is the manager deployed?');
      }

      // Get wallet UTXOs for fee payment
      if (!wallet.address) throw new Error('No wallet address');
      const walletUtxos = await provider.getUtxos(wallet.address);
      if (walletUtxos.length === 0) throw new Error('Need BCH UTXOs for miner fees');

      // Build createDelay transaction using CashScript Contract
      const manager = new Contract(
        SafeDelayManagerArtifact as any,
        [serviceProviderPkh],
        { provider } as any
      );

      const feeSats = BigInt(parseInt(registerFee) || 1000);

      // Derive owner PKH from wallet address
      const ownerPkhHex = await addressToPubkeyHash(wallet.address);
      const ownerPkhBytes = Uint8Array.from(Buffer.from(ownerPkhHex, 'hex'));

      // Encode lock end block as 8 bytes big-endian for the contract
      const lockEndBuf = Buffer.alloc(8);
      lockEndBuf.writeBigUInt64BE(BigInt(fundedLockEnd), 0);

      // Build transaction: manager UTXO + wallet UTXO (for fee)
      const nftUtxo = nftUtxos[0];
      const feeUtxo = walletUtxos[0];

      const createDelayFn = (manager as any).functions.createDelay(
        ownerPkhBytes,
        Uint8Array.from(lockEndBuf),
        feeSats
      );

      const tx = await createDelayFn
        .from([nftUtxo as any, feeUtxo as any])
        .send();

      const txHash = typeof tx === 'string' ? tx : (tx.txid || tx.hash || '');
      const explorerUrl = getExplorerTxUrl(txHash);
      setFundedAddress('');
      setFundedLockEnd(0);
      setRegisterSuccess(
        <span>✅ Registered! Tx: <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{color:'rgba(255,255,255,0.9)',textDecoration:'underline'}}>{txHash.slice(0, 12)}...{txHash.slice(-8)}</a></span>
      );
      await loadRegistry(managerAddress);
    } catch (err) {
      debug.error('Registration error:', err);
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }, [fundedAddress, fundedLockEnd, serviceProviderPkh, registerFee, wallet, managerAddress, network, loadRegistry]);

  // ─── Refresh single entry balance + lock status ──────────────────────────
  const handleRefreshEntry = useCallback(async (address: string) => {
    setRefreshingEntries(prev => new Set(prev).add(address));
    try {
      const provider = new ElectrumNetworkProvider(toCashScriptNetwork(network));
      const bh = Number(await provider.getBlockHeight());
      setCurrentBlock(bh);
      const utxos = await provider.getUtxos(address);
      const balance = utxos.reduce((sum, u) => sum + Number(u.satoshis) / 1e8, 0);
      setMyEntries(prev => prev.map(e =>
        e.address === address ? { ...e, balance, currentBlock: bh } : e
      ));
    } catch {
      // silent — entry stays as-is
    } finally {
      setRefreshingEntries(prev => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
    }
  }, [network]);

  // ─── Withdraw from expired SafeDelay ───────────────────────────────────────
  const [withdrawConfirmAddr, setWithdrawConfirmAddr] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<Set<string>>(new Set());
  const [cancelConfirmAddr, setCancelConfirmAddr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  const handleWithdraw = useCallback(async (entry: EntryWithBalance) => {
    if (!wallet.connected || !wallet.pubkeyHash) {
      setWithdrawError('Connect your wallet first');
      return;
    }
    // Show in-modal confirmation instead of window.confirm
    setWithdrawConfirmAddr(entry.address!);
  }, [wallet.connected, wallet.pubkeyHash]);

  const confirmWithdraw = useCallback(async (entry: EntryWithBalance) => {
    setWithdrawConfirmAddr(null);
    setWithdrawError(null);
    setWithdrawSuccess(null);
    setWithdrawing(prev => new Set(prev).add(entry.address!));

    try {
      const { withdrawFromSafeDelay } = await import('../utils/deployContract');

      const txResult = await withdrawFromSafeDelay({
        ownerPubkeyHash: entry.ownerPkh,
        lockEndBlock: entry.lockEndBlock,
        withdrawAmount: BigInt(Math.floor(entry.balance * 1e8)),
        network,
      });

      setWithdrawSuccess(`Withdrawn ${entry.balance.toFixed(4)} BCH! Tx: ${txResult.txid.slice(0, 20)}...`);
      await handleRefreshEntry(entry.address!);
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setWithdrawing(prev => {
        const next = new Set(prev);
        next.delete(entry.address!);
        return next;
      });
    }
  }, [network, handleRefreshEntry]);

  // ─── Cancel SafeDelay (emergency full refund) ──────────────────────────────
  const handleCancel = useCallback(async (entry: EntryWithBalance) => {
    if (!wallet.connected || !wallet.pubkeyHash) {
      setCancelError('Connect your wallet first');
      return;
    }
    // Show in-modal confirmation instead of window.confirm
    setCancelConfirmAddr(entry.address!);
  }, [wallet.connected, wallet.pubkeyHash]);

  const confirmCancel = useCallback(async (entry: EntryWithBalance) => {
    setCancelConfirmAddr(null);
    setCancelError(null);
    setCancelSuccess(null);
    setCancelling(prev => new Set(prev).add(entry.address!));

    try {
      const { cancelSafeDelay } = await import('../utils/deployContract');

      const txResult = await cancelSafeDelay({
        ownerPubkeyHash: entry.ownerPkh,
        lockEndBlock: entry.lockEndBlock,
        network,
      });

      setCancelSuccess(`Cancelled! ${entry.balance.toFixed(4)} BCH reclaimed. Tx: ${txResult.txid.slice(0, 20)}...`);
      await handleRefreshEntry(entry.address!);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(prev => {
        const next = new Set(prev);
        next.delete(entry.address!);
        return next;
      });
    }
  }, [network, handleRefreshEntry]);

  // ─── Copy helper ───────────────────────────────────────────────────────────
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text.replace(/^(bitcoincash:|bchtest:|bchreg:)/, ''));
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─── Transaction History ──────────────────────────────────────────────────
  const { fetchHistory } = useOnChainTxHistory();

  const handleFetchTxHistory = useCallback(async (address: string) => {
    setSelectedEntryForTx(address);
    setTxPage(1);
    setTxHistoryLoading(true);
    setTxHistoryError(null);
    setTxHistory([]);
    try {
      const txs = await fetchHistory(address, network as 'mainnet' | 'testnet' | 'chipnet');
      setTxHistory(txs);
    } catch (err) {
      setTxHistoryError(err instanceof Error ? err.message : 'Failed to load transaction history');
    } finally {
      setTxHistoryLoading(false);
    }
  }, [network, fetchHistory]);

  const getExplorerTxUrl = (txHash: string) => {
    const clean = txHash.replace(/^0x/, '');
    const n = network as 'mainnet' | 'testnet' | 'chipnet';
    return n === 'mainnet'
      ? `https://blockchair.com/bitcoin-cash/transaction/${clean}`
      : `https://chipnet.blockchair.com/bitcoin-cash/transaction/${clean}`;
  };

  return (
    <Container>
      <Title>SafeDelay Manager</Title>
      <Description>
        Browse and manage SafeDelay wallets in the on-chain registry.
      </Description>

      {/* ── Manager Config ── */}
      <SectionTitle>Registry Configuration</SectionTitle>
      <FormRow>
        <FormGroup style={{ flex: 1 }}>
          <Label>Manager Address (P2SH32)</Label>
          <Input
            placeholder="bchtest:pz... or bitcoincash:q..."
            value={managerAddressInput}
            onChange={e => setManagerAddressInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setManagerAddress(managerAddressInput.trim())}
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
        </FormGroup>
        <FormGroup style={{ minWidth: '200px' }}>
          <Label>
            Service Provider Key &nbsp;
            <span title="Your wallet's public key hash — the service provider who receives registration fees" style={{ cursor: 'help', opacity: 0.7 }}>ⓘ</span>
          </Label>
          <Input
            placeholder="0a1b2c3d4e..."
            value={serviceProviderPkh}
            onChange={e => setServiceProviderPkh(e.target.value.toLowerCase())}
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
        </FormGroup>
        <SecondaryBtn onClick={() => setManagerAddress(managerAddressInput.trim())} disabled={!managerAddressInput.trim()}>
          Load Registry
        </SecondaryBtn>
        <SecondaryBtn
          onClick={async () => {
            if (!managerAddressInput.trim()) return;
            setVerifying(true);
            setVerificationResult(null);
            try {
              const result = await verifyContract(
                managerAddressInput.trim(),
                SafeDelayManagerArtifact as any,
                'https://electrumx.lifestone.cash'
              );
              setVerificationResult(result);
            } catch (err) {
              setVerificationResult({ verified: false, message: err instanceof Error ? err.message : 'Verification failed' });
            } finally {
              setVerifying(false);
            }
          }}
          disabled={!managerAddressInput.trim() || verifying}
          style={{ color: verifying ? undefined : (verificationResult?.verified ? '#10b981' : verificationResult && !verificationResult.verified ? '#ef4444' : undefined) }}
        >
          {verifying ? '⏳ Verifying...' : verificationResult ? (verificationResult.verified ? '✅ Verified' : '❌ Failed') : '🔍 Verify'}
        </SecondaryBtn>
      </FormRow>
      {verificationResult && (
        <MessageBox $type={verificationResult.verified ? 'success' : 'error'} style={{ marginTop: '8px', fontSize: '13px' }}>
          {verificationResult.verified
            ? '✅ Contract bytecode verified — on-chain code matches artifact'
            : `❌ ${verificationResult.message}`}
        </MessageBox>
      )}

      {/* ── Deployment Status Banner ── */}
      {!isManagerDeployed(network as 'mainnet' | 'chipnet' | 'testnet') && (
        <DeploymentStatusBanner>
          <BannerTitle>⚠️ SafeDelayManager Not Deployed on {network === 'chipnet' ? 'Chipnet' : network === 'testnet' ? 'Testnet' : 'Mainnet'}</BannerTitle>
          <BannerBody>
            The SafeDelayManager registry contract is not deployed on this network.
            Fill in the Manager Address above to connect to an existing deployment, or deploy your own:
            <br /><br />
            <strong>SafeDelay bytecode:</strong> <code>{(SafeDelayArtifact as any).debug?.bytecode?.slice(0, 16) || 'f68fd15f33a19b50f'}... ({(SafeDelayArtifact as any).debug?.bytecode?.length || 185} bytes)</code>
            <br />
            <strong>SafeDelayMultiSig bytecode:</strong> <code>{(SafeDelayMultiSigArtifact as any).debug?.bytecode?.slice(0, 16) || 'a13fb855218f3fc0'}... ({(SafeDelayMultiSigArtifact as any).debug?.bytecode?.length || 286} bytes)</code>
            <br /><br />
            See{' '}
            <a
              href="https://github.com/LifestoneLabs/SafeDelay/blob/main/DEPLOY.md"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa', textDecoration: 'underline' }}
            >
              DEPLOY.md
            </a>
            {' '}for deployment instructions.
          </BannerBody>
        </DeploymentStatusBanner>
      )}

      {/* ── New User Onboarding ── */}
      {!managerAddress && !isManagerDeployed(network as 'mainnet' | 'chipnet' | 'testnet') && (
        <OnboardingCard>
          <OnboardingTitle>🛡️ Welcome to SafeDelayManager</OnboardingTitle>
          <OnboardingSubtitle>
            A registry of time-locked wallets. Each registered SafeDelay pays a small fee to the
            service provider — you control the keys, we track the registry on-chain.
          </OnboardingSubtitle>

          <OnboardingSteps>
            <OnboardingStepRow>
              <StepNumber>1</StepNumber>
              <StepContent>
                <StepTitle>Get your Service Provider PKH</StepTitle>
                <StepDesc>
                  Open Paytaca wallet → Settings → Security → Export Private Key. Copy the 40-hex public key hash.
                </StepDesc>
              </StepContent>
            </OnboardingStepRow>

            <OnboardingStepRow>
              <StepNumber>2</StepNumber>
              <StepContent>
                <StepTitle>Deploy the registry contract</StepTitle>
                <StepDesc>
                  Run this command in the SafeDelay repo:
                  <br />
                  <StepCommand>node scripts/deploy-manager.mjs --sp-pkh &lt;your_pkh&gt; --network {network === 'testnet' ? 'chipnet' : network}</StepCommand>
                </StepDesc>
              </StepContent>
            </OnboardingStepRow>

            <OnboardingStepRow>
              <StepNumber>3</StepNumber>
              <StepContent>
                <StepTitle>Update config &amp; reload</StepTitle>
                <StepDesc>
                  Copy the deployed manager address and SP PKH into{' '}
                  <code style={{ fontFamily: 'monospace', fontSize: '12px', color: '#a5b4fc' }}>src/config/contracts.ts</code>,
                  then paste the manager address above and click Load Registry.
                </StepDesc>
              </StepContent>
            </OnboardingStepRow>

            <OnboardingStepRow>
              <StepNumber>4</StepNumber>
              <StepContent>
                <StepTitle>Create your first SafeDelay wallet</StepTitle>
                <StepDesc>
                  Once the manager is loaded, use the <strong>Create SafeDelay</strong> tab.
                  Fill in the form and click Deploy. Example call:
                  <StepCommand>manager.createDelay(ownerPkh, lockEndBlock, feeSats)</StepCommand>
                  <div style={{ marginTop: '6px' }}>
                    <CopyBtn onClick={() => handleCopy('manager.createDelay(ownerPkh, lockEndBlock, feeSats)')}>
                      📋 Copy example
                    </CopyBtn>
                  </div>
                </StepDesc>
              </StepContent>
            </OnboardingStepRow>
          </OnboardingSteps>

          <OnboardingActions>
            <PrimaryBtn
              onClick={() => window.open('https://github.com/LifestoneLabs/SafeDelay/blob/main/DEPLOY.md', '_blank')}
            >
              📖 Deployment Guide
            </PrimaryBtn>
            <OnboardingLink
              href="https://github.com/LifestoneLabs/SafeDelay"
              target="_blank"
              rel="noopener noreferrer"
            >
              🔗 View on GitHub →
            </OnboardingLink>
          </OnboardingActions>

          {getServiceProviderPkh(network as 'mainnet' | 'chipnet' | 'testnet') === '' && (
            <ConfigWarningBox>
              ⚠️ <strong>Config not ready:</strong> <code style={{ fontFamily: 'monospace', fontSize: '12px' }}>contracts.ts</code> has
              empty addresses for <strong>{network}</strong>. Deploy the manager first, then update the config.
            </ConfigWarningBox>
          )}
        </OnboardingCard>
      )}

      {!managerAddress && isManagerDeployed(network as 'mainnet' | 'chipnet' | 'testnet') && (
        <MessageBox $type="info">
          <strong>Manager deployed but not loaded.</strong> Paste the SafeDelayManager address above
          and click <em>Load Registry</em> to browse the wallet registry.
          The service provider PKH is required to register new entries.
        </MessageBox>
      )}

      {/* ── Registry Stats ── */}
      {allEntries.length > 0 && (
        <Grid3>
          <StatCard><StatValue>{allEntries.length}</StatValue><StatLabel>Total Wallets</StatLabel></StatCard>
          <StatCard>
            <StatValue>
              {allEntries.filter(e =>
                wallet.pubkeyHash && e.ownerPkh.toLowerCase() === wallet.pubkeyHash.toLowerCase()
              ).length}
            </StatValue>
            <StatLabel>My Wallets</StatLabel>
          </StatCard>
          <StatCard><StatValue>{currentBlock > 0 ? currentBlock.toLocaleString() : '—'}</StatValue><StatLabel>Current Block</StatLabel></StatCard>
          {lastRefreshed && (
            <StatCard><StatValue style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>↻ {new Date(lastRefreshed).toLocaleTimeString()}</StatValue><StatLabel>Last Refresh</StatLabel></StatCard>
          )}
          <AutoRefreshToggle
            $active={autoRefreshEnabled}
            $loading={loadingEntries}
            onClick={() => {
              const next = !autoRefreshEnabled;
              setAutoRefreshEnabled(next);
              try { localStorage.setItem('safedelay-auto-refresh', String(next)); } catch {}
            }}
            title={autoRefreshEnabled ? 'Auto-refresh ON — click to disable' : 'Auto-refresh OFF — click to enable'}
          >
            <Spinner style={{ fontSize: '12px' }}>↻</Spinner>
            {autoRefreshEnabled ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </AutoRefreshToggle>
        </Grid3>
      )}

      {/* ── Contract Verification Summary ── */}
      {wallet.connected && ((autoVerifyResult?.orphaned?.length ?? 0) > 0 || (autoVerifyResult?.recoverable?.length ?? 0) > 0) && (
        <div style={{ marginBottom: '16px' }}>
          {(autoVerifyResult?.orphaned?.length ?? 0) > 0 && (
            <MessageBox $type="error" style={{ marginBottom: '8px' }}>
              ⚠️ <strong>{autoVerifyResult!.orphaned.length}</strong> stored contract{autoVerifyResult!.orphaned.length !== 1 ? 's' : ''} not found on-chain — may be invalid or from a different network.
            </MessageBox>
          )}
          {(autoVerifyResult?.recoverable?.length ?? 0) > 0 && (
            <MessageBox $type="success" style={{ marginBottom: '8px' }}>
              🎉 Found <strong>{autoVerifyResult!.recoverable.length}</strong> on-chain SafeDelay contract{autoVerifyResult!.recoverable.length !== 1 ? 's' : ''} not in local storage — recoverable in the Dashboard tab.
            </MessageBox>
          )}
          {isVerifying && (
            <MessageBox $type="info">
              🔍 Verifying contracts… {verifyProgress}
            </MessageBox>
          )}
        </div>
      )}

      {/* ── Dashboard Tabs (Wallets | Transactions) ── */}
      {allEntries.length > 0 && (
        <DashboardTabToggle>
          <TabBtn $active={dashboardTab === 'wallets'} onClick={() => setDashboardTab('wallets')}>
            📋 Wallets ({myEntries.length})
          </TabBtn>
          <TabBtn $active={dashboardTab === 'transactions'} onClick={() => setDashboardTab('transactions')}>
            📜 Transactions
          </TabBtn>
        </DashboardTabToggle>
      )}

      {/* ── Wallets Tab ── */}
      {dashboardTab === 'wallets' && (
        <>
          {/* ── View Toggle ── */}
          {allEntries.length > 0 && (
            <ViewToggle>
              <SecondaryBtn
                onClick={() => setViewMode('mine')}
                style={{ background: viewMode === 'mine' ? 'rgba(79,70,229,0.2)' : undefined, borderColor: viewMode === 'mine' ? '#4f46e5' : undefined, color: viewMode === 'mine' ? '#a5b4fc' : undefined }}
              >My Wallets</SecondaryBtn>
              <SecondaryBtn
                onClick={() => setViewMode('all')}
                style={{ background: viewMode === 'all' ? 'rgba(79,70,229,0.2)' : undefined, borderColor: viewMode === 'all' ? '#4f46e5' : undefined, color: viewMode === 'all' ? '#a5b4fc' : undefined }}
              >All Wallets</SecondaryBtn>
            </ViewToggle>
          )}

          {loadingEntries && <ScanMessageBox $type="info"><Spinner>🌀</Spinner>Scanning blockchain for registry entries...</ScanMessageBox>}
          {entriesError && !managerAddress && <MessageBox $type="error">{entriesError}</MessageBox>}

          {/* ── Lock Status Filter ── */}
          {allEntries.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {(['all', 'locked', 'unlocked'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setLockStatusFilter(s)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: lockStatusFilter === s ? '#4f46e5' : 'rgba(255,255,255,0.15)',
                    background: lockStatusFilter === s ? 'rgba(79,70,229,0.2)' : 'transparent',
                    color: lockStatusFilter === s ? '#a5b4fc' : 'rgba(255,255,255,0.5)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {s === 'all' ? 'All' : s === 'locked' ? '🔒 Locked' : '✅ Unlocked'}
                  {' '}
                  <span style={{ opacity: 0.7 }}>
                    ({s === 'all' ? filteredWallets.length
                      : s === 'locked' ? filteredWallets.filter(e => e.lockEndBlock > currentBlock).length
                      : filteredWallets.filter(e => e.lockEndBlock <= currentBlock).length})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ── Track External SafeDelay (e.g. from BadgerSurvivors prizes) ── */}
          {wallet.connected && (
            <Section>
              <SectionTitle>Track External SafeDelay</SectionTitle>
              <Description style={{ fontSize: '14px', marginBottom: '12px' }}>
                Track a SafeDelay created outside this dashboard — e.g. tournament prize deposits
                from BadgerSurvivors. Enter the address from your prize claim to view its status.
              </Description>

              <FormRow>
                <FormGroup style={{ flex: 1 }}>
                  <Label>SafeDelay Address (P2SH32)</Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      ref={addressInputRef}
                      placeholder="bchtest:pz... or bitcoincash:q..."
                      value={externalAddressInput}
                      onChange={e => setExternalAddressInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleTrackExternal()}
                      style={{ fontFamily: 'monospace', fontSize: '13px', paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                    />
                    {externalAddressInput && (
                      <button
                        onClick={() => handleCopy(externalAddressInput)}
                        title="Copy address"
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copied === externalAddressInput ? '#10b981' : 'rgba(255,255,255,0.4)',
                          fontSize: '14px',
                          padding: '4px',
                          transition: 'color 0.2s',
                        }}
                      >
                        {copied === externalAddressInput ? '✓' : '📋'}
                      </button>
                    )}
                  </div>
                </FormGroup>
                <QrScanner onScan={setExternalAddressInput} addressMode />
                <FormGroup style={{ minWidth: '160px' }}>
                  <Label>Owner PKH (40 hex)</Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      placeholder="a1b2c3d4e5..."
                      value={externalOwnerPkh}
                      onChange={e => setExternalOwnerPkh(e.target.value.toLowerCase())}
                      style={{ fontFamily: 'monospace', fontSize: '13px', paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                    />
                    {externalOwnerPkh && (
                      <button
                        onClick={() => handleCopy(externalOwnerPkh)}
                        title="Copy owner PKH"
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copied === externalOwnerPkh ? '#10b981' : 'rgba(255,255,255,0.4)',
                          fontSize: '14px',
                          padding: '4px',
                          transition: 'color 0.2s',
                        }}
                      >
                        {copied === externalOwnerPkh ? '✓' : '📋'}
                      </button>
                    )}
                  </div>
                </FormGroup>
                <FormGroup style={{ minWidth: '160px' }}>
                  <Label>Lock End Block</Label>
                  <Input
                    type="number"
                    placeholder="850000"
                    value={externalLockEnd || ''}
                    onChange={e => setExternalLockEnd(parseInt(e.target.value) || 0)}
                  />
                </FormGroup>
                <SecondaryBtn onClick={handleTrackExternal} disabled={!externalAddressInput && !externalOwnerPkh}>
                  Track
                </SecondaryBtn>
              </FormRow>

              {externalError && <MessageBox $type="error" style={{ marginTop: '8px' }}>{externalError}</MessageBox>}

              {externalResult && (
                <AddressBox style={{ marginTop: '12px', borderColor: 'rgba(16,185,129,0.4)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span>
                      <strong>SafeDelay Address:</strong><br />
                      {externalResult.address}
                    </span>
                    <button
                      onClick={() => { setExternalResult(null); setExternalAddressInput(''); setExternalOwnerPkh(''); setExternalLockEnd(0); }}
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px', padding: '2px 6px', flexShrink: 0 }}
                      title="Clear tracked result"
                    >
                      ✕ Clear
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <CopyBtn onClick={() => handleCopy(externalResult.address)}>
                      {copied === externalResult.address ? '✓' : '📋 Copy'}
                    </CopyBtn>
                    <ExternalLinkBtn href={getExplorerAddressUrl(network as 'mainnet' | 'testnet' | 'chipnet', externalResult.address)} target="_blank" rel="noopener noreferrer">
                      🔗 View
                    </ExternalLinkBtn>
                  </div>
                </AddressBox>
              )}
              {externalResult && externalResult.verified === true && (
                <MessageBox $type="success" style={{ marginTop: '8px', fontSize: '13px' }}>
                  ✅ <strong>On-chain verified</strong> — lock parameters match the contract address
                  {externalResult.computedAddress && externalResult.computedAddress !== externalResult.address && (
                    <span style={{ display: 'block', marginTop: '2px', opacity: 0.8 }}>
                      (computed from owner PKH + lock end block)
                    </span>
                  )}
                </MessageBox>
              )}
              {externalResult && (
                <WalletMeta style={{ marginTop: '8px' }}>
                  {externalResult.locked
                    ? `🔒 Locked — ${externalResult.remaining.toLocaleString()} blocks remaining (~${externalResult.days} days${externalResult.unlockDate ? ` · est. ${externalResult.unlockDate}` : ''})`
                    : '✅ Fully unlocked — ready to withdraw'}
                  {externalResult.balance > 0 ? (
                    <span style={{ color: '#10b981', display: 'block', marginTop: '4px', fontWeight: 700 }}>
                      {externalResult.balance.toFixed(4)} BCH
                    </span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.3)', display: 'block', marginTop: '4px' }}>
                      0.0000 BCH
                    </span>
                  )}
                </WalletMeta>
              )}
            </Section>
          )}

          {/* ── Registered Wallets ── */}
          {myEntries.length > 0 && (
            <Section>
              <SectionTitle>
                {viewMode === 'mine' ? 'My SafeDelay Wallets' : `Registry Entries`} ({myEntries.length})
                {expiringEntries.length > 0 && (
                  <span style={{ marginLeft: '10px', fontSize: '13px', color: '#f59e0b', fontWeight: 600 }}>
                    ⚡ {expiringEntries.length} unlocking soon
                  </span>
                )}
              </SectionTitle>
              <WalletList>
                {myEntries.map((entry, i) => {
                  const locked = entry.lockEndBlock > entry.currentBlock;
                  const remaining = entry.lockEndBlock - entry.currentBlock;
                  // Estimate unlock date based on ~10 min per block
                  const msPerBlock = 10 * 60 * 1000;
                  const estimatedUnlockDate = new Date(Date.now() + remaining * msPerBlock);
                  const dateStr = estimatedUnlockDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <WalletCard key={entry.address || i}>
                      <WalletInfo>
                        <WalletAddress>{entry.address || '—'}</WalletAddress>
                        <WalletMeta>
                          Lock end: block {entry.lockEndBlock.toLocaleString()} •{' '}
                          {locked
                            ? `🔒 ~${dateStr} (${remaining.toLocaleString()} blocks)`
                            : '✅ Unlocked'}
                        </WalletMeta>
                        {viewMode === 'all' && (
                          <WalletMeta style={{ color: '#a5b4fc', marginTop: '2px' }}>
                            Owner: {entry.ownerPkh.slice(0, 10)}...{entry.ownerPkh.slice(-8)}
                          </WalletMeta>
                        )}
                      </WalletInfo>
                      <WalletBalance>{entry.balance.toFixed(4)} BCH</WalletBalance>
                      <WalletStatus $locked={locked}>{locked ? '🔒 Locked' : '✅ Unlocked'}</WalletStatus>
                      {entry.address && (
                        <>
                          <CopyBtn onClick={() => handleCopy(entry.address!)}>
                            {copied === entry.address ? '✓ Copied' : '📋 Copy'}
                          </CopyBtn>
                          <RefreshBtn
                            onClick={() => entry.address && handleRefreshEntry(entry.address)}
                            disabled={refreshingEntries.has(entry.address)}
                            title="Refresh balance & lock status"
                          >
                            {refreshingEntries.has(entry.address) ? '⏳' : '🔄'} Refresh
                          </RefreshBtn>
                          {!locked && entry.balance > 0 && (
                            <WithdrawBtn
                              onClick={() => entry.address && handleWithdraw(entry)}
                              disabled={withdrawing.has(entry.address)}
                              title="Withdraw unlocked funds"
                            >
                              {withdrawing.has(entry.address) ? '⏳' : '💰'} Withdraw
                            </WithdrawBtn>
                          )}
                          <CancelBtn
                            onClick={() => entry.address && handleCancel(entry)}
                            disabled={cancelling.has(entry.address)}
                            title="Emergency cancel — reclaim all funds at any time"
                          >
                            {cancelling.has(entry.address) ? '⏳' : '🛑'} Cancel
                          </CancelBtn>
                        </>
                      )}
                    </WalletCard>
                  );
                })}
              </WalletList>
              {withdrawError && <MessageBox $type="error" style={{ marginTop: '8px' }}>{withdrawError}</MessageBox>}
              {withdrawSuccess && <MessageBox $type="success" style={{ marginTop: '8px' }}>{withdrawSuccess}</MessageBox>}
              {cancelError && <MessageBox $type="error" style={{ marginTop: '8px' }}>{cancelError}</MessageBox>}
              {cancelSuccess && <MessageBox $type="success" style={{ marginTop: '8px' }}>{cancelSuccess}</MessageBox>}
            </Section>
          )}

          {/* ── In-modal Confirm Dialog (shown instead of window.confirm) ── */}
          {(withdrawConfirmAddr || cancelConfirmAddr) && (() => {
            // Use myEntries to get balance data (EntryWithBalance extends SafeDelayManagerEntry with balance)
            const entry = myEntries.find(e => e.address === withdrawConfirmAddr || e.address === cancelConfirmAddr);
            if (!entry) return null;
            const isWithdraw = !!withdrawConfirmAddr;
            return (
              <ConfirmOverlay onClick={() => isWithdraw ? setWithdrawConfirmAddr(null) : setCancelConfirmAddr(null)}>
                <ConfirmBox>
                  <ConfirmTitle>{isWithdraw ? '💸 Confirm Withdraw' : '⚠️ Confirm Emergency Cancel'}</ConfirmTitle>
                  <ConfirmDesc style={{ whiteSpace: 'pre-line', fontSize: '14px', color: 'rgba(255,255,255,0.75)', marginBottom: '20px' }}>
                    {isWithdraw
                      ? `Withdraw ${entry.balance.toFixed(4)} BCH from SafeDelay?\n\nContract: ${entry.address}\nOwner PKH: ${entry.ownerPkh}\nLock ended at block: ${entry.lockEndBlock.toLocaleString()}\n\nThis action cannot be undone.`
                      : `⚠️ EMERGENCY CANCEL — This will reclaim ALL ${entry.balance.toFixed(4)} BCH from this SafeDelay.\n\nThis action CANNOT be undone. The SafeDelay contract will be closed permanently.\n\nContract: ${entry.address}\nOwner PKH: ${entry.ownerPkh}\nLock end: block ${entry.lockEndBlock.toLocaleString()}`
                    }
                  </ConfirmDesc>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <ModalCancelBtn onClick={() => isWithdraw ? setWithdrawConfirmAddr(null) : setCancelConfirmAddr(null)}>
                      Cancel
                    </ModalCancelBtn>
                    <ModalConfirmBtn
                      style={{ background: isWithdraw ? '#10b981' : '#ef4444' }}
                      onClick={() => isWithdraw ? confirmWithdraw(entry) : confirmCancel(entry)}
                    >
                      {isWithdraw ? '💸 Withdraw' : '🛑 Cancel Contract'}
                    </ModalConfirmBtn>
                  </div>
                </ConfirmBox>
              </ConfirmOverlay>
            );
          })()}

          {allEntries.length > 0 && myEntries.length === 0 && viewMode === 'mine' && !loadingEntries && (
            <EmptyState>No SafeDelay wallets found for your wallet in this registry.</EmptyState>
          )}
        </>
      )}

      {/* ── Transactions Tab ── */}
      {dashboardTab === 'transactions' && (
        <Section>
          <SectionTitle>Transaction History</SectionTitle>
          <Description style={{ fontSize: '14px', marginBottom: '16px' }}>
            View on-chain transaction history for any registered SafeDelay wallet.
            Select a wallet below to load its transaction history.
          </Description>

          {/* Wallet Selector */}
          {myEntries.length > 0 && (
            <FormGroup style={{ marginBottom: '16px' }}>
              <Label>Select Wallet</Label>
              <FormRow>
                <select
                  value={selectedEntryForTx || ''}
                  onChange={e => {
                    const addr = e.target.value;
                    if (addr) handleFetchTxHistory(addr);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                  }}
                >
                  <option value="">— Choose a wallet —</option>
                  {myEntries.map(e => (
                    <option key={e.address} value={e.address!}>
                      {e.address?.slice(0, 20)}... ({e.balance.toFixed(4)} BCH)
                    </option>
                  ))}
                </select>
                <SecondaryBtn
                  onClick={() => selectedEntryForTx && handleFetchTxHistory(selectedEntryForTx)}
                  disabled={!selectedEntryForTx || txHistoryLoading}
                >
                  {txHistoryLoading ? '⏳ Loading...' : '🔄 Refresh'}
                </SecondaryBtn>
              </FormRow>
            </FormGroup>
          )}

          {txHistoryError && <MessageBox $type="error">{txHistoryError}</MessageBox>}

          {txHistoryLoading && (
            <ScanMessageBox $type="info"><Spinner>🌀</Spinner>Fetching transaction history from Electrum...</ScanMessageBox>
          )}

          {!txHistoryLoading && txHistory.length === 0 && selectedEntryForTx && (
            <EmptyState>No transactions found for this wallet.</EmptyState>
          )}

          {!txHistoryLoading && txHistory.length === 0 && !selectedEntryForTx && (
            <EmptyState>Select a wallet above to view its transaction history.</EmptyState>
          )}

          {txHistory.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                  {txHistory.length} transaction{txHistory.length !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={handleExportTxCSV}
                    style={{
                      padding: '4px 12px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    📥 Export CSV
                  </button>
                </div>
              </div>
              {txHistory.length > TX_PER_PAGE && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => setTxPage(p => Math.max(1, p - 1))}
                      disabled={txPage === 1}
                      style={{
                        padding: '4px 12px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: txPage === 1 ? 'not-allowed' : 'pointer',
                        opacity: txPage === 1 ? 0.4 : 1,
                      }}
                    >
                      ← Prev
                    </button>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                      {txPage} / {Math.ceil(txHistory.length / TX_PER_PAGE)}
                    </span>
                    <button
                      onClick={() => setTxPage(p => Math.min(Math.ceil(txHistory.length / TX_PER_PAGE), p + 1))}
                      disabled={txPage >= Math.ceil(txHistory.length / TX_PER_PAGE)}
                      style={{
                        padding: '4px 12px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: txPage >= Math.ceil(txHistory.length / TX_PER_PAGE) ? 'not-allowed' : 'pointer',
                        opacity: txPage >= Math.ceil(txHistory.length / TX_PER_PAGE) ? 0.4 : 1,
                      }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              <TxList>
                {txHistory.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE).map(tx => (
                  <TxCard key={tx.txHash}>
                    <TxInfo>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <TxType $type={tx.type}>{tx.type}</TxType>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                          #{tx.blockHeight.toLocaleString()}
                        </span>
                      </div>
                      <TxMeta>
                        <span>~{new Date(tx.timestamp).toLocaleString()}</span>
                        <span>
                          Tx: <a href={getExplorerTxUrl(tx.txHash)} target="_blank" rel="noopener noreferrer" style={{color:'rgba(255,255,255,0.6)',textDecoration:'underline'}}>{tx.txHash.slice(0, 12)}...{tx.txHash.slice(-8)}</a>
                        </span>
                      </TxMeta>
                    </TxInfo>
                    <div style={{ textAlign: 'right' }}>
                      <TxAmount $type={tx.type}>
                        {tx.amount > 0 ? (
                          <>
                            {tx.type === 'deposit' || tx.type === 'receive' ? '+' : ''}
                            {tx.amount.toFixed(4)} BCH
                          </>
                        ) : '—'}
                      </TxAmount>
                      <ExternalLinkBtn
                        href={getExplorerTxUrl(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginTop: '4px', display: 'inline-block' }}
                      >
                        🔗 Explorer
                      </ExternalLinkBtn>
                    </div>
                  </TxCard>
                ))}
              </TxList>
            </>
          )}
        </Section>
      )}

      {/* ── Create + Register ── */}
      {wallet.connected && (
        <Section>
          <SectionTitle>Create New SafeDelay</SectionTitle>
          <Description style={{ fontSize: '14px', marginBottom: '16px' }}>
            Deploy a new SafeDelay wallet. Once deployed, register it with the manager.
          </Description>

          <FormRow style={{ alignItems: 'flex-end' }}>
            <FormGroup>
              <Label>Lock Duration (blocks)</Label>
              <Input
                type="number"
                min="1"
                value={lockBlocks}
                onChange={e => setLockBlocks(e.target.value)}
              />
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                ≈ {Math.round(parseInt(lockBlocks) / 144)} days
              </span>
            </FormGroup>

            {!computedAddress ? (
              <PrimaryBtn onClick={handleComputeAddress} disabled={!managerAddress}>
                🔮 Compute Address
              </PrimaryBtn>
            ) : (
              <SuccessBtn onClick={handleDeploy} disabled={registering}>
                {registering ? '⏳ Deploying...' : '🚀 Deploy SafeDelay'}
              </SuccessBtn>
            )}
          </FormRow>

          {computedAddress && (
            <AddressBox>
              <span>
                <strong>SafeDelay Address:</strong><br />
                {computedAddress}
                {computedLockEnd && (
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    Lock end: block {computedLockEnd} (~{Math.round(computedLockEnd / 144)} days from now)
                  </span>
                )}
              </span>
              <CopyBtn onClick={() => handleCopy(computedAddress)}>
                {copied === computedAddress ? '✓' : '📋 Copy'}
              </CopyBtn>
            </AddressBox>
          )}

          {/* ── Registration ── */}
          {fundedAddress && (
            <>
              <AddressBox style={{ borderColor: 'rgba(16,185,129,0.4)', marginTop: '16px' }}>
                <span>
                  <strong>✅ Deployed & ready to register:</strong><br />
                  {fundedAddress}
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    Lock end: block {fundedLockEnd}
                  </span>
                </span>
              </AddressBox>

              <FormRow style={{ marginTop: '12px' }}>
                <FormGroup>
                  <Label>Fee to Service Provider (sats)</Label>
                  <Input
                    type="number"
                    min="546"
                    value={registerFee}
                    onChange={e => setRegisterFee(e.target.value)}
                    style={{ width: '130px' }}
                  />
                </FormGroup>
                <SuccessBtn
                  onClick={handleRegister}
                  disabled={registering || !serviceProviderPkh || !managerAddress}
                >
                  {registering ? '⏳ Registering...' : '📝 Register with Manager'}
                </SuccessBtn>
              </FormRow>

              {!serviceProviderPkh && (
                <MessageBox $type="info" style={{ marginTop: '8px' }}>
                  Enter the service provider PKH above to enable registration.
                </MessageBox>
              )}
            </>
          )}

          {registerError && <MessageBox $type="error">{registerError}</MessageBox>}
          {registerSuccess && <MessageBox $type="success">{registerSuccess}</MessageBox>}

          {!hasSigner && (
            <MessageBox $type="info" style={{ marginTop: '12px' }}>
              💡 Use a CashScript wallet (Paytaca, Electron Cash SLP) for signing.
            </MessageBox>
          )}
        </Section>
      )}

      {/* ── How It Works ── */}
      {managerAddress && (
        <Section>
          <SectionTitle>How It Works</SectionTitle>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.7' }}>
            <p>
              <strong>SafeDelay</strong> lets you create time-locked wallets — funds are frozen until a
              target block is reached. Useful for escrow, prize escrow, or controlled vesting.
            </p>
            <p style={{ marginTop: '8px' }}>
              Register your SafeDelay address with the manager to make it publicly visible.
              The service provider key prevents spam registrations.
            </p>
          </div>
        </Section>
      )}
    </Container>
  );
}
