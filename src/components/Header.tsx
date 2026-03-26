import { useState } from 'react';
import styled from 'styled-components';
import { useNetwork } from '../context/NetworkContext';
import { useWallet } from '../context/WalletContext';

const HeaderContainer = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  margin-bottom: 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Logo = styled.h1`
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Controls = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
`;

const NetworkToggle = styled.button<{ $isTestnet: boolean }>`
  padding: 8px 16px;
  border: 1px solid ${({ $isTestnet }) => ($isTestnet ? '#10b981' : '#f59e0b')};
  border-radius: 20px;
  background: ${({ $isTestnet }) => ($isTestnet ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)')};
  color: ${({ $isTestnet }) => ($isTestnet ? '#10b981' : '#f59e0b')};
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
  background: #4f46e5;
  color: white;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    background: #4338ca;
  }
`;

const WalletInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
`;

const Address = styled.span`
  font-family: monospace;
  font-size: 14px;
`;

const ConnectInput = styled.input`
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 14px;
  width: 200px;

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
`;

export default function Header() {
  const { network, setNetwork } = useNetwork();
  const { wallet, connect, disconnect } = useWallet();
  const [inputAddress, setInputAddress] = useState('');

  const toggleNetwork = () => {
    setNetwork(network === 'mainnet' ? 'testnet' : 'mainnet');
  };

  const handleConnect = () => {
    if (inputAddress) {
      connect(inputAddress);
      setInputAddress('');
    }
  };

  return (
    <HeaderContainer>
      <Logo>🔒 SafeDelay</Logo>
      <Controls>
        <NetworkToggle $isTestnet={network === 'testnet'} onClick={toggleNetwork}>
          {network === 'testnet' ? '🧪 Testnet' : '💰 Mainnet'}
        </NetworkToggle>
        {wallet.connected ? (
          <WalletInfo>
            <Address>{wallet.address?.slice(0, 8)}...{wallet.address?.slice(-4)}</Address>
            <ConnectButton onClick={disconnect}>Disconnect</ConnectButton>
          </WalletInfo>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <ConnectInput
              placeholder="Enter BCH address"
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
            <ConnectButton onClick={handleConnect}>Connect</ConnectButton>
          </div>
        )}
      </Controls>
    </HeaderContainer>
  );
}
