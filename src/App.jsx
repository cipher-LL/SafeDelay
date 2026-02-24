import { useState } from 'react'
import './App.css'

function App() {
  const [view, setView] = useState('landing') // landing, app

  return (
    <div className="app">
      {view === 'landing' ? (
        <LandingPage onGetStarted={() => setView('app')} />
      ) : (
        <AppView onBack={() => setView('landing')} />
      )}
    </div>
  )
}

function LandingPage({ onGetStarted }) {
  return (
    <div className="landing">
      {/* Header */}
      <header className="landing-header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#14add4"/>
            <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>SafeDelay</span>
        </div>
        <nav>
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
          <a href="#security">Security</a>
        </nav>
        <button className="btn btn-primary" onClick={onGetStarted}>
          Launch App
        </button>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="badge">Bitcoin Cash</div>
          <h1>Time-Locked NFT Deposits with Emergency Protection</h1>
          <p>
            Deposit BCH onto NFTs with built-in time locks. Your funds are protected 
            by a configurable delay period, with emergency withdrawal access for peace of mind.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-large" onClick={onGetStarted}>
              Launch App
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="btn btn-secondary btn-large">
              View Contract
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">0</span>
              <span className="stat-label">Deposits</span>
            </div>
            <div className="stat">
              <span className="stat-value">0</span>
              <span className="stat-label">BCH Locked</span>
            </div>
            <div className="stat">
              <span className="stat-value">0</span>
              <span className="stat-label">NFTs Issued</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="nft-card">
            <div className="nft-card-header">
              <span className="nft-badge">NFT Deposit</span>
              <span className="nft-status locked">🔒 Locked</span>
            </div>
            <div className="nft-amount">1.00000000 BCH</div>
            <div className="nft-timer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4V8L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>100 blocks remaining</span>
            </div>
            <div className="nft-progress">
              <div className="nft-progress-bar" style={{width: '25%'}}></div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">01</div>
            <h3>Deposit BCH</h3>
            <p>Connect your wallet and deposit BCH onto a new NFT. The NFT is created and held in the contract.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-number">02</div>
            <h3>Start Withdrawal</h3>
            <p>When ready, initiate the withdrawal process. This enables the time-lock on your NFT.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-number">03</div>
            <h3>Wait & Withdraw</h3>
            <p>After the block delay passes, withdraw your BCH directly to your wallet. Or use emergency withdrawal anytime.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="features">
        <h2>Why Use SafeDelay?</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">⏰</div>
            <h3>Time-Locked Withdrawals</h3>
            <p>Configurable block delay prevents hasty decisions and adds an extra layer of security to your funds.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Emergency Access</h3>
            <p>Your designated emergency key can always withdraw funds, ensuring you never lose access to your money.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3>NFT-Based Deposits</h3>
            <p>Each deposit is represented as a unique NFT, making it easy to track and manage your time-locked funds.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Fast & Simple</h3>
            <p>No complicated setup. Connect your wallet, deposit, and your NFT is created instantly on Bitcoin Cash.</p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="security">
        <h2>Security Features</h2>
        <div className="security-list">
          <div className="security-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10" stroke="#14add4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="#14add4" strokeWidth="2"/>
            </svg>
            <div>
              <h4>Non-Custodial</h4>
              <p>You remain in control of your funds at all times. The contract only holds your deposits.</p>
            </div>
          </div>
          <div className="security-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10" stroke="#14add4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="#14add4" strokeWidth="2"/>
            </svg>
            <div>
              <h4>Configurable Delay</h4>
              <p>Set your own block delay period - from a few blocks to hundreds. You're in control.</p>
            </div>
          </div>
          <div className="security-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10" stroke="#14add4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="#14add4" strokeWidth="2"/>
            </svg>
            <div>
              <h4>Transparent Code</h4>
              <p>The CashScript contract is open source and verifiable. No hidden logic.</p>
            </div>
          </div>
          <div className="security-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10" stroke="#14add4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="#14add4" strokeWidth="2"/>
            </svg>
            <div>
              <h4>WalletConnect Support</h4>
              <p>Secure wallet connection via WalletConnect. No need to expose your private keys.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <h2>Ready to Get Started?</h2>
        <p>Connect your wallet and start depositing BCH with time-locked protection.</p>
        <button className="btn btn-primary btn-large" onClick={onGetStarted}>
          Launch App
        </button>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-content">
          <div className="footer-logo">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#14add4"/>
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>SafeDelay</span>
          </div>
          <p>© 2026 SafeDelay. Built on Bitcoin Cash.</p>
        </div>
      </footer>
    </div>
  )
}

function AppView({ onBack }) {
  return (
    <div className="app-view">
      <header className="app-header">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <h1>SafeDelay App</h1>
        <button className="btn btn-primary">Connect Wallet</button>
      </header>
      <main className="app-main">
        <div className="coming-soon">
          <div className="coming-soon-icon">🚧</div>
          <h2>App Coming Soon</h2>
          <p>We're building a beautiful interface for interacting with the SafeDelay contract.</p>
          <p>Check back soon!</p>
        </div>
      </main>
    </div>
  )
}

export default App
