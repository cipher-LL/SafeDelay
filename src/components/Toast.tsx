import React, { useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  /** Duration in ms before auto-dismiss (default 3500) */
  duration?: number;
}

let toastAddFn: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null;

export function showToast(message: string, type?: ToastMessage['type'], duration = 3500) {
  toastAddFn?.({ message, type, duration });
}

const slideIn = keyframes`
  from { transform: translateX(120%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const ToastContainerWrapper = styled.div`
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
`;

const ToastItem = styled.div<{ $type?: string }>`
  pointer-events: auto;
  padding: 0.7rem 1.1rem;
  border-radius: 10px;
  font-size: 0.875rem;
  max-width: 340px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  animation: ${slideIn} 0.25s ease-out;
  cursor: pointer;
  background: ${({ $type }) => {
    switch ($type) {
      case 'success': return 'rgba(39, 174, 96, 0.96)';
      case 'error': return 'rgba(231, 76, 60, 0.96)';
      case 'warning': return 'rgba(241, 196, 15, 0.96)';
      default: return 'rgba(79, 139, 196, 0.96)';
    }
  }};
  color: ${({ $type }) => ($type === 'warning' ? '#1a1a1a' : '#ffffff')};
  border: 1px solid ${({ $type }) => {
    switch ($type) {
      case 'success': return 'rgba(39, 174, 96, 0.4)';
      case 'error': return 'rgba(231, 76, 60, 0.4)';
      case 'warning': return 'rgba(241, 196, 15, 0.4)';
      default: return 'rgba(79, 139, 196, 0.4)';
    }
  }};
`;

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const addToast = React.useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...msg, id }]);
    const duration = msg.duration ?? 3500;
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => removeToast(id), duration));
    }
  }, [removeToast]);

  useEffect(() => {
    toastAddFn = addToast;
    return () => { toastAddFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <ToastContainerWrapper>
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          $type={toast.type || 'info'}
          onClick={() => removeToast(toast.id)}
          title="Click to dismiss"
        >
          {toast.message}
        </ToastItem>
      ))}
    </ToastContainerWrapper>
  );
};
