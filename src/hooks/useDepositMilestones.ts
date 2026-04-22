import { useState, useEffect, useCallback, useRef } from 'react';
import { debug } from '../utils/debug';

export interface DepositMilestone {
  address: string;
  initialBlock: number;
  lockEndBlock: number;
  currentBlock: number;
  notifiedMilestones: number[];
}

export interface MilestoneNotification {
  address: string;
  percent: number;
  remainingBlocks: number;
  timestamp: number;
}

const STORAGE_KEY = 'safedelay_milestone_notifications';
const DEFAULT_MILESTONES = [25, 50, 75, 100];

// Track per-milestone notification block numbers to handle re-visits properly
interface UnlockTracking {
  notifiedMilestones: number[];
  notifiedAtBlock: Record<number, number>; // milestone → block when notified
}

interface StoredData {
  milestones: DepositMilestone[];
  unlockTracking: Record<string, UnlockTracking>;
}

function loadFromStorage(): StoredData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate old format if needed
      if (parsed.lastNotified && !parsed.unlockTracking) {
        const unlockTracking: Record<string, UnlockTracking> = {};
        for (const [addr, notifiedList] of Object.entries(parsed.lastNotified as Record<string, number[]>)) {
          unlockTracking[addr] = {
            notifiedMilestones: notifiedList as number[],
            notifiedAtBlock: {}
          };
        }
        return { milestones: parsed.milestones || [], unlockTracking };
      }
      return parsed;
    }
  } catch (e) {
    debug.error('[useDepositMilestones] Failed to load from storage:', e);
  }
  return { milestones: [], unlockTracking: {} };
}

function saveToStorage(data: StoredData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    debug.error('[useDepositMilestones] Failed to save to storage:', e);
  }
}

