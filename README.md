# SafeDelay - Time-Locked Wallet

A CashScript smart contract for time-locked wallets on Bitcoin Cash.

## Overview

SafeDelay is a time-locked wallet where funds can only be withdrawn after a specified delay period. Useful for:

- **Savings accounts** - Lock funds away from yourself
- **Vesting schedules** - Gradual release of funds over time
- **Emergency funds** - Cooldown period before withdrawal to prevent impulse spending
- **Family wallets** - Parental controls for timed release

## Features

- ⏱️ **Time-locked withdrawals** - Funds locked until a specified block height
- 💰 **Flexible deposits** - Anyone can deposit, but only owner can withdraw
- 🔓 **Cancel anytime** - Owner can cancel and retrieve all funds
- 📈 **Extend lock** - Owner can extend the lock period (one-way extension)
- 🔒 **Single owner** - Simple security model with one owner key

## Usage

### Installation

```bash
npm install safedelay
```

### Basic Example

```typescript
import { Contract } from 'cashscript';
import { SafeDelayArtifact } from 'safedelay';

// Get current block height
const currentBlock = await provider.getBlockCount();

// Create SafeDelay with 30-day lock (approximately 4320 blocks)
const lockEndBlock = currentBlock + 4320;

const safeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  {
    ownerPKH: 'your_public_key_hash',
    lockEndBlock: lockEndBlock,
    depositReceipts: []
  },
  { provider }
);

// Deposit funds
await safeDelay.deposit().send(senderAddress, sendAmount);

// After lock expires - withdraw
await safeDelay.withdraw().send(recipientAddress, withdrawAmount);

// Or cancel anytime to get funds back
await safeDelay.cancel().send(recipientAddress);
```

## Contract Functions

| Function | Description | When Available |
|----------|-------------|-----------------|
| `deposit()` | Add BCH to the locked wallet | Anyone, anytime |
| `withdraw()` | Remove BCH after lock expires | Only owner, after lockEndBlock |
| `cancel()` | Close contract and get all funds back | Only owner, anytime |
| `extend()` | Extend the lock period (withdraws funds, must redeposit) | Only owner, anytime (one-way) |

## Extending the Lock Period

The `extend()` function allows the owner to extend the lock period to a later block height. Due to the UTXO model, this works by:

1. Withdrawing all funds from the current contract
2. Owner creates a new SafeDelay contract with the new `lockEndBlock`
3. Owner deposits funds into the new contract

This two-step process ensures one-way extension - you must explicitly redeposit to continue locking.

```typescript
// Step 1: Withdraw all funds using extend()
const newLockEndBlock = currentLockEndBlock + 4320; // Add 30 more days
await safeDelay.extend(newLockEndBlock).send(ownerAddress, fullBalance);

// Step 2: Create new contract with extended lock and deposit
const newSafeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH, lockEndBlock: newLockEndBlock },
  { provider }
);
await newSafeDelay.deposit().send(ownerAddress, fullBalance);
```

## Security Considerations

- **Single point of failure** - If owner loses their key, funds are lost forever
- **One-way extension** - Lock can only be extended, never shortened (prevents hasty decisions)
- **No emergency override** - This is by design for the "commitment" use case
- **Dust limit** - Minimum 1000 sats must remain in contract for it to persist

## Development

```bash
# Install dependencies
npm install cashscript

# Compile contract
npx cashc SafeDelay.cash --hex

# Run tests (if added)
npm test
```

## License

MIT
