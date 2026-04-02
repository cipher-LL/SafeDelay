# SafeDelay Frontend Integration Guide

Complete guide for integrating SafeDelay contracts into your frontend app.

## Quick Reference

### Contract Functions

| Function | Who Can Call | When Available |
|----------|--------------|----------------|
| `deposit()` | Anyone | Anytime |
| `withdraw()` | Owner | After lockEndBlock |
| `cancel()` | Owner | Anytime |
| `extend()` | Owner | Anytime (one-way) |

### Block Math

- ~144 blocks per day
- ~4,320 blocks per 30 days

## Setup

```typescript
import { Contract } from 'cashscript';
import { ElectrumCluster, ElectrumCash } from '@electrum-cash/electrum-cash';

const electrum = new ElectrumCluster('SafeDelay', '1.0.1', ElectrumCash.Main);
electrum.addConnection('electrum.imaginary.cash', 50002, true);
const provider = new ElectrumCashProvider(electrum, { complete: true });

// Get current block
const currentBlock = await provider.getBlockCount();
```

## Creating a Vault

```typescript
const lockEndBlock = currentBlock + 4320; // ~30 days

const vault = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH: 'your-pkh-hex', lockEndBlock, depositReceipts: [] },
  { provider }
);

const depositAddress = vault.address; // Send BCH here
```

## Depositing

```typescript
// Option 1: Direct transfer to contract address
await wallet.sendToAddress(vault.address, amountSats);

// Option 2: Using deposit function
await vault.functions.deposit(senderPk, senderSig).to(vault.address, amount).send();
```

## Withdrawing (After Lock Expires)

```typescript
// Check if locked
const isLocked = currentBlock < vault.rawData.lockEndBlock;

if (!isLocked) {
  const tx = await vault.functions
    .withdraw(ownerPk, ownerSig, withdrawAmount)
    .to(ownerAddress, withdrawAmount)
    .withDustChange()
    .send();
}
```

## Cancel (Anytime)

```typescript
// Cancels and returns all funds immediately
const tx = await vault.functions
  .cancel(ownerPk, ownerSig)
  .to(ownerAddress, fullBalance)
  .send();
```

## Extending Lock

```typescript
// One-way extension to later block
const newLockEndBlock = vault.rawData.lockEndBlock + 4320;

const tx = await vault.functions
  .extend(ownerPk, ownerSig, newLockEndBlock)
  .to(ownerAddress, fullBalance)
  .send();

// MUST create new contract with extended lock
const newVault = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH, lockEndBlock: newLockEndBlock, depositReceipts: [] },
  { provider }
);
await newVault.deposit().send(ownerAddress, fullBalance);
```

## Balance & Status Tracking

```typescript
async function getVaultStatus(vault: Contract) {
  const currentBlock = await provider.getBlockCount();
  const utxos = await provider.getUtxos(vault.address);
  const balance = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
  
  return {
    balance,
    lockEndBlock: vault.rawData.lockEndBlock,
    currentBlock,
    isLocked: currentBlock < vault.rawData.lockEndBlock,
    blocksRemaining: Math.max(0, vault.rawData.lockEndBlock - currentBlock)
  };
}
```

## Countdown Timer

```typescript
function formatCountdown(blocksRemaining: number): string {
  const days = Math.floor(blocksRemaining / 144);
  const hours = Math.floor((blocksRemaining % 144) / 6);
  const mins = (blocksRemaining % 6) * 10;
  return `${days}d ${hours}h ${mins}m`;
}

// Refresh every ~10 minutes (block time)
setInterval(async () => {
  const status = await getVaultStatus(vault);
  if (status.isLocked) {
    console.log(`Unlock in: ${formatCountdown(status.blocksRemaining)}`);
  } else {
    console.log('Funds available!');
  }
}, 600000);
```

## MultiSig (SafeDelayMultiSig)

```typescript
const multiVault = await Contract.fromArtifact(
  SafeDelayMultiSigArtifact,
  {
    owner1, owner2, owner3,
    requiredSigs: 2,  // 2 of 3
    lockEndBlock
  },
  { provider }
);

// Withdraw requires 2 signatures
await multiVault.functions
  .withdraw(pk1, sig1, pk2, sig2, pk3, sig3, amount, recipientPKH)
  .to(recipientPKH, amount)
  .withDustChange()
  .send();
```

## NFT Version (SafeDelay_NFT)

```typescript
const nftVault = await Contract.fromArtifact(
  SafeDelayNFTArtifact,
  { userPkh, emergencyPkh, recoverPkh, blockDelay: 1000 },
  { provider }
);

// Deposit creates NFT commitment
await nftVault.functions.deposit(userPk, sig).to(nftVault.address, amount).send();

// Start withdrawal (flag = 0x01)
await nftVault.functions.startWithdraw(memoryId, currentFlag, extendedBlocks, userPk, sig).send();

// Withdraw after delay
await nftVault.functions.withdraw(memoryId, createdAtBlock, extendedBlocks, userPk, sig)
  .to(userAddress, amount).send();

// Emergency withdrawal (no delay)
await nftVault.functions.emergencyWithdraw(memoryId, emergencyPk, sig)
  .to(emergencyAddress, amount).send();
```

## WIF Key & Offline Signing

SafeDelay supports offline transaction signing using WIF (Wallet Import Format) private keys. This allows you to:
- Keep your private keys on an air-gapped device
- Sign transactions offline for enhanced security
- Use hardware wallets that support WIF export

### What is WIF?

WIF (Wallet Import Format) is a standardized format for encoding private keys. A WIF private key looks like:
```
L4rK1yDtCWekvXuE6oXD9jCYfFNV2cWRpVuPLBcCU2z8TrisoyY1
```

