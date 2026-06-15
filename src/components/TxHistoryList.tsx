/**
 * TxHistoryList.tsx
 *
 * Extracted from SafeDelayManagerDashboard.tsx.
 * Displays paginated transaction history for a selected SafeDelay wallet
 * with wallet selector, CSV export, and explorer links.
 */

import { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { useOnChainTxHistory, OnChainTx } from '../hooks/useOnChainTxHistory';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  animation: ${spin} 1s linear infinite;
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
  gap: 8px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 32px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.9);
`;

const Description = styled.p`
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin-bottom: 16px;
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

const FormRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
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

const TxList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TxCard = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`;

const TxInfo = styled.div`
  flex: 1;
`;

const TxType = styled.span<{ $type: OnChainTx['type'] }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $type }) =>
    $type === 'deposit' || $type === 'receive' ? 'rgba(16, 185, 129, 0.2)' :
    $type === 'withdraw' || $type === 'send' ? 'rgba(239, 68, 68, 0.2)' :
    $type === 'cancel' ? 'rgba(245, 158, 11, 0.2)' :
    'rgba(79, 70, 229, 0.2)'};
  color: ${({ $type }) =>
    $type === 'deposit' || $type === 'receive' ? '#10b981' :
    $type === 'withdraw' || $type === 'send' ? '#ef4444' :
    $type === 'cancel' ? '#f59e0b' :
    '#a5b4fc'};
`;

const TxMeta = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
  display: flex;
  gap: 12px;
`;

const TxAmount = styled.span<{ $type: OnChainTx['type'] }>`
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: ${({ $type }) =>
    $type === 'deposit' || $type === 'receive' ? '#10b981' :
    $type === 'withdraw' || $type === 'send' ? '#ef4444' :
    'rgba(255,255,255,0.8)'};
`;

const ExternalLinkBtn = styled.a`
  display: inline-block;
  margin-top: 4px;
  padding: 3px 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  &:hover { background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.9); }
`;

const Section = styled.div`
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

const TX_PER_PAGE = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EntryWithBalance {
  address: string | null;
  ownerPkh: string;
  lockEndBlock: number;
  balance: number;
  currentBlock: number;
}

export interface TxHistoryListProps {
  myEntries: EntryWithBalance[];
  selectedEntryForTx: string | null;
  network: 'mainnet' | 'testnet' | 'chipnet';
  getExplorerTxUrl: (txHash: string) => string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TxHistoryList({
  myEntries,
  selectedEntryForTx,
  network,
  getExplorerTxUrl,
}: TxHistoryListProps) {
  const [txPage, setTxPage] = useState(1);
  const [txHistory, setTxHistory] = useState<OnChainTx[]>([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txHistoryError, setTxHistoryError] = useState<string | null>(null);

  // Internal selected address — starts from prop, updated on dropdown change
  const [selectedAddress, setSelectedAddress] = useState<string | null>(selectedEntryForTx);
  // Increment to force-refresh the effect (bypasses double-fetch guard)
  const [refreshKey, setRefreshKey] = useState(0);

  const { fetchHistory } = useOnChainTxHistory();

  // Sync when prop changes externally (e.g., parent clears it)
  useEffect(() => {
    setSelectedAddress(selectedEntryForTx);
  }, [selectedEntryForTx]);

  // Fetch tx history whenever selected address or refresh key changes
  useEffect(() => {
    if (!selectedAddress) {
      setTxHistory([]);
      setTxHistoryError(null);
      setTxPage(1);
      return;
    }
    setTxHistoryLoading(true);
    setTxHistoryError(null);
    setTxPage(1);
    fetchHistory(selectedAddress, network)
      .then(setTxHistory)
      .catch(err => setTxHistoryError(err instanceof Error ? err.message : 'Failed to load transaction history'))
      .finally(() => setTxHistoryLoading(false));
  }, [selectedAddress, network, fetchHistory, refreshKey]);

  const handleExportTxCSV = () => {
    const headers = ['Type', 'Block Height', 'Timestamp', 'Tx Hash', 'Amount (BCH)'];
    const rows = txHistory.map(tx => [
      tx.type,
      tx.blockHeight.toString(),
      new Date(tx.timestamp).toISOString(),
      tx.txHash,
      tx.amount > 0 ? tx.amount.toFixed(8) : '0',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safedelay-tx-history-${selectedAddress?.slice(0, 12) || 'wallet'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section>
      <SectionTitle>Transaction History</SectionTitle>
      <Description>
        View on-chain transaction history for any registered SafeDelay wallet.
        Select a wallet below to load its transaction history.
      </Description>

      {/* Wallet Selector */}
      {myEntries.length > 0 && (
        <FormGroup style={{ marginBottom: '16px' }}>
          <Label>Select Wallet</Label>
          <FormRow>
            <select
              value={selectedAddress || ''}
              onChange={e => {
                const addr = e.target.value;
                skipNextEffectRef.current = true;
                setSelectedAddress(addr || null);
                setTxPage(1);
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
              onClick={() => {
                if (!selectedAddress) return;
                setRefreshKey(k => k + 1);
              }}
              disabled={!selectedAddress || txHistoryLoading}
            >
              {txHistoryLoading ? '⏳ Loading...' : '🔄 Refresh'}
            </SecondaryBtn>
          </FormRow>
        </FormGroup>
      )}

      {txHistoryError && <MessageBox $type="error">{txHistoryError}</MessageBox>}

      {txHistoryLoading && (
        <ScanMessageBox $type="info">
          <Spinner>🌀</Spinner>Fetching transaction history from Electrum...
        </ScanMessageBox>
      )}

      {!txHistoryLoading && txHistory.length === 0 && selectedAddress && (
        <EmptyState>No transactions found for this wallet.</EmptyState>
      )}

      {!txHistoryLoading && txHistory.length === 0 && !selectedAddress && (
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
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
                      Tx: <a
                        href={getExplorerTxUrl(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline' }}
                      >
                        {tx.txHash.slice(0, 12)}...{tx.txHash.slice(-8)}
                      </a>
                    </span>
                  </TxMeta>
                </TxInfo>
                <div style={{ textAlign: 'right' }}>
                  <TxAmount $type={tx.type}>
                    {tx.amount > 0 ? (
                      <>
                        {(tx.type === 'deposit' || tx.type === 'receive') && '+'}
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
  );
}