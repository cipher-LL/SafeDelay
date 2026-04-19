# SafeDelay - Time-Locked Wallet

A CashScript smart contract library for time-locked wallets on Bitcoin Cash.

## Overview

SafeDelay is a time-locked wallet where funds can only be withdrawn after a specified delay period. Useful for:

- **Savings accounts** - Lock funds away from yourself
- **Vesting schedules** - Gradual release of funds over time
- **Emergency funds** - Cooldown period before withdrawal to prevent impulse spending
- **Multi-device signing** - Require multiple keys for high-security wallets
- **Family/team wallets** - Multiple parties must approve withdrawals

## Contracts

| Contract | Description |
|----------|-------------|
| `SafeDelay` | Single-owner time-locked wallet |
| `SafeDelayMultiSig` | 2-of-3 or 3-of-3 multi-sig time-locked wallet |
| `SafeDelayManager` | Registry that tracks all SafeDelay wallets created on the platform |

---

## SafeDelay (Single Owner)

### Features

- ⏱️ **Time-locked withdrawals** - Funds locked until a specified block height
- 💰 **Flexible deposits** - Anyone can deposit, but only owner can withdraw
- 🔓 **Cancel anytime** - Owner can cancel and retrieve all funds
- 📈 **Extend lock** - Owner can extend the lock period (one-way extension)
- 🔒 **Single owner** - Simple security model with one owner key

## Usage

### Installation

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Add your WalletConnect Project ID to `.env` if using WalletConnect functionality.

Since SafeDelay is a private package (not yet published to npm), install from the repository:

```bash
# Clone the repository
git clone https://github.com/LifestoneLabs/SafeDelay.git

# Navigate to the project
cd SafeDelay

# Install dependencies
npm install

# Build the project
npm run build
```

### TypeScript Support

This package includes TypeScript type definitions. Import types directly:

```typescript
// Import contract types
import {
  SafeDelayArtifact,
  SafeDelayConfig,
  SafeDelayUtxo,
  SafeDelayEvent,
  SafeDelayMultiSigArtifact,
  SafeDelayMultiSigConfig,
  SafeDelayMultiSigUtxo,
  calculateLockBlocks,
  isLockExpired
} from 'safedelay';

// Or import just the types
import type {
  SafeDelayConfig,
  SafeDelayUtxo,
  WithdrawParams,
  DepositParams,
  CancelParams
} from 'safedelay/types';

// Type-safe contract configuration
const config: SafeDelayConfig = {
  ownerPublicKeyHash: 'your_40_char_hex_pkh',
  lockEndBlock: 850000
};

// Type-safe function parameters
const withdrawParams = {
  ownerPrivateKey: 'WIF_private_key',
  ownerAddress: 'cash_address',
  withdrawAmount: 100000n // bigint for satoshis
};
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

---

## SafeDelayMultiSig (Multi-Signature)

A 3-owner time-locked wallet with configurable threshold. Requires multiple signatures for withdrawals, providing enhanced security.

### Features

- 🔐 **M-of-3 multi-sig** - Configure threshold (2-of-3 or 3-of-3)
- ⏱️ **Time-locked withdrawals** - Funds locked until a specified block height
- 💰 **Flexible deposits** - Anyone can deposit
- 🔓 **Single-owner cancel** - Any one owner can cancel anytime (emergency recovery)
- 🔒 **Enhanced security** - No single point of failure

### Use Cases

- **Multi-device signing** - Phone + laptop + paper backup (2-of-3)
- **Team wallets** - 2-of-3 approval required for withdrawals
- **Family wallets** - Parent + child + grandparent keys
- **High-security savings** - Require multiple devices to authorize

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner1` | bytes20 | First owner's public key hash |
| `owner2` | bytes20 | Second owner's public key hash |
| `owner3` | bytes20 | Third owner's public key hash |
| `threshold` | int | Required signatures (2 or 3) |
| `lockEndBlock` | int | Block height when lock expires |

### Example

