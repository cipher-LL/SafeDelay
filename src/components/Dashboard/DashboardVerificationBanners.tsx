import { useCallback } from 'react';
import { MessageBox } from '../Dashboard.styles';
import { VerificationResult, BytecodeMismatch } from './types';
import { getExplorerAddressUrl } from './utils';
import type { Network } from './utils';

interface DashboardVerificationBannersProps {
  network: Network;
  verificationResult: VerificationResult | null | undefined;
  isVerifying: boolean;
  verifyProgress: string | null;
  verifyProgressDetail: { current: number; total: number } | null;
  verifyStartTime: number | null;
  dismissedMismatches: string[];
  onDismissMismatch: (address: string) => void;
  onReverify: () => void;
  onPause: () => void;
  onAbort: () => void;
  getLabel: (address: string) => string | null;
}

export default function DashboardVerificationBanners({
  network,
  verificationResult,
  isVerifying,
  verifyProgress,
  verifyProgressDetail,
  verifyStartTime,
  dismissedMismatches,
  onDismissMismatch,
  onReverify,
  onPause,
  onAbort,
  getLabel,
}: DashboardVerificationBannersProps) {
  return (
    <>
      {/* Auto-verification paused state */}
      {!isVerifying && verifyProgress && verifyProgress.includes('paused') && (
        <MessageBox $type="info" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⏸️</span>
            <span>{verifyProgress}</span>
          </div>
          <button
            onClick={onReverify}
            style={{
              padding: '4px 12px',
              background: 'rgba(59, 130, 246, 0.8)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Resume
          </button>
        </MessageBox>
      )}

      {/* Auto-verification progress */}
      {isVerifying && (
        <MessageBox $type="info" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span>
            <span>{verifyProgress || 'Verifying contracts on-chain...'}</span>
            {verifyProgressDetail && (
              <>
                <div style={{
                  width: '80px',
                  height: '6px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(verifyProgressDetail.current / verifyProgressDetail.total) * 100}%`,
                    height: '100%',
                    background: '#3b82f6',
                    borderRadius: '3px',
                    transition: 'width 0.2s ease',
                  }} />
                </div>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                  {verifyProgressDetail.current}/{verifyProgressDetail.total}
                </span>
              </>
            )}
            {verifyStartTime && !verifyProgressDetail && (
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                ({(Math.round((Date.now() - verifyStartTime) / 1000))}s elapsed)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onPause}
              style={{
                padding: '4px 12px',
                background: 'rgba(245, 158, 11, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Pause
            </button>
            <button
              onClick={onAbort}
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
          </div>
        </MessageBox>
      )}

      {/* Auto-verification results: network errors */}
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
              onClick={onReverify}
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
                  {getLabel(mismatch.address) && (
                    <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600, marginBottom: '2px' }}>{getLabel(mismatch.address)}</span>
                  )}
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
                    <div style={{ color: '#c4b5fd', fontSize: '14px', fontWeight: 700, padding: '0 6px', flexShrink: 0 }}>vs</div>
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
                    <a
                      href={getExplorerAddressUrl(network, mismatch.address.replace('bchtest:', '').replace('bitcoincash:', ''))}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '11px', color: '#818cf8', marginLeft: '4px', textDecoration: 'none' }}
                      title="View on block explorer"
                    >
                      ↗
                    </a>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={onReverify}
                    style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #6366f1', background: 'transparent', color: '#818cf8' }}
                    title="Re-verify all contracts"
                  >
                    Re-verify
                  </button>
                  <button
                    onClick={() => onDismissMismatch(mismatch.address)}
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

      {/* Auto-verification results: recoverable contracts found */}
      {verificationResult && verificationResult.recoverable.length > 0 && (
        <MessageBox $type="success" style={{ marginBottom: '20px' }}>
          🎉 Found {verificationResult.recoverable.length} SafeDelay contract{verificationResult.recoverable.length !== 1 ? 's' : ''} on-chain that aren&apos;t in your local storage! Scroll down to &quot;On-Chain Contract Recovery&quot; to recover them.
        </MessageBox>
      )}
    </>
  );
}
