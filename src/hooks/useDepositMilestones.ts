import { useState, useEffect, useCallback } from 'react';

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

interface StoredData {
  milestones: DepositMilestone[];
  lastNotified: Record<string, number[]>;
}

function loadFromStorage(): StoredData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[useDepositMilestones] Failed to load from storage:', e);
  }
  return { milestones: [], lastNotified: {} };
}

function saveToStorage(data: StoredData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[useDepositMilestones] Failed to save to storage:', e);
  }
}

export function useDepositMilestones(enabled: boolean = true) {
  const [deposits, setDeposits] = useState<DepositMilestone[]>([]);
  const [milestones, setMilestones] = useState<number[]>(DEFAULT_MILESTONES);
  const [notifications, setNotifications] = useState<MilestoneNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Load saved state on mount
  useEffect(() => {
    const stored = loadFromStorage();
    setDeposits(stored.milestones);
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
        // Update existing deposit
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
      
      // Save to storage
      saveToStorage({ milestones: updated, lastNotified: {} });
      
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
        const percentComplete = Math.floor((elapsedBlocks / totalBlocks) * 100);
        
        // Find which milestones have been reached
        const reachedMilestones = milestones.filter(m => 
          percentComplete >= m && 
          !deposit.notifiedMilestones.includes(m)
        );

        if (reachedMilestones.length > 0) {
          // Create notifications
          reachedMilestones.forEach(m => {
            newNotifications.push({
              address: deposit.address,
              percent: m,
              remainingBlocks: Math.max(0, deposit.lockEndBlock - currentBlock),
              timestamp: Date.now(),
            });
          });
        }

        // If fully unlocked (100%), mark all milestones as notified
        const newNotified = percentComplete >= 100 
          ? [...new Set([...deposit.notifiedMilestones, ...milestones])]
          : [...deposit.notifiedMilestones, ...reachedMilestones];

        return {
          ...deposit,
          currentBlock,
          notifiedMilestones: newNotified,
        };
      });

      // Save to storage
      saveToStorage({ 
        milestones: updated, 
        lastNotified: Object.fromEntries(
          updated.map(d => [d.address, d.notifiedMilestones])
        )
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
      saveToStorage({ milestones: updated, lastNotified: {} });
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