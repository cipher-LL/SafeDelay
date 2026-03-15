import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';

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

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 700;
  color: #4f46e5;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
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
`;

const WithdrawButton = styled(ActionButton)`
  background: #4f46e5;
  color: white;

  &:hover {
    background: #4338ca;
  }
`;

const CancelButton = styled(ActionButton)`
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const DepositButton = styled(ActionButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;

  &:hover {
    background: rgba(16, 185, 129, 0.3);
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
`;

interface TimeLock {
  address: string;
  balance: number;
  lockEndBlock: number;
  currentBlock: number;
  type: 'single' | 'multisig';
  owners?: string[];
}

export default function Dashboard() {
  const { network } = useNetwork();
  const { wallet } = useWallet();
  const [contracts, setContracts] = useState<TimeLock[]>([]);

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
      ]);
    } else {
      setContracts([]);
    }
  }, [wallet.connected, network]);

  const getTimeRemaining = (lockEnd: number, current: number) => {
    const blocksRemaining = lockEnd - current;
    if (blocksRemaining <= 0) return 'Unlocked';
    const days = Math.floor(blocksRemaining / 144);
    if (days === 0) return `${blocksRemaining} blocks`;
    return `${days} days`;
  };

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

      {wallet.connected ? (
        contracts.length > 0 ? (
          <ContractList>
            {contracts.map((contract) => {
              const isLocked = contract.lockEndBlock > contract.currentBlock;
              return (
                <ContractCard key={contract.address}>
                  <ContractInfo>
                    <ContractAddress>{contract.address}</ContractAddress>
                    <div style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
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
    </DashboardContainer>
  );
}