export function useDepositMilestones(enabled: boolean = true) {
  const [deposits, setDeposits] = useState<DepositMilestone[]>([]);
  const [milestones, setMilestones] = useState<number[]>(DEFAULT_MILESTONES);
  const [notifications, setNotifications] = useState<MilestoneNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const unlockTrackingRef = useRef<Record<string, UnlockTracking>>({});

  // Load saved state on mount
  useEffect(() => {
    const stored = loadFromStorage();
    setDeposits(stored.milestones);
    unlockTrackingRef.current = stored.unlockTracking || {};
  }, []);

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      return perm === 'granted';
    }
    return false;
  }, []);

  // Add a new deposit to track
  const addDeposit = useCallback((address: string, lockEndBlock: number, currentBlock: number) => {
    const initialBlock = currentBlock;
    const totalBlocks = lockEndBlock - initialBlock;

    // Skip if no lock period
    if (totalBlocks <= 0) return;

    setDeposits(prev => {
      // Check if already tracking this address
      const existing = prev.find(d => d.address === address);
      if (existing) {
        // Update existing deposit (reset notified milestones on re-deposit)
        return prev.map(d =>
          d.address === address
            ? { ...d, currentBlock, lockEndBlock, notifiedMilestones: [] }
            : d
        );
      }

      // Add new deposit
      const newDeposit: DepositMilestone = {
        address,
        initialBlock,
        lockEndBlock,
        currentBlock,
        notifiedMilestones: [],
      };

      const updated = [...prev, newDeposit];

      // Initialize unlock tracking
      unlockTrackingRef.current[address] = { notifiedMilestones: [], notifiedAtBlock: {} };

      // Save to storage
      saveToStorage({ milestones: updated, unlockTracking: unlockTrackingRef.current });

      return updated;
    });
  }, []);

  // Update current block height
  const updateBlockHeight = useCallback((currentBlock: number) => {
    setDeposits(prev => {
      let newNotifications: MilestoneNotification[] = [];

      const updated = prev.map(deposit => {
        const totalBlocks = deposit.lockEndBlock - deposit.initialBlock;
        const elapsedBlocks = currentBlock - deposit.initialBlock;
        const percentComplete = totalBlocks > 0
          ? Math.floor((elapsedBlocks / totalBlocks) * 100)
          : 100;

        const tracking = unlockTrackingRef.current[deposit.address] || { notifiedMilestones: [], notifiedAtBlock: {} };

        // Find milestones that should fire — either newly reached, or reached but never notified
        const shouldNotify: number[] = [];

        for (const m of milestones) {
          if (percentComplete >= m) {
            const alreadyNotifiedAtBlock = tracking.notifiedAtBlock[m];
            // Notify if: never notified (no block record), OR already unlocked (currentBlock >= lockEndBlock) but we haven't notified since unlocking
            const neverNotified = alreadyNotifiedAtBlock === undefined;
            const wasUnlockedWhenNotified = alreadyNotifiedAtBlock !== undefined && alreadyNotifiedAtBlock < deposit.lockEndBlock;
            const stillUnlockedAndNotRecent = alreadyNotifiedAtBlock !== undefined
              && alreadyNotifiedAtBlock >= deposit.lockEndBlock
              && currentBlock >= deposit.lockEndBlock;

            if (neverNotified || wasUnlockedWhenNotified || stillUnlockedAndNotRecent) {
              shouldNotify.push(m);
            }
          }
        }

        if (shouldNotify.length > 0) {
          shouldNotify.forEach(m => {
            newNotifications.push({
              address: deposit.address,
              percent: m,
              remainingBlocks: Math.max(0, deposit.lockEndBlock - currentBlock),
              timestamp: Date.now(),
            });
          });
        }

        // Update notified milestones and block records
        const newNotifiedMilestones = [...tracking.notifiedMilestones];
        const newNotifiedAtBlock = { ...tracking.notifiedAtBlock };

        for (const m of shouldNotify) {
          if (!newNotifiedMilestones.includes(m)) {
            newNotifiedMilestones.push(m);
          }
          newNotifiedAtBlock[m] = currentBlock;
        }

        // If fully unlocked, mark all milestones
        if (percentComplete >= 100) {
          for (const m of milestones) {
            if (!newNotifiedMilestones.includes(m)) {
              newNotifiedMilestones.push(m);
              newNotifiedAtBlock[m] = currentBlock;
            }
          }
        }

        // Update tracking ref
        unlockTrackingRef.current[deposit.address] = {
          notifiedMilestones: newNotifiedMilestones,
          notifiedAtBlock: newNotifiedAtBlock
        };

        return {
          ...deposit,
          currentBlock,
          notifiedMilestones: newNotifiedMilestones,
        };
      });

      // Save updated tracking to storage
      saveToStorage({
        milestones: updated,
        unlockTracking: unlockTrackingRef.current
      });

      // Add new notifications to state
      if (newNotifications.length > 0) {
        setNotifications(prev => [...prev, ...newNotifications]);

        // Send browser notification if permitted
        if (enabled && permission === 'granted') {
          newNotifications.forEach(n => {
            const body = n.percent === 100
              ? 'Your deposit is now fully unlocked! You can withdraw.'
              : `Your deposit has reached ${n.percent}% of lock duration (${n.remainingBlocks} blocks remaining)`;

            new Notification('SafeDelay Milestone', {
              body,
              icon: '/favicon.ico',
              tag: `milestone-${n.address}-${n.percent}`,
            });
          });
        }
      }

      return updated;
    });
  }, [milestones, enabled, permission]);

  // Configure which milestones to notify at
  const setMilestoneTargets = useCallback((targets: number[]) => {
    // Filter to valid percentages (1-100) and sort
    const valid = targets.filter(t => t >= 1 && t <= 100).sort((a, b) => a - b);
    setMilestones(valid);
  }, []);

  // Remove a deposit from tracking
  const removeDeposit = useCallback((address: string) => {
    setDeposits(prev => {
      const updated = prev.filter(d => d.address !== address);
      const newTracking = { ...unlockTrackingRef.current };
      delete newTracking[address];
      unlockTrackingRef.current = newTracking;
      saveToStorage({ milestones: updated, unlockTracking: newTracking });
      return updated;
    });
  }, []);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Dismiss a specific notification
  const dismissNotification = useCallback((index: number) => {
    setNotifications(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Get progress for a specific deposit
  const getProgress = useCallback((address: string): number => {
    const deposit = deposits.find(d => d.address === address);
    if (!deposit) return 0;

    const totalBlocks = deposit.lockEndBlock - deposit.initialBlock;
    if (totalBlocks <= 0) return 100;

    const elapsedBlocks = deposit.currentBlock - deposit.initialBlock;
    return Math.min(100, Math.floor((elapsedBlocks / totalBlocks) * 100));
  }, [deposits]);

  return {
    deposits,
    notifications,
    milestones,
    permission,
    requestPermission,
    addDeposit,
    updateBlockHeight,
    setMilestoneTargets: setMilestoneTargets,
    removeDeposit,
    clearNotifications,
    dismissNotification,
    getProgress,
  };
}