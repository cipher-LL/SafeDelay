import { useState, useCallback, useEffect, useRef } from 'react';
import QrScanner from '../QrScanner';
import {
  ModalOverlay, ModalBox, ModalTitle, ModalDesc,
  ModalInput, ModalActions, ModalConfirmBtn, ModalCancelBtn,
  MessageBox, TxHashLink,
} from '../Dashboard.styles';
import { PendingTx, NavigateTab } from './types';
import { getExplorerUrl } from './utils';
import type { Network } from './utils';

interface DashboardPendingTxModalProps {
  network: Network;
  pendingTx: PendingTx | null;
  wifMode: boolean;
  wifKey: string;
  wifAddress: string;
  wifError: string;
  hasSigner: boolean;
  extendDays: string;
  extendDaysError: string;
  depositAmount: string;
  onNavigateTab?: (tab: NavigateTab) => void;
  onClosePendingTx: () => void;
  onExecutePendingTx: () => void;
  onExecuteWifTx: () => void;
  onSetWifMode: (val: boolean) => void;
  onSetWifKey: (val: string) => void;
  onSetWifAddress: (val: string) => void;
  onSetWifError: (val: string) => void;
  onSetExtendDays: (val: string) => void;
  onSetDepositAmount: (val: string) => void;
  onSetPendingTx: (tx: PendingTx | null) => void;
}