```typescript
import { Contract } from 'cashscript';
import { SafeDelayMultiSigArtifact } from 'safedelay';

const currentBlock = await provider.getBlockCount();

// Create 2-of-3 multi-sig wallet with 30-day lock
const safeDelayMultiSig = await Contract.fromArtifact(
  SafeDelayMultiSigArtifact,
  {
    owner1: 'key1_hash',
    owner2: 'key2_hash', 
    owner3: 'key3_hash',
    threshold: 2,
    lockEndBlock: currentBlock + 4320
  },
  { provider }
);

// Any owner can deposit
await safeDelayMultiSig.deposit().send(depositorAddress, amount);

// After lock expires, need 2-of-3 signatures to withdraw
await safeDelayMultiSig.withdraw(
  pk1, sig1,  // Owner 1's key and signature
  pk2, sig2,  // Owner 2's key and signature
  pk3, sig3,  // Owner 3's key and signature (unused in 2-of-3)
  withdrawAmount
).send(recipientAddress);

// Any single owner can cancel anytime
await safeDelayMultiSig.cancel().send(recipientAddress);
```

### Contract Functions

| Function | Description | Signatures Required |
|----------|-------------|---------------------|
| `deposit()` | Add BCH to the locked wallet | Anyone |
| `withdraw()` | Remove BCH after lock expires | Threshold (2 or 3) |
| `cancel()` | Close contract and get all funds back | Any 1 owner |
| `extend()` | Extend the lock period | Threshold (2 or 3) |

### Security Notes

- **Cancel is single-sig** - Any owner can emergency-cancel (useful if others unavailable)
- **Withdraw requires threshold** - Prevents single-key theft
- **Extend requires threshold** - Extending the lock is a significant security decision requiring M-of-N consensus
- **Time lock still applies** - Even with multiple signatures, must wait for lock expiry
- **All 3 keys required for full setup** - Contract always has 3 owner slots

### Extending the Lock Period

The `extend()` function requires M-of-N threshold signatures (same as withdraw). This ensures that extending the lock period is a collective decision, not unilateral.

The function works by:
1. M-of-3 owners sign the extend transaction
2. All funds are returned to the first valid signer
3. Owners coordinate to create a new SafeDelayMultiSig contract with the new `lockEndBlock`
4. Funds are redeposited into the new contract


## SafeDelayManager (Registry)

A **registry contract** that tracks all SafeDelay wallets created through the platform. It maintains an on-chain list of user wallets, enabling discovery and management of multiple time-locked wallets from a single interface.

### Why a Registry?

Without a registry, users must manually track their SafeDelay wallet addresses. The manager provides:

- **Wallet discovery** — Query the registry to find all your SafeDelay wallets
- **Service provider fees** — Platform operators can collect a small fee for building on SafeDelay
- **On-chain catalog** — All wallets are publicly verifiable on-chain

### How It Works

The SafeDelayManager is itself an NFT (Category 1) contract. Each user's wallet is registered as an entry in its **NFT commitment**:

```
NFT Commitment = [entry1_pkh(20) || entry1_lockEndBlock(8) ||
                  entry2_pkh(20) || entry2_lockEndBlock(8) ||
                  ...]
```

### Finding a User's SafeDelay Address (Off-Chain)

Given an owner's PKH and lock end block, you can compute the SafeDelay wallet address off-chain:

```
SafeDelay address = hash256(ownerPKH_le || lockEndBlock_le || SafeDelayBytecode)
```

The bytecode is the compiled SafeDelay contract bytecode from `dist/SafeDelay.artifact.json`. This means the address is **deterministic** — no on-chain lookup needed.

Use `SafeDelayManagerLibrary.computeSafeDelayAddress()` for this.

### Registering a Wallet

1. **Deploy your SafeDelay contract** with your owner PKH and desired lock end block
2. **Fund the SafeDelay** with BCH
3. **Call `createDelay()`** on the SafeDelayManager to register (pays a small fee to the service provider)

The manager does NOT hold your funds — it only tracks the entry. Your SafeDelay wallet is independent.

### Contract Functions

| Function | Description |
|----------|-------------|
| `createDelay()` | Register a new SafeDelay wallet in the registry |

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ownerPkh` | bytes20 | Owner's public key hash (20 bytes) |
| `lockEndBlock` | bytes | 8-byte big-endian block height when lock expires |
| `feeSats` | int | Fee to service provider (in satoshis) |

### Example

```typescript
import { Contract } from 'cashscript';
import { SafeDelayManagerArtifact } from 'safedelay';
import { SafeDelayManagerLibrary } from 'safedelay';

// Load the manager contract
const manager = await Contract.fromArtifact(
  SafeDelayManagerArtifact,
  { serviceProviderPkh: 'service_provider_pkh' },
  { provider }
);

