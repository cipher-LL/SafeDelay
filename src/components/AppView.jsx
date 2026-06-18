import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance, useChainId, useSwitchChain } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACT_CONFIG } from '../config'
import WalletButton from './WalletButton'

function AppView({ onBack }) {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [depositAmount, setDepositAmount] = useState('')
  const [txStatus, setTxStatus] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [deposits, setDeposits] = useState([])

  const handleConnect = (connector) => {
    setErrorMessage(null)
    connect({ connector })
  }

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setErrorMessage('Please enter a valid deposit amount')
      return
    }

    setTxStatus('pending')
    setErrorMessage(null)
    setTxHash(null)

    try {
      console.log('Deposit amount:', depositAmount)
      console.log('Contract:', CONTRACT_CONFIG.address)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      setTxStatus('success')
      setTxHash('simulated_tx_hash_' + Date.now())
      
      setDeposits(prev => [...prev, {
        id: Date.now(),
        amount: depositAmount,
        status: 'pending_withdrawal',
        createdAtBlock: 850000 + Math.floor(Math.random() * 1000)
      }])
      
      setDepositAmount('')
    } catch (err) {
      console.error('Deposit error:', err)
      setTxStatus('error')
      setErrorMessage(err.message || 'Transaction failed')
    }
  }

  const handleSwitchChain = (chain) => {
    switchChain({ chainId: chain.id })
  }

  if (!isConnected) {
    return <ConnectWalletView
      connectors={connectors}
      error={error}
      chainId={chainId}
      onConnect={handleConnect}
      onSwitchChain={handleSwitchChain}
      onBack={onBack}
    />
  }

  return (
    <div className="app-view">
      <header className="app-header">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <h1>SafeDelay</h1>
        <div className="header-actions">
          <span className="chain-badge-small">
            {chainId === 1001 ? 'Chipnet' : 'Mainnet'}
          </span>
          <button className="btn btn-secondary btn-small" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      </header>

      <main className="app-main">
        <WalletInfo address={address} balance={balance} />
        <DepositPanel
          depositAmount={depositAmount}
          onDepositAmountChange={setDepositAmount}
          txStatus={txStatus}
          txHash={txHash}
          errorMessage={errorMessage}
          onDeposit={handleDeposit}
        />
        <DepositsList deposits={deposits} />
      </main>
    </div>
  )
}

function ConnectWalletView({ connectors, error, chainId, onConnect, onSwitchChain, onBack }) {
  return (
    <div className="app-view">
      <header className="app-header">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <h1>SafeDelay App</h1>
      </header>
      <main className="app-main">
        <div className="connect-wallet">
          <div className="connect-icon">🔗</div>
          <h2>Connect Your Wallet</h2>
          <p>Connect your Bitcoin Cash wallet to interact with the SafeDelay contract.</p>
          
          <ChainSelector chainId={chainId} onSwitchChain={onSwitchChain} />

          <div className="wallet-list">
            <h3>Select Wallet</h3>
            {connectors.map((connector) => (
              <WalletButton
                key={connector.uid}
                connector={connector}
                onClick={() => onConnect(connector)}
              />
            ))}
          </div>

          {error && (
            <div className="error-message">
              {error.message || 'Failed to connect wallet'}
            </div>
          )}

          <div className="connect-note">
            <p>Make sure you have a Bitcoin Cash wallet installed:</p>
            <ul>
              <li><a href="https://walletconnect.com/" target="_blank" rel="noopener noreferrer">WalletConnect</a> - Use with any Web3 wallet</li>
              <li><a href="https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn" target="_blank" rel="noopener noreferrer">MetaMask</a> - With BCH configuration</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}

function ChainSelector({ chainId, onSwitchChain }) {
  return (
    <div className="chain-selector">
      <span>Network: </span>
      {chainId === 1001 ? (
        <span className="chain-badge chipnet">Chipnet (Testnet)</span>
      ) : chainId === 1 ? (
        <span className="chain-badge mainnet">Mainnet</span>
      ) : (
        <span className="chain-badge">Select network</span>
      )}
      <div className="chain-buttons">
        <button 
          className={`chain-btn ${chainId === 1 ? 'active' : ''}`}
          onClick={() => onSwitchChain({ id: 1 })}
        >
          Mainnet
        </button>
        <button 
          className={`chain-btn ${chainId === 1001 ? 'active' : ''}`}
          onClick={() => onSwitchChain({ id: 1001 })}
        >
          Chipnet
        </button>
      </div>
    </div>
  )
}

function WalletInfo({ address, balance }) {
  return (
    <div className="wallet-info">
      <div className="wallet-address">
        <span className="label">Connected:</span>
        <span className="address">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
      </div>
      <div className="wallet-balance">
        <span className="label">Balance:</span>
        <span className="balance">{balance ? formatEther(balance.value) : '0'} BCH</span>
      </div>
    </div>
  )
}

function DepositPanel({ depositAmount, onDepositAmountChange, txStatus, txHash, errorMessage, onDeposit }) {
  return (
    <div className="deposit-panel">
      <h2>Deposit BCH</h2>
      <p className="deposit-description">
        Deposit BCH onto an NFT protected by a time lock. 
        Set your withdrawal delay below.
      </p>
      
      <div className="deposit-form">
        <div className="form-group">
          <label>Amount (BCH)</label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            placeholder="0.0"
            value={depositAmount}
            onChange={(e) => onDepositAmountChange(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Block Delay</label>
          <select defaultValue="10">
            <option value="10">10 blocks (~1.5 hours)</option>
            <option value="100">100 blocks (~15 hours)</option>
            <option value="500">500 blocks (~3 days)</option>
            <option value="1000">1000 blocks (~7 days)</option>
          </select>
        </div>

        <button 
          className="btn btn-primary btn-large"
          onClick={onDeposit}
          disabled={txStatus === 'pending'}
        >
          {txStatus === 'pending' ? 'Processing...' : 'Deposit'}
        </button>

        <TxStatus txStatus={txStatus} txHash={txHash} errorMessage={errorMessage} />
      </div>
    </div>
  )
}

function TxStatus({ txStatus, txHash, errorMessage }) {
  if (txStatus === 'pending') {
    return (
      <div className="tx-status pending">
        <div className="spinner"></div>
        <span>Waiting for wallet...</span>
      </div>
    )
  }

  if (txStatus === 'success' && txHash) {
    return (
      <div className="tx-status success">
        <span>✓ Deposit successful!</span>
        <a 
          href={`https://blockchair.com/bitcoin-cash/tx/${txHash}`} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          View transaction →
        </a>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="tx-status error">
        <span>✗ {errorMessage}</span>
      </div>
    )
  }

  return null
}

function DepositsList({ deposits }) {
  if (deposits.length === 0) return null

  return (
    <div className="deposits-panel">
      <h2>Your Deposits</h2>
      <div className="deposits-list">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="deposit-card">
            <div className="deposit-header">
              <span className="deposit-amount">{deposit.amount} BCH</span>
              <span className={`deposit-status ${deposit.status}`}>
                {deposit.status === 'pending_withdrawal' ? '🔒 Locked' : '✓ Withdrawn'}
              </span>
            </div>
            <div className="deposit-info">
              <span>Created at block {deposit.createdAtBlock}</span>
              <span>10 blocks remaining</span>
            </div>
            <div className="deposit-progress">
              <div className="progress-bar" style={{width: '20%'}}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AppView
