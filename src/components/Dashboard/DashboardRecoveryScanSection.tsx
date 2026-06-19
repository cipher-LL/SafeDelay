import { BackupSection, SectionTitle, Description, MessageBox, BackupActions } from '../Dashboard.styles';
import { DiscoveredContract, ScanResult, NavigateTab } from './types';
import { estimateUnlockDateFromBlocks, formatTimeAgo } from './utils';
import type { Network } from './utils';

interface DashboardRecoveryScanSectionProps {
  network: Network;
  walletConnected: boolean;
  recoveryScanning: boolean;
  recoveryScanProgress: string | null;
  recoveryScanDone: boolean;
  discoveredContracts: DiscoveredContract[];
  scanTimestamp: number | null;
  discoveryResult: ScanResult | null;
  showSavedBanner: boolean;
  currentBlock: number | undefined;
  onHandleRecoveryScan: () => void;
  onAbortDiscovery: () => void;
  onHandleRecoverContract: (contract: DiscoveredContract) => void;
  onHandleRecoverAll: () => void;
  onClearScanResults: () => void;
  onDismissSavedBanner: () => void;
}

export default function DashboardRecoveryScanSection({
  network,
  walletConnected,
  recoveryScanning,
  recoveryScanProgress,
  recoveryScanDone,
  discoveredContracts,
  scanTimestamp,
  discoveryResult,
  showSavedBanner,
  currentBlock,
  onHandleRecoveryScan,
  onAbortDiscovery,
  onHandleRecoverContract,
  onHandleRecoverAll,
  onClearScanResults,
  onDismissSavedBanner,
}: DashboardRecoveryScanSectionProps) {
  return (
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
                onClick={onDismissSavedBanner}
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
                onDismissSavedBanner();
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
                  Scanned {formatTimeAgo(scanTimestamp)}
                </span>
              )}
            </MessageBox>
            <button
              onClick={onClearScanResults}
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
                    {(() => {
                      const unlockDate = estimateUnlockDateFromBlocks(c.lockEndBlock, currentBlock);
                      return unlockDate && (
                        <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.5)' }}>
                          (~{unlockDate})
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <button
                  onClick={() => onHandleRecoverContract(c)}
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
              onClick={onHandleRecoverAll}
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
          onClick={onHandleRecoveryScan}
          disabled={recoveryScanning || !walletConnected}
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
            onClick={onAbortDiscovery}
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
          onClick={onClearScanResults}
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

      {!walletConnected && (
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
  );
}
