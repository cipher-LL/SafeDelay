import { useEffect, useCallback } from 'react';

/**
 * Hook to warn users before they leave the page with unsaved form data.
 * Also returns a `warnIfDirty` helper for tab/SPA navigation within the app.
 */
export function useFormNavigationWarning(isDirty: boolean, message = 'You have unsaved changes. Are you sure you want to leave?') {
  // Handle browser/tab close and back-navigation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Most browsers still show this even though the standard doesn't guarantee it
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, message]);

  /**
   * Call this during your navigation handler (e.g. tab switch).
   * Returns true if navigation should be blocked, false if it should proceed.
   */
  const warnIfDirty = useCallback((proceed: () => void): boolean => {
    if (!isDirty) {
      proceed();
      return false;
    }
    const confirmed = window.confirm(message);
    if (confirmed) {
      proceed();
    }
    return !confirmed; // true = blocked
  }, [isDirty, message]); // eslint-disable-line react-hooks/exhaustive-deps

  return { warnIfDirty };
}
