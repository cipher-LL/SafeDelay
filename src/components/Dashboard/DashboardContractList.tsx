import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  TransactionSection, SectionTitle,
  ContractList, ContractCard, ContractSkeletonCard, ContractSkeletonLine,
  ContractInfo, ContractAddress, QRCodeSection, QRCodeWrapper,
  CopyButton, ContractBalance, ContractStatus, ContractActions,
  DepositButton, WithdrawButton, CancelButton, ExtendButton,
  EmptyState,
  LabelDisplay, LabelInput, LabelButton, SaveLabelBtn, RemoveLabelBtn,
  WalletLabel, SortBar, SortLabel, SortSelect,
} from '../Dashboard.styles';
import { TimeLock, SortOption, NavigateTab } from './types';
import { getExplorerAddressUrl, getTimeRemaining, estimateUnlockDateFromBlocks } from './utils';
import type { Network } from './utils';

interface DashboardContractListProps {
  network: Network;
  walletConnected: boolean;
  contracts: TimeLock[];
  contractsLoaded: boolean;
  sortedContracts: TimeLock[];
  filteredContracts: TimeLock[];
  walletFilter: 'all' | 'mine';
  sortBy: SortOption;
  unlockedFilter: boolean;
  editingLabel: string | null;
  labelInput: string;
  showQRCode: string | null;
  copiedAddress: string | null;
  scanningOnChain: boolean;
  autoScanProgress: string;
  autoScanCancellable: boolean;
  recoveryScanning: boolean;
  recoveryScanProgress: string | null;
  onNavigateTab?: (tab: NavigateTab) => void;
  onSetWalletFilter: (val: 'all' | 'mine') => void;
  onSetSortBy: (val: SortOption) => void;
  onSetUnlockedFilter: (val: boolean) => void;
  onEditLabel: (address: string) => void;
  onSaveLabel: (address: string) => void;
  onCancelEditLabel: () => void;
  onSetLabelInput: (val: string) => void;
  onCopyAddress: (address: string) => void;
  onToggleQR: (address: string) => void;
  onWithdraw: (contract: TimeLock) => void;
  onCancel: (contract: TimeLock) => void;
  onDepositRequest: (contract: TimeLock) => void;
  onExtendRequest: (contract: TimeLock) => void;
  onCancelScan: () => void;
}

export default function DashboardContractList({
  network,
  walletConnected,
  contracts,
  contractsLoaded,
  sortedContracts,
  filteredContracts,
  walletFilter,
  sortBy,
  unlockedFilter,
  editingLabel,
  labelInput,
  showQRCode,
  copiedAddress,
  scanningOnChain,
  autoScanProgress,
  autoScanCancellable,
  recoveryScanning,
  recoveryScanProgress,
  onNavigateTab,
  onSetWalletFilter,
  onSetSortBy,
  onSetUnlockedFilter,
  onEditLabel,
  onSaveLabel,
  onCancelEditLabel,
  onSetLabelInput,
  onCopyAddress,
  onToggleQR,
  onWithdraw,
  onCancel,
  onDepositRequest,
  onExtendRequest,
  onCancelScan,
}: DashboardContractListProps) {
  return (
    <TransactionSection>
      <SectionTitle>Active Contracts</SectionTitle>

      {walletConnected && contracts.length > 0 && (
        <SortBar>
          <SortLabel>Filter:</SortLabel>
          <SortSelect value={walletFilter} onChange={(e) => onSetWalletFilter(e.target.value as 'all' | 'mine')}>
            <option value="all">All Contracts</option>
            <option value="mine">My Wallets</option>
          </SortSelect>
          <SortLabel style={{ marginLeft: '12px' }}>Sort by:</SortLabel>
          <SortSelect value={sortBy} onChange={(e) => onSetSortBy(e.target.value as SortOption)} style={{ fontWeight: sortBy !== 'amount' ? 600 : 400 }}>
            <option value="date">Unlock Date</option>
            <option value="amount">Amount</option>
            <option value="unlock">Time Remaining</option>
          </SortSelect>
          <button
            onClick={() => onSetUnlockedFilter(!unlockedFilter)}
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

      {walletConnected && contracts.length > 0 && (
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
              onClick={onCancelScan}
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
      {!contractsLoaded && walletConnected && (
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
      {contractsLoaded && walletConnected && !sortedContracts.length && recoveryScanning && (
        <ContractList>
          <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.6)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔄</div>
            <div>{recoveryScanProgress || 'Scanning blockchain for SafeDelay contracts...'}</div>
          </div>
        </ContractList>
      )}

      {walletConnected ? (
        filteredContracts.length > 0 ? (
          <ContractList>
            {filteredContracts.map((contract) => {
              const isLocked = contract.lockEndBlock > contract.currentBlock;
              const existingLabel = (contract as any).displayLabel as string | undefined;
              const isEditing = editingLabel === contract.address;

              return (
                <ContractCard key={contract.address}>
                  <ContractInfo>
                    {isEditing ? (
                      <LabelDisplay>
                        <LabelInput
                          value={labelInput}
                          onChange={(e) => onSetLabelInput(e.target.value)}
                          placeholder="Enter label..."
                          onKeyDown={(e) => e.key === 'Enter' && onSaveLabel(contract.address)}
                          autoFocus
                        />
                        <SaveLabelBtn onClick={() => onSaveLabel(contract.address)}>Save</SaveLabelBtn>
                        <RemoveLabelBtn onClick={onCancelEditLabel}>Cancel</RemoveLabelBtn>
                      </LabelDisplay>
                    ) : (
                      <LabelDisplay>
                        {existingLabel && <WalletLabel>{existingLabel}</WalletLabel>}
                        <LabelButton
                          onClick={() => onEditLabel(contract.address)}
                          style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', padding: '2px 8px', fontSize: '12px' }}
                        >
                          {existingLabel ? 'Edit' : '+ Add Label'}
                        </LabelButton>
                      </LabelDisplay>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                      <ContractAddress>{contract.address}</ContractAddress>
                      <a
                        href={getExplorerAddressUrl(network, contract.address.replace(/^(bchtest:|bitcoincash:)/, ''))}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: '#818cf8', textDecoration: 'none', flexShrink: 0 }}
                        title="View on block explorer"
                      >
                        ↗
                      </a>
                    </div>
                    <QRCodeSection>
                      <CopyButton onClick={() => onCopyAddress(contract.address)}>
                        {copiedAddress === contract.address ? '✓ Copied!' : '📋 Copy Address'}
                      </CopyButton>
                      <CopyButton onClick={() => onToggleQR(contract.address)}>
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
                    <DepositButton onClick={() => onDepositRequest(contract)}>Deposit</DepositButton>
                    <WithdrawButton
                      disabled={isLocked}
                      onClick={() => !isLocked && onWithdraw(contract)}
                      title={isLocked ? 'Lock period has not expired yet' : 'Withdraw all funds after lock expires'}
                    >
                      Withdraw
                    </WithdrawButton>
                    <CancelButton
                      onClick={() => onCancel(contract)}
                      title="Cancel anytime — returns all funds immediately"
                    >
                      Cancel
                    </CancelButton>
                    <ExtendButton
                      onClick={() => onExtendRequest(contract)}
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
  );
}
