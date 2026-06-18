import { createConfig, http } from 'wagmi'
import { mainnet, chipnet } from 'wagmi/chains'
import { walletConnect, injected } from 'wagmi/connectors'

// WalletConnect project ID - get one at https://cloud.walletconnect.com/
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo'

export const wagmiConfig = createConfig({
  chains: [mainnet, chipnet],
  connectors: [
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
    [chipnet.id]: http(),
  },
})

// Contract configuration
export const CONTRACT_CONFIG = {
  // SafeDelay contract artifact - generated via `npx cashcompile contracts/SafeDelay.cash`
  // For now, use placeholder - replace with actual artifact after compilation
  address: import.meta.env.VITE_CONTRACT_ADDRESS || 'bitcoincash:pqnqu9zqwpw6zqyn3jkrmd35mh7e6vlt5rwnpr73rg',
  abi: [
    {
      "name": "deposit",
      "inputs": [{ "name": "userPk", "type": "pubkey" }],
      "outputs": [],
      "params": ["pubkey userPk"]
    },
    {
      "name": "startWithdraw",
      "inputs": [
        { "name": "memoryId", "type": "bytes" },
        { "name": "currentFlag", "type": "bytes1" },
        { "name": "s", "type": "sig" }
      ],
      "outputs": [],
      "params": ["bytes memoryId", "bytes1 currentFlag", "sig s"]
    },
    {
      "name": "withdraw",
      "inputs": [
        { "name": "memoryId", "type": "bytes" },
        { "name": "createdAtBlock", "type": "int" },
        { "name": "s", "type": "sig" }
      ],
      "outputs": [],
      "params": ["bytes memoryId", "int256 createdAtBlock", "sig s"]
    },
    {
      "name": "emergencyWithdraw",
      "inputs": [
        { "name": "memoryId", "type": "bytes" },
        { "name": "s", "type": "sig" }
      ],
      "outputs": [],
      "params": ["bytes memoryId", "sig s"]
    }
  ]
}