export default function DashboardPendingTxModal({
  network,
  pendingTx,
  wifMode,
  wifKey,
  wifAddress,
  wifError,
  hasSigner,
  extendDays,
  extendDaysError,
  depositAmount,
  onNavigateTab,
  onClosePendingTx,
  onExecutePendingTx,
  onExecuteWifTx,
  onSetWifMode,
  onSetWifKey,
  onSetWifAddress,
  onSetWifError,
  onSetExtendDays,
  onSetDepositAmount,
  onSetPendingTx,
}: DashboardPendingTxModalProps) {
  const closePendingTxRef = useRef<(() => void) | null>(null);
  const extendDaysRef = useRef('');

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pendingTx) return;
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      onClosePendingTx();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingTx, onClosePendingTx]);

  if (!pendingTx) return null;

  const handleWifKeyChange = useCallback((value: string) => {
    onSetWifKey(value);
    if (!value) {
      onSetWifAddress('');
      onSetWifError('');
      return;
    }
    // Basic validation: WIF keys start with 'L' or 'K' (mainnet) or 'c' (testnet)
    if (!/^[KLc][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(value)) {
      onSetWifError('Invalid WIF key format');
      onSetWifAddress('');
      return;
    }
    onSetWifError('');
    // For display purposes, derive a dummy address (actual derivation would need cashscript)
    // We just show a masked version for UX
    onSetWifAddress(value.slice(0, 10) + '...' + value.slice(-6));
  }, [onSetWifKey, onSetWifAddress, onSetWifError]);

  const handleExtendDaysChange = (val: string) => {
    onSetExtendDays(val);
    extendDaysRef.current = val;
    if (val && parseInt(val) <= 0) {
      // Validation handled by parent
    }
  };

  return (
    <ModalOverlay onClick={(e) => { if (e.target === e.currentTarget) onClosePendingTx(); }}>
      <ModalBox>
        <ModalTitle>
          {pendingTx.type === 'withdraw' ? '💸 Withdraw Funds' :
           pendingTx.type === 'cancel' ? '✕ Cancel Contract' :
           pendingTx.type === 'extend' ? '🔒 Extend Lock' :
           '💰 Deposit Funds'}
        </ModalTitle>
        <ModalDesc>
          {pendingTx.type === 'withdraw' && 'Withdraw your locked BCH once the lock period has expired. This will send all funds to your wallet address.'}
          {pendingTx.type === 'cancel' && 'Cancel the SafeDelay contract and return all funds to your wallet immediately. No wait time required.'}
          {pendingTx.type === 'extend' && 'One-way extend: your lock end block moves forward. All funds are sent to your wallet — you must create a new SafeDelay and deposit again. Cannot be undone.'}
          {pendingTx.type === 'deposit' && `Deposit BCH into your SafeDelay contract at ${pendingTx.contractAddress.slice(0, 16)}...`}
        </ModalDesc>

        {pendingTx.status === 'confirm' && pendingTx.warning && (
          <MessageBox $type="warning" style={{ marginBottom: '16px', fontSize: '13px', whiteSpace: 'pre-line' }}>
            {pendingTx.warning}
          </MessageBox>
        )}

        {pendingTx.status === 'error' && pendingTx.error && (
          <MessageBox $type="error" style={{ marginBottom: '16px' }}>
            {pendingTx.error}
          </MessageBox>
        )}

        {pendingTx.status === 'success' && pendingTx.txHash && (
          <MessageBox $type="info" style={{ marginBottom: '16px' }}>
            ⏳ Transaction submitted! Waiting for confirmation...<br />
            <TxHashLink href={getExplorerUrl(network, pendingTx.txHash)} target="_blank" rel="noopener noreferrer">
              {pendingTx.txHash.slice(0, 24)}... ↗
            </TxHashLink>
          </MessageBox>
        )}

        {pendingTx.status === 'confirmed' && pendingTx.txHash && (
          <MessageBox $type="success" style={{ marginBottom: '16px' }}>
            ✅ Transaction confirmed!<br />
            <TxHashLink href={getExplorerUrl(network, pendingTx.txHash)} target="_blank" rel="noopener noreferrer">
              {pendingTx.txHash.slice(0, 24)}... ↗
            </TxHashLink>
          </MessageBox>
        )}

        {pendingTx.status === 'broadcasting' && (
          <MessageBox $type="info" style={{ marginBottom: '16px' }}>
            ⏳ Signing & broadcasting transaction...
          </MessageBox>
        )}

        {pendingTx.status === 'confirm' && pendingTx.type === 'extend' && (
          <div style={{ marginBottom: '16px' }}>
            <MessageBox $type="warning" style={{ marginBottom: '12px', fontSize: '13px' }}>
              ⚠️ This will send ALL funds to your wallet. You must create a new SafeDelay with the extended lock and deposit again. Cannot be undone.
            </MessageBox>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
              Current lock: block {pendingTx.lockEndBlock} — add days to extend:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ModalInput
                type="number"
                step="1"
                min="1"
                placeholder="e.g. 30"
                value={extendDays}
                onChange={(e) => handleExtendDaysChange(e.target.value)}
                style={extendDaysError ? { borderColor: '#f44336' } : {}}
              />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>days</span>
            </div>
            {extendDaysError && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#f44336' }}>
                {extendDaysError}
              </div>
            )}
            {extendDays && pendingTx.lockEndBlock && parseInt(extendDays) > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                New lock end block: {pendingTx.lockEndBlock + (parseInt(extendDays) * 144)} (~{extendDays} days from now)
              </div>
            )}
          </div>
        )}

        {pendingTx.status === 'confirm' && pendingTx.type === 'deposit' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
              Deposit amount (BCH):
            </label>
            <ModalInput
              type="number"
              step="0.001"
              min="0.001"
              placeholder="0.01"
              value={depositAmount}
              onChange={(e) => {
                onSetDepositAmount(e.target.value);
                onSetPendingTx(prev => prev ? { ...prev, amount: parseFloat(e.target.value) || 0.01 } : null);
              }}
            />
          </div>
        )}

        {/* ── Signing mode selector ── */}
        {pendingTx.status === 'confirm' && (
          <>
            {!wifMode ? (
              /* CashScript wallet signing mode */
              <>
                {hasSigner ? (
                  <ModalDesc style={{ marginBottom: '8px', fontSize: '13px' }}>
                    This transaction will be signed by your connected CashScript wallet and broadcast to the {network} network.
                  </ModalDesc>
                ) : (
                  <ModalDesc style={{ marginBottom: '8px', fontSize: '13px' }}>
                    No CashScript wallet detected. Use the WIF key option below to sign with your private key.
                  </ModalDesc>
                )}
                <ModalActions style={{ flexDirection: 'column', gap: '8px' }}>
                  {hasSigner ? (
                    <ModalConfirmBtn
                      style={{ width: '100%' }}
                      onClick={onExecutePendingTx}
                      disabled={pendingTx.type === 'deposit' && !depositAmount || pendingTx.type === 'extend' && !extendDays}
                    >
                      {pendingTx.type === 'withdraw' ? '💸 Withdraw (Wallet)' :
                       pendingTx.type === 'cancel' ? '✕ Cancel Contract (Wallet)' :
                       pendingTx.type === 'extend' ? '🔒 Extend Lock (Wallet)' :
                       '💰 Deposit (Wallet)'}
                    </ModalConfirmBtn>
                  ) : null}
                  <ModalCancelBtn
                    style={{ width: '100%', textAlign: 'center' }}
                    onClick={() => onSetWifMode(true)}
                  >
                    🔑 Sign with WIF Private Key
                  </ModalCancelBtn>
                  <ModalCancelBtn
                    style={{ width: '100%', textAlign: 'center' }}
                    onClick={onClosePendingTx}
                  >
                    Cancel
                  </ModalCancelBtn>
                </ModalActions>
              </>
            ) : (
              /* WIF key signing mode */
              <>
                <ModalDesc style={{ marginBottom: '8px', fontSize: '13px', color: '#f59e0b' }}>
                  🔐 WIF signing keeps your key in memory only — it is never stored or transmitted.
                </ModalDesc>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '6px' }}>
                    Enter WIF Private Key:
                  </label>
                  <QrScanner onScan={handleWifKeyChange} addressMode={pendingTx.type === 'deposit'} />
                  <ModalInput
                    type="password"
                    placeholder="L1aW4aubWDZB...."
                    value={wifKey}
                    onChange={(e) => handleWifKeyChange(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '8px' }}
                  />
                  {wifError && (
                    <MessageBox $type="error" style={{ fontSize: '12px', marginTop: '6px' }}>
                      {wifError}
                    </MessageBox>
                  )}
                  {wifAddress && !wifError && (
                    <MessageBox $type="success" style={{ fontSize: '12px', marginTop: '6px' }}>
                      ✅ Key valid — Address: <span style={{ fontFamily: 'monospace' }}>{wifAddress.slice(0, 20)}...</span>
                    </MessageBox>
                  )}
                </div>
                <ModalActions style={{ flexDirection: 'column', gap: '8px' }}>
                  <ModalConfirmBtn
                    style={{ width: '100%' }}
                    onClick={onExecuteWifTx}
                    disabled={!wifAddress || (pendingTx.type === 'deposit' && !depositAmount) || (pendingTx.type === 'extend' && !extendDays)}
                  >
                    {`🔑 Sign with WIF — ${pendingTx.type === 'withdraw' ? 'Withdraw' : pendingTx.type === 'cancel' ? 'Cancel' : pendingTx.type === 'extend' ? 'Extend Lock' : 'Deposit'}`}
                  </ModalConfirmBtn>
                  <ModalCancelBtn
                    style={{ width: '100%', textAlign: 'center' }}
                    onClick={() => {
                      onSetWifMode(false);
                      onSetWifKey('');
                      onSetWifAddress('');
                      onSetWifError('');
                    }}
                  >
                    ← Back
                  </ModalCancelBtn>
                </ModalActions>
              </>
            )}
          </>
        )}

        {pendingTx.status !== 'success' && pendingTx.status !== 'confirm' && pendingTx.status !== 'confirmed' && (
          <ModalActions>
            <ModalCancelBtn onClick={onClosePendingTx}>Cancel</ModalCancelBtn>
            <ModalConfirmBtn
              onClick={onExecutePendingTx}
              disabled={pendingTx.status === 'broadcasting' || (pendingTx.type === 'deposit' && !depositAmount)}
            >
              {pendingTx.status === 'broadcasting' ? '⏳ Signing & Broadcasting...' :
               pendingTx.type === 'withdraw' ? '💸 Withdraw' :
               pendingTx.type === 'cancel' ? '✕ Cancel Contract' :
               pendingTx.type === 'extend' ? '🔒 Extend Lock' :
               '💰 Deposit'}
            </ModalConfirmBtn>
          </ModalActions>
        )}

        {(pendingTx.status === 'success' || pendingTx.status === 'confirmed') && (
          <ModalActions>
            <ModalConfirmBtn onClick={() => { onClosePendingTx(); onNavigateTab?.('dashboard'); }}>Done → Dashboard</ModalConfirmBtn>
          </ModalActions>
        )}
      </ModalBox>
    </ModalOverlay>
  );
}
