# SafeDelay

> ⚠️ **DEMO MODE — NO REAL BLOCKCHAIN INTERACTION**
>
> This application is a **proof-of-concept / demo**. All deposit, startWithdraw, and withdraw
> operations are fully simulated in-memory. No transactions are signed, no NFTs are created,
> and no funds are actually handled. See [Production Checklist](#production-checklist) below
> for what would be required for a real deployment.

A Bitcoin Cash CashScript contract for time-locked NFT deposits with emergency withdrawal protection.

## Overview

SafeDelay is a smart contract that allows users to deposit BCH onto NFTs with built-in time locks. The NFTs have a configurable block delay before withdrawal is enabled, providing an extra layer of security for your funds.

## Features

- ⏱️ **Time-Locked Withdrawals** - Configurable block delay prevents hasty decisions
- 🛡️ **Emergency Access** - Designated emergency key can always withdraw funds
- 🔐 **NFT-Based Deposits** - Each deposit is a unique NFT
- ⚡ **Fast & Simple** - Connect wallet, deposit, done

## Contract Parameters

- `userPkh` - User's public key hash for withdrawals
- `emergencyPkh` - Emergency public key hash for emergency withdrawals  
- `blockDelay` - Number of blocks to wait before withdrawal is enabled

## Tech Stack

- **CashScript** - Smart contract development
- **React + Vite** - Web UI
- **wagmi v2 + viem** - Ethereum-compatible wallet abstraction (used here for UI state)
- **WalletConnect** - Wallet connection (requires a real project ID for production use)

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set VITE_WALLETCONNECT_PROJECT_ID (see Environment Setup below)

# Start development server
npm run dev
```

### Environment Setup

**WalletConnect Project ID**

WalletConnect provides secure wallet connections. To use it in production:

1. Sign up at [cloud.walletconnect.com](https://cloud.walletconnect.com/)
2. Create a new project and copy your Project ID
3. Set `VITE_WALLETCONNECT_PROJECT_ID` in your `.env` file

> **Note:** The default value (`demo`) works for local testing but has rate limits and may not support all wallet connectors in production. You need your own Project ID for a real deployment.

**Contract Address**

Set `VITE_CONTRACT_ADDRESS` to the deployed SafeDelay contract address on Bitcoin Cash mainnet or chipnet. See the [contracts/README.md](contracts/README.md) for deployment instructions.

## Contract Functions

### deposit(pubkey userPk)
Deposit BCH onto a new NFT. Creates a new NFT with the deposited BCH value.

### startWithdraw(bytes memoryId, bytes1 currentFlag, sig s)
Start the withdrawal process. Flips the NFT flag from 00 to 01, beginning the countdown.

### withdraw(bytes memoryId, int createdAtBlock, sig s)
Withdraw BCH after blockDelay has passed. Burns the NFT and sends BCH to user's address.

### emergencyWithdraw(bytes memoryId, sig s)
Emergency withdrawal to emergency address. Ignores blockDelay requirement.

## Production Checklist

This app is a demo. Before production use, the following are required:

- [ ] **Blockchain integration** — Replace simulated state in `AppView.jsx` with real Electrum or
  BitDB calls. The current wagmi/viem stack is EVM-oriented; BCH requires an Electrum-based
  transport (e.g. a custom Electrum wrapper using `blockchain.blocks.subscribe`). Note:
  `@electrum-cash/protocol` does not exist on npm — do not attempt to install it.
- [ ] **Wallet integration** — Connect a real BCH wallet (e.g. Badger, CashApp) via WalletConnect
  v2 or an Electrum-compatible signer. MetaMask does not support BCH natively.
- [ ] **Real contract artifact** — Compile `SafeDelay.cash` with `npx cashcompile` and replace the
  placeholder ABI/address in `src/config.js`.
- [ ] **NFT UTXO tracking** — Implement an off-chain indexer to track deposit NFTs at the contract
  address, since the contract cannot enumerate its own UTXOs on-chain.
- [ ] **Off-chain transaction construction** — `deposit()` cannot be enforced purely on-chain.
  Wallets must construct the NFT-bearing transaction themselves. This is completely undocumented
  for integrators (see [NFT_SPEC.md](NFT_SPEC.md) for the format spec).
- [ ] **WalletConnect Project ID** — Replace `'demo'` with a real project ID from
  [cloud.walletconnect.com](https://cloud.walletconnect.com/).
- [ ] **memoryId generation** — The UI does not generate or store `memoryId`. A production wallet
  must generate and track this per deposit to identify UTXOs.
- [ ] **Block height oracle** — Replace the simulated `currentBlock` in `AppView.jsx` with a
  reliable Electrum `blockchain.blocks.subscribe` or similar real-time block feed.

## License

MIT
