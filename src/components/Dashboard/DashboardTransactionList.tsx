import { Transaction, TxFilterType } from './types';
import { getExplorerUrl, formatDate } from './utils';
import type { Network } from './utils';
import {
  TransactionSection, SectionTitle,
  FilterBar, FilterButton,
  TransactionList, TransactionItem,
  TransactionInfo, TransactionIcon, TransactionDetails,
  TransactionType, TransactionDate, TransactionAmount, TxHashLink,
  EmptyState,
} from '../Dashboard.styles';

interface DashboardTransactionListProps {
  network: Network;
  walletConnected: boolean;
  transactions: Transaction[];
  txFilter: TxFilterType;
  onSetTxFilter: (filter: TxFilterType) => void;
}

export default function DashboardTransactionList({
  network,
  walletConnected,
  transactions,
  txFilter,
  onSetTxFilter,
}: DashboardTransactionListProps) {
  const filteredTransactions = txFilter === 'all'
    ? transactions
    : transactions.filter(tx => tx.type === txFilter);

  return (
    <TransactionSection>
      <SectionTitle>Transaction History</SectionTitle>
      <FilterBar>
        <FilterButton $active={txFilter === 'all'} onClick={() => onSetTxFilter('all')}>
          All
        </FilterButton>
        <FilterButton $active={txFilter === 'deposit'} onClick={() => onSetTxFilter('deposit')}>
          Deposits
        </FilterButton>
        <FilterButton $active={txFilter === 'withdraw'} onClick={() => onSetTxFilter('withdraw')}>
          Withdrawals
        </FilterButton>
        <FilterButton $active={txFilter === 'cancel'} onClick={() => onSetTxFilter('cancel')}>
          Cancels
        </FilterButton>
        <FilterButton $active={txFilter === 'create'} onClick={() => onSetTxFilter('create')}>
          Created
        </FilterButton>
      </FilterBar>

      {walletConnected ? (
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
  );
}
