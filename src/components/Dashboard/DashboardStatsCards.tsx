import { useState, useEffect, useCallback } from 'react';
import {
  StatsGrid, StatCard, StatSkeleton, StatLabelSkeleton,
  StatValue, StatLabel,
  AnalyticsGrid, AnalyticsCard, AnalyticsValue, AnalyticsLabel,
  ProgressBar, ProgressFill,
  TransactionSection, SectionTitle, Description, MessageBox,
} from '../Dashboard.styles';
import { TimeLock, Transaction } from './types';

interface DashboardStatsCardsProps {
  contracts: TimeLock[];
  contractsLoaded: boolean;
  transactions: Transaction[];
  permission: NotificationPermission | 'default' | 'denied';
  milestones: number[];
  notifications: Array<{
    address: string;
    percent: number;
    type: 'milestone' | 'expired';
  }>;
  onRequestPermission: () => void;
  onSetMilestones: (milestones: number[]) => void;
  onDismissNotification: (index: number) => void;
  onClearNotifications: () => void;
}

export default function DashboardStatsCards({
  contracts,
  contractsLoaded,
  transactions,
  permission,
  milestones,
  notifications,
  onRequestPermission,
  onSetMilestones,
  onDismissNotification,
  onClearNotifications,
}: DashboardStatsCardsProps) {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const totalDeposits = transactions
    .filter(tx => tx.type === 'deposit' || tx.type === 'create')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalWithdrawals = transactions
    .filter(tx => tx.type === 'withdraw' || tx.type === 'cancel')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const avgLockDuration = contracts.length > 0
    ? Math.round(
        contracts.reduce((sum, c) => {
          const days = (c.lockEndBlock - c.currentBlock) / 144;
          return sum + (days > 0 ? days : 0);
        }, 0) / contracts.filter(c => (c.lockEndBlock - c.currentBlock) > 0).length || 1
      )
    : 0;

  const unlockedPercent = contracts.length > 0
    ? Math.round((contracts.filter(c => c.lockEndBlock <= c.currentBlock).length / contracts.length) * 100)
    : 0;

  return (
    <>
      {!contractsLoaded ? (
        <StatsGrid>
          {[0, 1, 2].map(i => (
            <StatCard key={i}>
              <StatSkeleton />
              <StatLabelSkeleton />
            </StatCard>
          ))}
        </StatsGrid>
      ) : (
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
      )}

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
          <AnalyticsLabel>Total Withdrawn/Cancelled</AnalyticsLabel>
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

      {/* Milestone Notifications Section */}
      <TransactionSection id="milestone-notifications">
        <SectionTitle>📲 Deposit Milestone Notifications</SectionTitle>
        <Description>
          Get notified when your deposits reach certain lock percentages
        </Description>

        {permission === 'default' && (
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={onRequestPermission}
              style={{
                padding: '10px 20px',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              🔔 Enable Browser Notifications
            </button>
          </div>
        )}

        {permission === 'denied' && (
          <MessageBox $type="error">
            Notifications blocked. Please enable in browser settings.
          </MessageBox>
        )}

        {permission === 'granted' && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginRight: '12px' }}>
                Notify at milestones:
              </span>
              {[25, 50, 75, 100].map(m => (
                <label key={m} style={{ display: 'inline-flex', alignItems: 'center', marginRight: '16px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={milestones.includes(m)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSetMilestones([...milestones, m].sort((a, b) => a - b));
                      } else {
                        onSetMilestones(milestones.filter(x => x !== m));
                      }
                    }}
                    style={{ marginRight: '6px' }}
                  />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>{m}%</span>
                </label>
              ))}
            </div>

            {notifications.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                    Recent notifications: {notifications.length}
                  </span>
                  <button
                    onClick={onClearNotifications}
                    style={{
                      padding: '4px 12px',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.7)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Clear All
                  </button>
                </div>
                {notifications.slice(-3).reverse().map((n, i) => {
                  const isExpired = n.type === 'expired';
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        background: isExpired ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>
                        {isExpired
                          ? <>🔓 Lock expired! {n.address.slice(0, 12)}... is now withdrawable</>
                          : <>📬 {n.address.slice(0, 12)}... reached {n.percent}%</>
                        }
                      </span>
                      <button
                        onClick={() => onDismissNotification(notifications.length - 1 - i)}
                        style={{
                          padding: '2px 8px',
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.5)',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </TransactionSection>
    </>
  );
}
