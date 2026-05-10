# SafeDelayManager Deployment Guide

This guide covers deploying the SafeDelayManager registry contract. For contract integration, see [INTEGRATION.md](INTEGRATION.md).

## Prerequisites

- Node.js 18+
- `paytaca-cli` installed (`npm install -g paytaca-cli`)
- Funded wallet with BCH for gas (546 sats minimum)
- Know your Service Provider (SP) public key hash (PKH)

## Step 1: Derive SP PKH from Your Wallet

### From a BCH Address (easiest)

Use `@bitauth/libauth` to derive PKH from any P2PKH address:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as libauth from '@bitauth/libauth';

const address = 'bitcoincash:qqhsm5etvc47ejepu2mjaqg6trmqt08ntuhsea7xa5';
const pkhHex = libauth.Base58Address.decode(address).hashHex;
console.log('SP PKH:', pkhHex); // e.g., 2f0dd32b662beccb21e2b72e811a58f605bcf35f
```

Or via command line with Node:

```bash
node -e "
const libauth = require('@bitauth/libauth');
const addr = 'bitcoincash:qp3w3h3q3gk5zryvm4f5lwf5f50a5v8mgvrg0l0yqt';
const pkh = libauth.Base58Address.decode(addr);
console.log(pkh.hashHex);
"
```

### From a WIF Private Key

```javascript
import { readFileSync } from 'fs';
import * as libauth from '@bitauth/libauth';

const wif = 'KxqC1...'; // your WIF key
const privateKey = libauth.WIF.decode(wif).privateKey;
const pkh = libauth.hash160(libauth.secp256k1.publicKeyCreate(privateKey));
console.log('SP PKH:', pkh);
```

### From Seed Phrase (BIP39)

```javascript
import * as libauth from '@bitauth/libauth';
import { BIP32 } from 'bip32';
import * as bip39 from 'bip39';

// Derive m/44'/0'/0' key
const seed = bip39.mnemonicToSeed('your 12 or 24 word seed');
const root = BIP32.fromSeed(seed);
const child = root.derivePath("m/44'/0'/0'");
const pkh = libauth.hash160(libauth.secp256k1.publicKeyCreate(child.privateKey));
console.log('SP PKH:', pkh);
```

## Step 2: Deploy to Chipnet (Test First)

Chipnet is the test network. Always deploy here first.

```bash
node scripts/deploy-manager.mjs \
  --sp-pkh YOUR_PKH_HEX \
  --network chipnet
```

Example:
```bash
node scripts/deploy-manager.mjs \
  --sp-pkh 2f0dd32b662beccb21e2b72e811a58f605bcf35f \
  --network chipnet
```

You'll be prompted to fund the P2SH32 address with chipnet BCH. Check your paytaca wallet:

```bash
paytaca balance
paytaca wallet info
```

Send chipnet BCH to the address shown. The deploy script will poll until the UTXO confirms.

### Output on Success

```
✓ Contract deployed!
  Network:      chipnet
  Manager addr:  bchtest:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca
  SP PKH:        2f0dd32b662beccb21e2b72e811a58f605bcf35f
  TXID:          abc123...
```

## Step 3: Deploy to Mainnet

Once chipnet is verified working:

```bash
node scripts/deploy-manager.mjs \
  --sp-pkh YOUR_PKH_HEX \
  --network mainnet
```

Fund the shown address with real BCH. The deploy script polls for confirmation.

## Step 4: Update contracts.ts

After deployment, update `src/config/contracts.ts`:

```typescript
export const CONTRACT_ADDRESSES: Record<'mainnet' | 'chipnet' | 'testnet', NetworkAddresses> = {
  mainnet: {
    safeDelayManager: 'bitcoincash:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca',
    serviceProviderPkh: '2f0dd32b662beccb21e2b72e811a58f605bcf35f',  // same as --sp-pkh
  },
  chipnet: {
    safeDelayManager: 'bchtest:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca',
    serviceProviderPkh: '2f0dd32b662beccb21e2b72e811a58f605bcf35f',
  },
  testnet: {
    safeDelayManager: '',
    serviceProviderPkh: '',
  },
};
```

## Step 5: Verify Deployment

### On Chain

Check the contract address exists and is valid:

```bash
# Chipnet
paytaca-cli fetch-balance bchtest:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca

# Mainnet
paytaca-cli fetch-balance bitcoincash:pvzyrvp7upq28nhp7hyrkkd62m77uxhckk0fnsnsv8lfgtwztvhcwav370lca
```

### With Script

```bash
node scripts/deploy-manager.mjs --verify --network chipnet
```

### In App

Build the frontend and verify the manager address loads without errors in the browser console.

## Troubleshooting

### "Invalid spPkh: must be 40 hex chars"

Your PKH must be 40 hex characters (20 bytes). Ensure you didn't include a `0x` prefix or copy extra whitespace.

### "Funding needed" / UTXO not found

Fund the shown P2SH32 address with chipnet/mainnet BCH. Use `paytaca send <addr> <amount>`.

### Deploy times out

Chipnet/mainnet RPCs can be slow. The script retries with exponential backoff. If it fails after 3 retries, check your internet connection and try again.

### Wrong network

The deploy script defaults to chipnet. Pass `--network mainnet` explicitly for mainnet deployment.

## Security Notes

- SP PKH is NOT secret — it's your public key hash, visible on-chain
- The actual private key stays in your wallet, never in the script
- Only the deployer can call `createDelay()` — keep your deploy wallet funded

## Quick Reference

| Network | Command |
|---------|---------|
| Chipnet deploy | `node scripts/deploy-manager.mjs --sp-pkh <pkh> --network chipnet` |
| Mainnet deploy | `node scripts/deploy-manager.mjs --sp-pkh <pkh> --network mainnet` |
| Verify | `node scripts/deploy-manager.mjs --verify --network chipnet` |
| Derive PKH | `node -e "const l=require('@bitauth/libauth');console.log(l.Base58Address.decode('addr').hashHex)"` |