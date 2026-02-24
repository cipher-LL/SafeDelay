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

# Start development server
npm run dev
```

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
