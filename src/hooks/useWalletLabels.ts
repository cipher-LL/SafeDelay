import { useState, useEffect, useCallback } from 'react';
import { debug } from '../utils/debug';

interface WalletLabel {
  address: string;
  label: string;
  createdAt: number;
}

const STORAGE_KEY = 'safedelay_wallet_labels';

export function useWalletLabels() {
  const [labels, setLabels] = useState<WalletLabel[]>([]);

  // Load labels from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setLabels(JSON.parse(stored));
      }
    } catch (e) {
      debug.error('Failed to load wallet labels:', e);
    }
  }, []);

  // Save labels to localStorage whenever they change
  const saveLabels = useCallback((newLabels: WalletLabel[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLabels));
      setLabels(newLabels);
    } catch (e) {
      debug.error('Failed to save wallet labels:', e);
    }
  }, []);

  // Set a label for an address
  const setLabel = useCallback((address: string, label: string) => {
    const normalizedAddress = address.toLowerCase();
    const existing = labels.find(l => l.address.toLowerCase() === normalizedAddress);
    
    if (existing) {
      // Update existing label
      const newLabels = labels.map(l => 
        l.address.toLowerCase() === normalizedAddress 
          ? { ...l, label }
          : l
      );
      saveLabels(newLabels);
    } else {
      // Add new label
      saveLabels([...labels, { address, label, createdAt: Date.now() }]);
    }
  }, [labels, saveLabels]);

  // Remove a label
  const removeLabel = useCallback((address: string) => {
    const normalizedAddress = address.toLowerCase();
    const newLabels = labels.filter(l => l.address.toLowerCase() !== normalizedAddress);
    saveLabels(newLabels);
  }, [labels, saveLabels]);

  // Get label for an address
  const getLabel = useCallback((address: string): string | undefined => {
    const normalizedAddress = address.toLowerCase();
    return labels.find(l => l.address.toLowerCase() === normalizedAddress)?.label;
  }, [labels]);

  return { labels, setLabel, removeLabel, getLabel };
}
