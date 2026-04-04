import { useState } from 'react';
import styled from 'styled-components';
import { ThemeProvider } from './context/ThemeContext';
import { NetworkProvider } from './context/NetworkContext';
import { WalletProvider } from './context/WalletContext';
import SafeDelayForm from './components/SafeDelayForm';
import SafeDelayMultiSigForm from './components/SafeDelayMultiSigForm';
import Dashboard from './components/Dashboard';
import SafeDelayManagerDashboard from './components/SafeDelayManagerDashboard';
import Header from './components/Header';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  background: ${({ $active }) => ($active ? 'var(--accent)' : 'var(--bg-tertiary)')};
  color: var(--text-primary);
  transition: all 0.2s;

  &:hover {
    background: ${({ $active }) => ($active ? 'var(--accent-hover)' : 'var(--bg-hover)')};
  }
`;

type TabType = 'create' | 'multisig' | 'dashboard' | 'manager';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('create');

  return (
    <NetworkProvider>
      <WalletProvider>
        <Container>
          <Header />
          <TabContainer>
            <Tab 
              $active={activeTab === 'create'} 
              onClick={() => setActiveTab('create')}
            >
              Create SafeDelay
            </Tab>
            <Tab 
              $active={activeTab === 'multisig'} 
              onClick={() => setActiveTab('multisig')}
            >
              Create MultiSig
            </Tab>
            <Tab 
              $active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </Tab>
            <Tab 
              $active={activeTab === 'manager'} 
              onClick={() => setActiveTab('manager')}
            >
              Manager Registry
            </Tab>
          </TabContainer>
          
          {activeTab === 'create' && <SafeDelayForm />}
          {activeTab === 'multisig' && <SafeDelayMultiSigForm />}
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'manager' && <SafeDelayManagerDashboard />}
        </Container>
      </WalletProvider>
    </NetworkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;