// Compute your SafeDelay address before deploying
const myAddress = SafeDelayManagerLibrary.computeSafeDelayAddress(
  'owner_pkh_20_bytes_hex',
  890000, // lock end block as number
  'mainnet'
);
console.log('Your SafeDelay address:', myAddress);

// Deploy your SafeDelay at this address (using the computed address)
// Then register it with the manager:
await manager.createDelay(
  'owner_pkh_20_bytes_hex',
  BigInt(890000),  // 8 bytes - must match the deployed contract
  1000n            // 1000 sat fee to service provider
).send();
```

### Commitment Format Details

Each registry entry is **28 bytes**:

- **20 bytes** — Owner's public key hash (PKH)
- **8 bytes** — Lock end block as big-endian uint64

The commitment is a flat concatenation of all entries. Maximum entries depend on the UTXO value (each entry adds 28 bytes to the commitment; with typical 546 sat dust limit, thousands of entries are possible).


## Deploying on Mainnet

SafeDelay contracts support both **chipnet/testnet** (for testing) and **mainnet** (for production). The deploy scripts accept `--network chipnet|mainnet`.

> ⚠️ **Always test on chipnet first** with small amounts before deploying on mainnet with real funds.

### Prerequisites

- **paytaca CLI** installed and configured: `npm install -g paytaca-cli`
- **BCH in your paytaca wallet** for gas fees
- **Service Provider PKH** — your service's public key hash (40 hex chars / 20 bytes)
- **Node.js 18+**

### Step 1: Deploy the SafeDelayManager (Registry)

The SafeDelayManager tracks all SafeDelay wallets. You need this deployed before users can register.

```bash
# Clone and build SafeDelay
git clone https://github.com/LifestoneLabs/SafeDelay.git
cd SafeDelay
npm install
npm run build

# Deploy the manager on mainnet
node scripts/deploy-manager.mjs --sp-pkh <your_sp_pkh_hex> --network mainnet
```

The script outputs your manager address. **Save it** — you'll need it for the SafeDelay dashboard and frontends.

```
📦 Computing SafeDelayManager deployment address...
   Service Provider PKH: 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b...
   Manager address: bitcoincash:q...  ← SAVE THIS
```

### Step 2: Fund the Manager

The manager needs a small amount of BCH (546+ sats) to be a valid UTXO:

```bash
paytaca send <manager_address> 0.00000546
```

Re-run the deploy script after funding to confirm:
```bash
node scripts/deploy-manager.mjs --sp-pkh <your_sp_pkh_hex> --network mainnet
```

### Step 3: Deploy a SafeDelay Contract (Optional — Most Users Do This Via Dashboard)

For users deploying via CLI or programmatically:

```bash
# Deploy a SafeDelay wallet on mainnet
node scripts/deploy-contract.mjs \
  --owner <owner_pkh_hex> \
  --blocks 52560 \
  --network mainnet
```

- `--blocks` is the lock duration (~10 min/block, so 52560 ≈ 1 year)
- The computed SafeDelay address is **deterministic** — anyone can compute it from the owner's PKH and lock end block
- Fund the SafeDelay address to add BCH

### Step 4: Register with the Manager

After deploying and funding a SafeDelay, call `createDelay()` to register it:

```typescript
const manager = await Contract.fromArtifact(
  SafeDelayManagerArtifact,
  { serviceProviderPkh: '<your_sp_pkh>' },
  { provider: electrumProvider }
);

await manager.createDelay(
  '<owner_pkh>',
  BigInt(lockEndBlock),  // must match the deployed contract
  1000n                  // fee in sats to service provider
).send();
```

### Mainnet vs Chipnet

| | Chipnet/Testnet | Mainnet |
|---|---|---|
| Network prefix | `bchtest:` | `bitcoincash:` |
| RPC | `https://api.blacktown.io/rpc` | `https://api.blacktown.io/rpc` |
| Script flag | `--network chipnet` | `--network mainnet` |
| WIF key prefix | `9`, `c`, `p` | `5`, `K`, `L` |

### Getting Your Service Provider PKH

Your PKH is the hash160 of your P2PKH public key (20 bytes = 40 hex chars). From a BCH address:

```typescript
import { cashAddressToLockingBytecode } from '@bitauth/libauth';

const result = cashAddressToLockingBytecode('bitcoincash:q...');
const bytecode = result.bytecode;
// bytes 3-22 = pubkeyhash (20 bytes = 40 hex chars)
const pkh = bytecode.slice(3, 23).toString('hex');
```

