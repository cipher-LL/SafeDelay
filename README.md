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

## Quick Start

```typescript
import { Contract } from 'cashscript';
import { SafeDelayArtifact } from 'safedelay';

// Create contract with 30-day lock
const safeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH: 'your_public_key_hash', lockEndBlock: currentBlock + 4320 },
  { provider }
);

// Deposit
await safeDelay.deposit().send(senderAddress, sendAmount);

// Withdraw after lock expires
await safeDelay.withdraw().send(recipientAddress, withdrawAmount);
```

## Frontend Integration

### With WalletConnect (via CashScript)

```typescript
import { Contract } from 'cashscript';
import { SafeDelayArtifact } from 'safedelay';
import { EIP1193Provider } from '@walletconnect/ethereum-provider';

// Initialize WalletConnect provider
const provider = new EIP1193Provider({
  projectId: 'your_project_id',
  chains: [1] // BCH chain
});

await provider.connect();

// Create SafeDelay contract
const safeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH: ownerPublicKeyHash, lockEndBlock, depositReceipts: [] },
  { provider }
);

// All contract operations work through the connected wallet
await safeDelay.deposit().send(senderAddress, amount);
```

### With CashID

```typescript
import { Contract } from 'cashscript';
import { SafeDelayArtifact } from 'safedelay';

// CashID auth provides the public key hash directly
const { pkh } = await cashid.resolve('https://example.com/cashid');

// Use pkh directly in contract parameters
const safeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH: pkh, lockEndBlock, depositReceipts: [] },
  { provider }
);
```

### React Integration Example

```tsx
import { useEffect, useState } from 'react';
import { Contract } from 'cashscript';
import { SafeDelayArtifact } from 'safedelay';

function SafeDelayWidget({ provider, ownerPKH, lockBlocks = 4320 }) {
  const [contract, setContract] = useState(null);
  const [balance, setBalance] = useState(0n);

  useEffect(() => {
    async function init() {
      const currentBlock = await provider.getBlockCount();
      const contract = await Contract.fromArtifact(
        SafeDelayArtifact,
        { ownerPKH, lockEndBlock: currentBlock + lockBlocks, depositReceipts: [] },
        { provider }
      );
      setContract(contract);
      // Fetch balance...
    }
    init();
  }, [provider, ownerPKH]);

  const deposit = async (amount) => {
    await contract.deposit().send(senderAddress, amount);
  };

  const withdraw = async () => {
    await contract.withdraw().send(recipientAddress, balance);
  };

  return (
    <div>
      <button onClick={deposit}>Deposit</button>
      <button onClick={withdraw}>Withdraw</button>
    </div>
  );
}
```

## Deployment

### Contract Compilation

```bash
npx cashc SafeDelay.cash --output contracts/artifacts/SafeDelay.json
```

### Deploying to Mainnet

1. **Compile the contract** using `cashc`
2. **Initialize** on-chain with the initial deposit and parameters:

```typescript
const safeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  {
    ownerPKH: ownerPublicKeyHash,
    lockEndBlock: targetBlockHeight,
    depositReceipts: []
  },
  { provider: mainnetProvider }
);

// Send BCH to initialize the contract
await safeDelay.deposit().send(fundingAddress, initialAmount);
```

### Testnet

For testing, use the Bitcoin Cash testnet:

```typescript
import { TestnetProvider } from '@electrum-cash/electrum-cash';

const provider = new TestnetProvider();
const currentBlock = await provider.getBlockCount();

// Create test contract
const testContract = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH: testPKH, lockEndBlock: currentBlock + 100, depositReceipts: [] },
  { provider }
);
```

**Note:** Contract addresses are derived from the initialization parameters and the contract bytecode. Each unique `ownerPKH` + `lockEndBlock` combination produces a different address.

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
