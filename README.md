# SafeDelay

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
- **WalletConnect (AppKit)** - Wallet connection
- **@electrum-cash/protocol** - Blockchain access

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

## License

MIT
