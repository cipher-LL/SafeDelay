# SafeDelay Examples

Practical deployment examples for different use cases.

## Prerequisites

```bash
npm install
```

## Running Examples

Each example is a standalone TypeScript file. Run with:

```bash
npx ts-node examples/<example-name>.ts
```

## Examples

| # | Example | Use Case | Complexity |
|---|---------|----------|------------|
| 01 | [Simple Savings](01-simple-savings.ts) | Single-owner, 30-day lock | Beginner |
| 02 | [Vesting Schedule](02-vesting-schedule.ts) | 12-month linear unlock, 2-of-3 | Intermediate |
| 03 | [Family Wallet](03-family-wallet.ts) | 2-of-3 multisig, 7-day lock | Intermediate |
| 04 | [Emergency Fund](04-emergency-fund.ts) | 1-year lock, cancelable | Beginner |
| 05 | [React Native](05-react-native.ts) | Mobile app with WalletConnect | Advanced |

## Common Parameters

| Parameter | Description | Notes |
|-----------|-------------|-------|
| `lockBlocks` | Number of blocks to lock | ~144 blocks/day |
| `mnemonic` | 12-word seed phrase | Keep secure! |
| `provider` | RPC endpoint | Use testnet for testing |

## Network Configuration

```typescript
// Mainnet
const provider = { network: 'mainnet' };

// Testnet
const provider = { network: 'testnet' };

// Custom RPC
const provider = { url: 'https://your-rpc.io/rpc', network: 'testnet' };
```

## Transaction Costs

| Operation | Approximate Size | Typical Fee |
|-----------|-----------------|-------------|
| Deposit | ~200 bytes | ~200 sats |
| Withdraw | ~400 bytes | ~400 sats |
| Cancel | ~300 bytes | ~300 sats |
| Extend | ~500 bytes | ~500 sats |

*Note: Fees vary with network congestion. Always include buffer.*