Or from a WIF key:

```typescript
import { decodePrivateKeyWif } from '@bitauth/libauth';

const decoded = decodePrivateKeyWif('K...');
const pkh = decoded.privateKey.slice(1).toString('hex'); // hash160 of pubkey
```

### Contract Addresses (Update Your Frontend)

After deploying on mainnet, update the manager address in your frontend config:

```typescript
// Your mainnet SafeDelayManager address
const MANAGER_ADDRESS_MAINNET = 'bitcoincash:q...'; // ← update this
```

The SafeDelayManager is referenced by the `SafeDelayManagerLibrary` when initializing the registry.


## Track External SafeDelay

The dashboard supports **tracking SafeDelay wallets created externally** — for example, tournament prize deposits from BadgerSurvivors. You don't need to have deployed the contract through this dashboard to track it.

### How to Track an External SafeDelay

1. Go to the **SafeDelayManager** tab in the dashboard
2. Click **"Track External SafeDelay"**
3. Enter the **SafeDelay address** (P2SH32 from your prize claim)
4. Optionally enter the **Owner PKH** (40 hex chars) and **Lock End Block** for on-chain verification
5. Click **Track** to view the balance and unlock status

### On-Chain Verification

When you provide all three fields (address + owner PKH + lock end block), the dashboard will:

1. Compute the expected SafeDelay address from your parameters using `hash256(ownerPKH_le || lockEndBlock_le || SafeDelayBytecode)`
2. Compare it to the provided address
3. Show **"✅ On-chain verified"** if they match, or a clear error with both addresses if there's a mismatch

This prevents accidentally tracking the wrong SafeDelay — useful when multiple wallets share the same owner but have different lock times.

### Use Cases

- **BadgerSurvivors tournament prizes** — After claiming a prize, you receive a SafeDelay P2SH address with a ~2-week lock. Track it here to see when it unlocks.
- **Third-party SafeDelay tools** — Any SafeDelay wallet created with compatible bytecode can be tracked.

## Environment Variables

SafeDelay uses environment variables for wallet and network configuration:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WALLETCONNECT_PROJECT_ID` | For WalletConnect | Your WalletConnect Project ID from [cloud.walletconnect.com](https://cloud.walletconnect.com/) |
| `VITE_ELECTRUM_MAINNET` | No | Electrum RPC URL for mainnet (optional, defaults provided) |
| `VITE_ELECTRUM_TESTNET` | No | Electrum RPC URL for chipnet/testnet (optional, defaults provided) |

See `.env.example` for the full template.

---

## WIF Key Offline Signing

SafeDelay supports **WIF (Wallet Import Format) key offline signing** for users who want to sign transactions without a browser extension wallet. This is useful for:

- **Cold storage** - Sign transactions with an offline/air-gapped private key
- **Hardware wallet integration** - Export WIF from supported hardware wallets
- **Maximum security** - The WIF key is used in-memory only, never stored or transmitted
- **No browser extension required** - Just paste your WIF key and sign

### How It Works

When you use WIF signing in the SafeDelay dashboard:

1. You paste your WIF private key (never sent anywhere — only used in your browser's memory)
2. SafeDelay derives your public key and address from the WIF key
3. It verifies the derived address matches your wallet (prevents signing with wrong key)
4. The transaction is signed locally using the WIF key's private key
5. The signed transaction is broadcast to the network via an Electrum RPC
6. The WIF key is cleared from memory immediately after signing

**Your private key never leaves your browser and is never stored.**

### Exporting a WIF Key

#### From CashScript / Electron Cash

1. Open Electron Cash
2. Go to **Wallet** → **Private Keys** → **Export**
3. Select **WIF** format
4. Copy the WIF key (starts with `5`, `K`, or `L` for mainnet; `9`, `c`, or `p` for testnet/chipnet)

#### From a BIP39 Mnemonic (programmatic)

```typescript
import { mnemonicToWalletImportFormat } from '@bitauth/libauth';

// Derive WIF from mnemonic
const wif = mnemonicToWalletImportFormat({
  mnemonic: 'your 12 or 24 word mnemonic',
  network: 'mainnet', // or 'testnet' for chipnet
});
```

#### From bitcoincash.js (programmatic)

```typescript
import { fromMnemonic } from '@bitauth/libauth';

