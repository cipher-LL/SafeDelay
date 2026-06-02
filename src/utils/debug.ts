// Debug utility - silences verbose logging in production
// Enable with: localStorage.setItem('DEBUG', '1') in browser console

const isDebugEnabled = (): boolean => {
  try {
    return localStorage.getItem('DEBUG') === '1';
  } catch {
    return false;
  }
};

export const debug = {
  log: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    // Errors are always shown - they're important
    console.error(...args);
  },
};

/**
 * Conditional debug logger with prefix
 * Usage: debugLog('useWifSigner', 'message', data)
 */
export function debugLog(prefix: string, ...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(`[${prefix}]`, ...args);
  }
}

export default debug;