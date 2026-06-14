import styled from 'styled-components';

// --- Layout ---
export const DashboardContainer = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

export const Title = styled.h2`
  font-size: 24px;
  margin-bottom: 8px;
`;

export const Description = styled.p`
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 24px;
`;

export const SectionTitle = styled.h3`
  font-size: 18px;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.9);
`;

export const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
`;

// --- Auto-refresh ---
export const AutoRefreshToggle = styled.button<{ $active: boolean; $loading: boolean }>`
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
  animation: ${({ $loading }) => $loading ? 'pulse 1.5s ease-in-out infinite' : 'none'};
  &:hover { background: ${({ $active }) => $active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
`;

// --- Stats ---
export const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
`;

export const StatCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  min-height: 80px;
`;

export const StatSkeleton = styled.div`
  height: 32px;
  width: 60%;
  margin: 0 auto 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  animation: pulse 1.5s ease-in-out infinite;
`;

export const StatLabelSkeleton = styled.div`
  height: 14px;
  width: 45%;
  margin: 0 auto;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  animation: pulse 1.5s ease-in-out infinite;
`;

export const StatValue = styled.div<{ $color?: string }>`
  font-size: 32px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#4f46e5'};
`;

export const StatLabel = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
`;

// --- Analytics ---
export const AnalyticsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

export const AnalyticsCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

export const AnalyticsValue = styled.div<{ $color?: string }>`
  font-size: 28px;
  font-weight: 700;
  color: ${({ $color }) => $color || '#0AC18E'};
  margin-bottom: 4px;
`;

export const AnalyticsLabel = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
`;

export const ProgressBar = styled.div`
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  margin-top: 12px;
  overflow: hidden;
`;

export const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => $percent}%;
  background: linear-gradient(90deg, #4f46e5, #0AC18E);
  border-radius: 4px;
  transition: width 0.3s ease;
`;

// --- Contract List ---
export const ContractList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const ContractCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

export const ContractSkeletonCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
  animation: pulse 1.5s ease-in-out infinite;
`;

export const ContractSkeletonLine = styled.div<{ $w?: string }>`
  height: 14px;
  width: ${({ $w }) => $w || '70%'};
  margin-bottom: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
`;

export const ContractInfo = styled.div`
  flex: 1;
  min-width: 200px;
`;

export const ContractAddress = styled.div`
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
`;

export const QRCodeSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
`;

export const QRCodeWrapper = styled.div`
  background: white;
  padding: 8px;
  border-radius: 6px;
`;

export const CopyButton = styled.button`
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

export const ContractBalance = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: #10b981;
`;

export const ContractStatus = styled.span<{ $locked: boolean }>`
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $locked }) => ($locked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)')};
  color: ${({ $locked }) => ($locked ? '#ef4444' : '#10b981')};
`;

export const ContractActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

export const ActionButton = styled.button`
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

export const WithdrawButton = styled(ActionButton)`
  background: #4f46e5;
  color: white;

  &:hover:not(:disabled) {
    background: #4338ca;
  }
`;

export const CancelButton = styled(ActionButton)`
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;

  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
  }
`;

export const DepositButton = styled(ActionButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.3);
  }
`;

export const ExtendButton = styled(ActionButton)`
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;

  &:hover:not(:disabled) {
    background: rgba(139, 92, 246, 0.3);
  }
`;

// --- Labels ---
export const LabelDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const LabelInput = styled.input`
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

export const LabelButton = styled.button`
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
`;

export const SaveLabelBtn = styled(LabelButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover {
    background: rgba(16, 185, 129, 0.3);
  }
`;

export const RemoveLabelBtn = styled(LabelButton)`
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

export const WalletLabel = styled.span`
  background: rgba(79, 70, 229, 0.2);
  color: #a5b4fc;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
`;

// --- Transactions ---
export const TransactionSection = styled.div`
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

export const FilterBar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

export const FilterButton = styled.button<{ $active: boolean }>`
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

export const TransactionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const TransactionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  flex-wrap: wrap;
  gap: 12px;
`;

export const SortBar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
`;

export const SortLabel = styled.span`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-right: 8px;
`;

export const SortSelect = styled.select`
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

export const TransactionInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

export const TransactionIcon = styled.span<{ $type: string }>`
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

export const TransactionDetails = styled.div``;

export const TransactionType = styled.div`
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
`;

export const TransactionDate = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
`;

export const TransactionAmount = styled.div<{ $type: string }>`
  font-size: 18px;
  font-weight: 700;
  color: ${({ $type }) =>
    $type === 'deposit' ? '#10b981' :
    $type === 'withdraw' ? '#ef4444' : '#4f46e5'};
`;

export const TxHashLink = styled.a`
  font-size: 12px;
  color: #a5b4fc;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

// --- Backup ---
export const BackupSection = styled.div`
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

export const BackupActions = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

export const BackupButton = styled.button`
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

export const ExportBtn = styled(BackupButton)`
  background: #4f46e5;
  color: white;

  &:hover:not(:disabled) {
    background: #4338ca;
  }
`;

export const ImportBtn = styled(BackupButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.3);
  }
`;

export const FileInput = styled.input`
  display: none;
`;

export const PasswordInput = styled.input`
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

export const PasswordLabel = styled.span`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-left: 12px;
`;

export const EncryptNote = styled.p`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
`;

// --- Message Box ---
export const MessageBox = styled.div<{ $type: 'success' | 'error' | 'info' | 'warning' }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-top: 12px;
  background: ${({ $type }) => $type === 'success' ? 'rgba(16, 185, 129, 0.2)' : $type === 'error' ? 'rgba(239, 68, 68, 0.2)' : $type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(79, 70, 229, 0.2)'};
  color: ${({ $type }) => $type === 'success' ? '#10b981' : $type === 'error' ? '#ef4444' : $type === 'warning' ? '#f59e0b' : '#a5b4fc'};
`;

// --- Modal ---
export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

export const ModalBox = styled.div`
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 32px;
  max-width: 480px;
  width: 90%;
`;

export const ModalTitle = styled.h3`
  font-size: 20px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.95);
`;

export const ModalDesc = styled.p`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 20px;
  line-height: 1.5;
`;

export const ModalInput = styled.input`
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

export const ModalActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

export const ModalConfirmBtn = styled.button`
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

export const ModalCancelBtn = styled.button`
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