### Generating a WIF Key

**Option 1: Using Bitcoin.com Wallet**
1. Go to Settings → Wallet → Private Keys
2. Export the key for your address
3. Choose WIF format

**Option 2: Using bitbox2 (Hardware Wallet)**
```typescript
import { BITBOX } from 'bitbox-sdk';
const bitbox = new BITBOX();
const keyPair = bitbox.CashScript.createKeyPair();
const wif = keyPair.toWIF();
// keyPair.pubkey.toString('hex') gives you the public key
```

**Option 3: Using cashweb KeyDerivation**
```typescript
import { deriveKey, mnemonicToKey } from 'cashweb-key-derivation';
const keyPair = mnemonicToKey('your 12 or 24 word mnemonic');
const wif = keyPair.toWIF();
```

**Option 4: Using OpenClaw Paytaca CLI** (Recommended)
```bash
# Generate a new WIF key
paytaca wallet create --name my-vault

# Export existing key as WIF
paytaca wallet export --wif

# Get key info
paytaca wallet info
```

### Using WIF Keys with SafeDelay

```typescript
import { SafeDelayLibrary } from 'safedelay';

// Initialize with your WIF key (never share this!)
const wifKey = 'L4rK1yDtCWekvXuE6oXD9jCYfFNV2cWRpVuPLBcCU2z8TrisoyY1';

const library = new SafeDelayLibrary({
  network: 'mainnet',
  ownerWif: wifKey,
  lockEndBlock: 850000,
});

// Deposits use the WIF key for signing
const depositTx = await library.deposit(depositorWif);
console.log('Deposit TX:', depositTx);

// Withdraws also use the WIF key
const withdrawTx = await library.withdraw(ownerWif, 100000n, recipientAddress);
console.log('Withdraw TX:', withdrawTx);
```

### Offline Signing Workflow

For maximum security, sign on an air-gapped device:

**Step 1: On Online Machine (Prepare Unsigned TX)**
```typescript
import { Contract, TransactionBuilder, ElectrumNetworkProvider } from 'cashscript';

const provider = new ElectrumNetworkProvider(Network.MAINNET, 'ssl://electrum.mainnet...');
const vault = await Contract.fromArtifact(SafeDelayArtifact, {...}, { provider });

// Build the transaction hex WITHOUT signing
const unsignedTxHex = await vault.functions
  .withdraw(Buffer.alloc(33), Buffer.alloc(64), 100000n) // placeholder sigs
  .to(recipientAddress, 100000n)
  .build();

// Export the unsigned transaction
console.log('Unsigned TX:', unsignedTxHex);
```

**Step 2: On Air-Gapped Machine (Sign)**
```typescript
import { ECPair, Transaction } from 'bitcoincashjs-lib';

const key = ECPair.fromWIF('L4rK1yDtCWekvXuE6oXD9jCYfFNV2cWRpVuPLBcCU2z8TrisoyY1');
const tx = Transaction.fromHex(unsignedTxHex);

// Sign each input
const txb = TransactionBuilder.fromTransaction(tx, Network.MAINNET);
for (let i = 0; i < txb.inputs.length; i++) {
  txb.sign(i, key);
}

const signedTxHex = txb.build().toHex();
console.log('Signed TX:', signedTxHex);
```

**Step 3: On Online Machine (Broadcast)**
```typescript
import { ElectrumCash } from '@electrum-cash/electrum-cash';

const electrum = new ElectrumCash(['electrum.mainnet...'], 50002, true);
await electrum.transactionBroadcast(signedTxHex);
console.log('Broadcast! TX ID:', electrum.transactionId);
```

### Security Best Practices

**DO:**
- ✅ Store WIF keys in a password manager
- ✅ Use hardware wallets that support WIF export
- ✅ Keep backups of your WIF keys in multiple secure locations
- ✅ Use air-gapped devices for signing sensitive transactions

**DON'T:**
- ❌ Share your WIF key with anyone
- ❌ Store WIF keys in plain text files
- ❌ Send WIF keys over email or chat
- ❌ Use WIF keys from untrusted sources

### Importing Existing Wallet

To use an existing BCH wallet with SafeDelay:

```typescript
import { ECPair, CashAddress } from 'bitcoincashjs-lib';

const key = ECPair.fromWIF('your-wif-key');
const pubKeyHash = key.getAddressData().hashBuffer;

// Use the pubKeyHash (20 bytes, hex) for ownerPKH
const ownerPKH = pubKeyHash.toString('hex');

// Derive the CashAddress
const address = CashAddress.p2pkh(pubKeyHash, 'bitcoincash');
```

## Complete React Example

```tsx
import { useState, useEffect } from 'react';
import { Contract } from 'cashscript';

function SafeDelayVault({ provider, ownerPKH, lockDays = 30 }) {
  const [vault, setVault] = useState(null);
  const [balance, setBalance] = useState(0n);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    async function init() {
      const currentBlock = await provider.getBlockCount();
      const vault = await Contract.fromArtifact(
        SafeDelayArtifact,
        { ownerPKH, lockEndBlock: currentBlock + (lockDays * 144), depositReceipts: [] },
        { provider }
      );
      setVault(vault);
    }
    init();
  }, [ownerPKH, lockDays]);

  useEffect(() => {
    if (!vault) return;
    async function poll() {
      const utxos = await provider.getUtxos(vault.address);
      setBalance(utxos.reduce((s, u) => s + BigInt(u.value), 0n));
    }
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [vault]);

  return (
    <div>
      <h3>SafeDelay Vault</h3>
      <p>Address: {vault?.address}</p>
      <p>Balance: {(Number(balance) / 100).toFixed(2)} BCH</p>
    </div>
  );
}
```