const key = fromMnemonic('your mnemonic here');
const wif = key.toWIFString(); // 'mainnet' or 'testnet'
```

> ⚠️ **Testnet/Chipnet WIF keys** (starting with `9`, `c`, or `p`) work with the SafeDelay dashboard when set to Testnet or Chipnet mode. **Mainnet WIF keys** (starting with `5`, `K`, or `L`) only work on Mainnet.

### Using WIF Signing in the Dashboard

1. **Open the SafeDelay dashboard** at [safedelay.cash](https://safedelay.cash)
2. **Connect your wallet** using WalletConnect or paste a contract address to manage
3. **Create or load a SafeDelay contract**
4. **Switch to WIF signing mode:**
   - If no CashScript wallet is detected, the UI automatically shows the WIF option
   - If a wallet IS detected, look for the **"🔑 Sign with WIF Private Key"** button
5. **Enter your WIF private key** in the input field
6. The dashboard validates the key and shows the derived address
7. Confirm the address matches your expected wallet address
8. Click **"🔑 Sign with WIF"** to sign and broadcast

The dashboard will show validation errors if:
- The WIF key is invalid (wrong format or checksum)
- The derived address doesn't match your wallet address
- The network doesn't match (mainnet WIF on chipnet, etc.)

### Security Best Practices

#### ✅ Do:
- **Use testnet/chipnet first** — Always test with a small amount on testnet before mainnet
- **Verify the address** — The dashboard shows the derived address; confirm it matches your wallet
- **Clear the key after use** — Close the tab or clear the field after signing
- **Use a dedicated wallet** — Create a separate wallet for SafeDelay with only the funds you intend to lock
- **Check the URL** — Ensure you're on the legitimate safedelay.cash before entering any private key

#### ❌ Don't:
- **Don't use WIF keys from exchanges** — Most exchanges don't allow direct WIF export
- **Don't send all your funds** — Always keep a buffer for miner fees and emergencies
- **Don't share your WIF key** — Anyone with this key can spend your funds
- **Don't paste into random websites** — Only use the official SafeDelay dashboard
- **Don't use keys derived from weak mnemonics** — Use strong, randomly generated seeds

### WIF Key Format Reference

| Network | Prefix | Example |
|---------|--------|---------|
| Mainnet | `5`, `K`, `L` | `L4rK1y...` |
| Testnet/Chipnet | `9`, `c`, `p` | `cTLx3T...` |

The SafeDelay dashboard automatically detects the network from the WIF prefix and validates accordingly.

### Programmatic Usage (Node.js)

If you're using SafeDelay in a Node.js script, you can use the `useWifSigner` hook or the `SafeDelayLibrary` functions directly:

```typescript
import { useWifSigner } from 'safedelay';

const { signWithdraw, signCancel, validateWifKey, getAddressFromWif } = useWifSigner();

// Validate a WIF key before using
const info = validateWifKey('your_wif_key', 'mainnet');
console.log('Address:', info.address);
console.log('PKH:', info.pkh);

// Sign a withdraw (after lock expires)
const txHash = await signWithdraw({
  wifKey: 'your_wif_key',
  network: 'mainnet',
  ownerPkh: 'your_contract_owner_pkh',
  lockEndBlock: 890000,
  contractAddress: 'bitcoincash:...',
  walletAddress: 'bitcoincash:...',
  amountSats: 100000n,
});
console.log('Transaction hash:', txHash);

// Sign a cancel (anytime)
const cancelTxHash = await signCancel({
  wifKey: 'your_wif_key',
  network: 'mainnet',
  ownerPkh: 'your_contract_owner_pkh',
  lockEndBlock: 890000,
  contractAddress: 'bitcoincash:...',
  walletAddress: 'bitcoincash:...',
  contractBalance: 500000n,
});
```

### How the Signing Works (Technical)

The WIF key is decoded using `@bitauth/libauth`'s `decodePrivateKeyWif` function. From the decoded private key:

1. A CashScript `SignatureTemplate` is created for signing
2. The public key is derived from the private key
3. The P2PKH address is derived from the public key (using the correct network prefix)
4. The transaction is built using the SafeDelay contract artifact
5. The `SignatureTemplate` signs the transaction digest
6. The signed transaction is broadcast via Electrum RPC

This is the same underlying mechanism used by hardware wallets — a private key signs a transaction digest — but without the hardware.

> 🔐 **Air-gapped signing:** For the highest security, you can generate a WIF key on an air-gapped machine, transfer it to your SafeDelay machine via QR code or USB (in a controlled environment), and then destroy the key after use.

