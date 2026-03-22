import { useState, useCallback } from 'react';

interface WalletBackup {
  version: string;
  exportedAt: number;
  addresses: Array<{
    address: string;
    label?: string;
    type: 'single' | 'multisig';
    pubkeyHash?: string;
    owners?: string[];
  }>;
  settings: Record<string, unknown>;
}

const BACKUP_STORAGE_KEY = 'safedelay_wallet_backup';

/**
 * Generate a random salt for AES-GCM
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**


 * Derive a key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with password using AES-GCM
 */
async function encryptWithPassword(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = generateSalt();
  const iv = generateSalt();
  const key = await deriveKey(password, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(data)
  );
  
  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data with password using AES-GCM
 */
async function decryptWithPassword(encryptedData: string, password: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 32);
  const encrypted = combined.slice(32);
  
  const key = await deriveKey(password, new Uint8Array(salt));
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: (iv as Uint8Array).buffer as ArrayBuffer },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

export function useWalletBackup(getWalletData: () => WalletBackup) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  /**
   * Export wallet data as JSON
   */
  const exportBackup = useCallback(async (password?: string): Promise<string | null> => {
    setExporting(true);
    clearMessages();
    
    try {
      const data = getWalletData();
      const jsonStr = JSON.stringify(data, null, 2);
      
      let exportData: string;
      if (password && password.length > 0) {
        exportData = await encryptWithPassword(jsonStr, password);
      } else {
        exportData = jsonStr;
      }
      
      // Create and download file
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safedelay-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccess('Wallet exported successfully!');
      return exportData;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Export failed';
      setError(errorMsg);
      console.error('Export error:', e);
      return null;
    } finally {
      setExporting(false);
    }
  }, [getWalletData, clearMessages]);

  /**
   * Import wallet data from backup file
   */
  const importBackup = useCallback(async (file: File, password?: string): Promise<WalletBackup | null> => {
    setImporting(true);
    clearMessages();
    
    try {
      const text = await file.text();
      
      let jsonStr: string;
      let isEncrypted = false;
      
      // Check if encrypted (base64 with salt/iv structure)
      try {
        const testDecode = atob(text.slice(0, 50));
        if (testDecode.length >= 32) {
          // Likely encrypted
          isEncrypted = true;
        }
      } catch {
        // Not base64, treat as plain JSON
      }
      
      if (isEncrypted) {
        if (!password) {
          throw new Error('Password required for encrypted backup');
        }
        jsonStr = await decryptWithPassword(text, password);
      } else {
        jsonStr = text;
      }
      
      const data = JSON.parse(jsonStr) as WalletBackup;
      
      // Validate backup structure
      if (!data.version || !data.exportedAt || !Array.isArray(data.addresses)) {
        throw new Error('Invalid backup file format');
      }
      
      // Restore labels to localStorage
      const labels: Array<{ address: string; label: string; createdAt: number }> = [];
      data.addresses.forEach(addr => {
        if (addr.label) {
          labels.push({
            address: addr.address,
            label: addr.label,
            createdAt: data.exportedAt,
          });
        }
      });
      
      if (labels.length > 0) {
        const existingLabels = localStorage.getItem('safedelay_wallet_labels');
        const existing = existingLabels ? JSON.parse(existingLabels) : [];
        const merged = [...existing];
        
        labels.forEach(newLabel => {
          const existingIdx = merged.findIndex(
            l => l.address.toLowerCase() === newLabel.address.toLowerCase()
          );
          if (existingIdx >= 0) {
            merged[existingIdx] = newLabel;
          } else {
            merged.push(newLabel);
          }
        });
        
        localStorage.setItem('safedelay_wallet_labels', JSON.stringify(merged));
      }
      
      setSuccess(`Successfully imported ${data.addresses.length} wallet(s)!`);
      return data;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Import failed';
      setError(errorMsg);
      console.error('Import error:', e);
      return null;
    } finally {
      setImporting(false);
    }
  }, [clearMessages]);

  /**
   * Quick backup to localStorage (auto-save style)
   */
  const quickBackup = useCallback(() => {
    try {
      const data = getWalletData();
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(data));
      setSuccess('Quick backup saved to browser storage');
    } catch (e) {
      setError('Quick backup failed');
    }
  }, [getWalletData]);

  /**
   * Restore from localStorage quick backup
   */
  const quickRestore = useCallback((): WalletBackup | null => {
    try {
      const stored = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored) as WalletBackup;
    } catch {
      return null;
    }
  }, []);

  return {
    exportBackup,
    importBackup,
    quickBackup,
    quickRestore,
    exporting,
    importing,
    error,
    success,
    clearMessages,
  };
}