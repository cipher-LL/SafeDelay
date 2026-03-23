import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { useWalletLabels } from '../hooks/useWalletLabels';
import { useWalletBackup } from '../hooks/useWalletBackup';
import { QRCodeSVG } from 'qrcode.react';

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

const MessageBox = styled.div<{ $type: 'success' | 'error' }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  background: ${({ $type }) => $type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
  color: ${({ $type }) => $type === 'success' ? '#10b981' : '#ef4444'};
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
  type: 'deposit' | 'withdraw' | 'create';
  amount: number;
  timestamp: number;
  txHash: string;
  contractAddress: string;
}

type SortOption = 'date' | 'amount' | 'unlock';

export default function Dashboard() {
  const { network } = useNetwork();
  const { wallet } = useWallet();
  const { getLabel, setLabel, removeLabel } = useWalletLabels();
  const [contracts, setContracts] = useState<TimeLock[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdraw' | 'create'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

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

  // Use backup hook
  const {
    exportBackup,
    importBackup,
    exporting,
    importing,
    error: backupError,
    success: backupSuccess,
    clearMessages: clearBackupMessages,
  } = useWalletBackup(getWalletData);

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
      e.target.value = ''; // Reset file input
    }
  };

  // Placeholder data for demonstration
  useEffect(() => {
    if (wallet.connected) {
      // TODO: Fetch actual contracts from Electrum
      setContracts([
        {
          address: 'bitcoincash:qztest123456789abcdef',
          balance: 1.5,
          lockEndBlock: 890000,
          currentBlock: 850000,
          type: 'single',
        },
        {
          address: 'bitcoincash:pztest987654321fedcba',
          balance: 3.2,
          lockEndBlock: 870000,
          currentBlock: 850000,
          type: 'multisig',
          owners: ['owner1', 'owner2', 'owner3'],
        },
      ]);
      
      // Mock transaction history
      setTransactions([
        {
          id: '1',
          type: 'create',
          amount: 1.5,
          timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
          txHash: 'abc123def456',
          contractAddress: 'bitcoincash:qztest123456789abcdef',
        },
        {
          id: '2',
          type: 'deposit',
          amount: 0.5,
          timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
          txHash: 'def456ghi789',
          contractAddress: 'bitcoincash:qztest123456789abcdef',
        },
        {
          id: '3',
          type: 'deposit',
          amount: 3.2,
          timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
          txHash: 'ghi789jkl012',
          contractAddress: 'bitcoincash:pztest987654321fedcba',
        },
        {
          id: '4',
          type: 'withdraw',
          amount: 0.3,
          timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
          txHash: 'jkl012mno345',
          contractAddress: 'bitcoincash:qztest123456789abcdef',
        },
      ]);
    } else {
      setContracts([]);
      setTransactions([]);
    }
  }, [wallet.connected, network]);

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
        // Sort by lock end block (earliest first)
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
    // Strip the bitcoincash: prefix for clipboard if present
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

  // Calculate analytics
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalWithdrawals = transactions
    .filter(t => t.type === 'withdraw')
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
          <AnalyticsLabel>Total Withdrawn</AnalyticsLabel>
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
                      {tx.type === 'deposit' ? '↓' : tx.type === 'withdraw' ? '↑' : '✦'}
                    </TransactionIcon>
                    <TransactionDetails>
                      <TransactionType>
                        {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                      </TransactionType>
                      <TransactionDate>{formatDate(tx.timestamp)}</TransactionDate>
                    </TransactionDetails>
                  </TransactionInfo>
                  <TransactionAmount $type={tx.type}>
                    {tx.type === 'withdraw' ? '-' : '+'}{tx.amount.toFixed(4)} BCH
                  </TransactionAmount>
                </TransactionItem>
              ))}
            </TransactionList>
          ) : (
            <EmptyState>No transactions found</EmptyState>
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
                      <DepositButton>Deposit</DepositButton>
                      <WithdrawButton disabled={isLocked}>Withdraw</WithdrawButton>
                      <CancelButton>Cancel</CancelButton>
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
    </DashboardContainer>
  );
}