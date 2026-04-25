import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';
import { useTheme } from '../context/ThemeContext';

const NOTIFICATIONS_KEY = 'safedelay_milestone_notifications';

const HeaderContainer = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  margin-bottom: 30px;
  border-bottom: 1px solid var(--border);
`;

const Logo = styled.h1`
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent), #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Controls = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
`;

const ThemeToggle = styled.button`
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 20px;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-hover);
  }
`;

const NetworkToggle = styled.button<{ $isTestnet: boolean }>`
  padding: 8px 16px;
  border: 1px solid ${({ $isTestnet }) => ($isTestnet ? 'var(--success)' : 'var(--warning)')};
  border-radius: 20px;
  background: ${({ $isTestnet }) => ($isTestnet ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)')};
  color: ${({ $isTestnet }) => ($isTestnet ? 'var(--success)' : 'var(--warning)')};
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    background: ${({ $isTestnet }) => ($isTestnet ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)')};
  }
`;

const ConnectButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-weight: 600;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const WalletButton = styled(ConnectButton)`
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  font-size: 13px;
  padding: 8px 16px;

  &:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.3);
  }
`;

const WalletInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
`;

const Address = styled.span`
  font-family: monospace;
  font-size: 14px;
`;

const ProviderBadge = styled.span<{ $hasSigner: boolean }>`
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: ${({ $hasSigner }) => $hasSigner ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'};
  color: ${({ $hasSigner }) => $hasSigner ? '#10b981' : '#f59e0b'};
`;

const ConnectInput = styled.input`
  padding: 8px 12px;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
  width: 200px;

  &::placeholder {
    color: var(--text-muted);
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #ef4444;
  max-width: 200px;
`;

const BellButton = styled.button`
  position: relative;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 18px;
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }
`;

const NotificationBadge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 700;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export default function Header() {
  const { network, setNetwork } = useNetwork();
  const { wallet, connect, connectManual, disconnect, hasSigner } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [inputAddress, setInputAddress] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  // Load notification count from milestone notifications localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // notifications is stored inside the milestone data
        if (data.milestones) {
          // Count total unread-like: use notifications array length if present
          // Fall back to counting deposits with unnotified milestones
          const count = (data.milestones as Array<{notifiedMilestones?: number[]}>)
            .filter(m => m.notifiedMilestones && m.notifiedMilestones.length > 0)
            .length;
          setNotificationCount(count);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleNetwork = () => {
    setNetwork(network === 'mainnet' ? 'testnet' : 'mainnet');
  };

  const handleWalletConnect = async () => {
    setConnectError(null);
    try {
      await connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setConnectError(msg.length > 40 ? msg.slice(0, 40) + '...' : msg);
    }
  };

  const handleManualConnect = () => {
    const addr = inputAddress.trim();
    if (!addr) return;
    // Use a placeholder PKH for manual mode (no signing will work in this mode)
    connectManual(addr, '0000000000000000000000000000000000000000');
    setInputAddress('');
    setConnectError(null);
  };

  return (
    <HeaderContainer>
      <Logo>🔒 SafeDelay</Logo>
      <Controls>
        <ThemeToggle onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </ThemeToggle>
        {notificationCount > 0 && (
          <BellButton
            onClick={() => {
              // Scroll to milestone section in Dashboard
              const el = document.getElementById('milestone-notifications');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            title={`${notificationCount} active deposit${notificationCount !== 1 ? 's' : ''} with milestone tracking`}
          >
            🔔
            <NotificationBadge>{notificationCount > 9 ? '9+' : notificationCount}</NotificationBadge>
          </BellButton>
        )}
        <NetworkToggle $isTestnet={network === 'testnet'} onClick={toggleNetwork}>
          {network === 'testnet' ? '🧪 Testnet' : '💰 Mainnet'}
        </NetworkToggle>
        {wallet.connected ? (
          <WalletInfo>
            <ProviderBadge $hasSigner={hasSigner}>
              {hasSigner ? '🔐 Wallet' : '📖 Read-only'}
            </ProviderBadge>
            <Address>{wallet.address?.slice(0, 8)}...{wallet.address?.slice(-4)}</Address>
            <ConnectButton onClick={disconnect} style={{ padding: '4px 12px', fontSize: '12px' }}>Disconnect</ConnectButton>
          </WalletInfo>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <WalletButton onClick={handleWalletConnect} disabled={connectError !== null}>
              🔗 Wallet
            </WalletButton>
            <ConnectInput
              placeholder="BCH address (read-only)"
              value={inputAddress}
              onChange={(e) => { setInputAddress(e.target.value); setConnectError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleManualConnect()}
            />
            <ConnectButton onClick={handleManualConnect} style={{ padding: '8px 16px', fontSize: '13px' }}>
              Add
            </ConnectButton>
            {connectError && <ErrorText>{connectError}</ErrorText>}
          </div>
        )}
      </Controls>
    </HeaderContainer>
  );
}
