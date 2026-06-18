import { useState, useEffect } from 'react'

function WalletButton({ connector, onClick }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ;(async () => {
      const provider = await connector.getProvider()
      setReady(!!provider)
    })()
  }, [connector])

  return (
    <button className="wallet-option" onClick={onClick} disabled={!ready}>
      <span className="wallet-name">{connector.name}</span>
      {!ready && <span className="wallet-not-installed">Not installed</span>}
    </button>
  )
}

export default WalletButton
