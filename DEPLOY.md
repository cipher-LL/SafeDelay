# SafeDelay Deployment Guide

This guide covers how to build and deploy the SafeDelay frontend.

## Prerequisites

- Node.js 18+
- npm or yarn

## Build Commands

### Install Dependencies

```bash
npm install
```

### Build for Production

```bash
npm run build
```

This will compile TypeScript contracts and build the React frontend to `dist/`.

### Preview Build Locally

```bash
npx vite preview
```

### Deploy `dist/` via Static Hosting

Vite outputs to `dist/` by default. Point your static host (Vercel, Netlify, nginx, etc.) to this directory.

## Deployment Options

### Option 1: Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel --prod
   ```

Or connect your GitHub repo to Vercel for automatic deployments.

**Environment Variables (if needed):**
- None required for basic deployment - the app uses public Electrum APIs

### Option 2: Netlify

1. Install Netlify CLI:
   ```bash
   npm i -g netlify-cli
   ```

2. Deploy:
   ```bash
   netlify deploy --prod --dir=dist
   ```

Or connect your GitHub repo to Netlify for automatic deployments.

**Build Settings:**
- Build command: `npm run build`
- Publish directory: `dist`

### Option 3: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t safedelay .
docker run -p 8080:80 safedelay
```

### Option 4: Static Hosting (GitHub Pages, S3, etc.)

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Upload contents of `dist/` to your static host.

## Smart Contract Deployment

### Compile Contracts

```bash
npm run compile:contracts
```

This outputs compiled `.cash.json` artifacts to `dist/`.

### Deploy to Chain

Use the deployment script to deploy SafeDelay or SafeDelayMultiSig contracts:

**Single-owner SafeDelay:**
```bash
node scripts/deploy-contract.mjs --owner <pkh_hex> --blocks <num_blocks> [--network chipnet|mainnet]
```

Example (chipnet, 100 blocks ~16 hours lock):
```bash
node scripts/deploy-contract.mjs --owner 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b --blocks 100 --network chipnet
```

**Multi-signature SafeDelay (3 owners):**
```bash
node scripts/deploy-contract.mjs --multi-sig --owner1 <pkh> --owner2 <pkh> --owner3 <pkh> --threshold 2 --blocks 100
```

**Options:**
- `--owner` — Owner public key hash (40 hex chars = 20 bytes)
- `--blocks` — Lock duration in blocks (~10 min/block on BCH mainnet)
- `--network` — `chipnet` (default) or `mainnet`
- `--multi-sig` — Enable 3-owner multi-sig mode
- `--threshold` — Required signatures (for multi-sig)

**How it works:**
1. Computes the P2SH32 contract address from bytecode + constructor args
2. Auto-funds via paytaca CLI if available (or shows manual funding instructions)
3. Waits for UTXO confirmation
4. Prints the deployed contract address

**Get your PKH from a BCH address:**
Use `@bitauth/libauth` or any BCH utility to derive the hash160 of a P2PKH address.

### Deploy SafeDelayManager Registry (mainnet)

SafeDelayManager is a singleton registry contract that tracks all SafeDelay wallets deployed by a service provider. The Manager Registry tab in the frontend uses it to browse and register SafeDelay wallets.

**⚠️ Mainnet deployment requires your service provider PKH.** Kyle: run this once with your SP key.

```bash
# 1. Compile contracts first
npm run compile:contracts

# 2. Deploy SafeDelayManager to mainnet
node scripts/deploy-manager.mjs --sp-pkh <your_20_byte_pkh_hex> --network mainnet
```

Example:
```bash
node scripts/deploy-manager.mjs --sp-pkh 1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b --network mainnet
```

The script will:
1. Compute the P2SH32 SafeDelayManager address from your SP PKH
2. Show the address — fund it with 546+ sats via `paytaca send <address> 0.00000546`
3. Wait for confirmation and report success

**After deployment:** Save the manager address. Enter it in the Manager Registry tab's address field to browse your SafeDelay wallets on-chain.

**Compute a child's SafeDelay address off-chain** (no on-chain deployment needed for the child):
```bash
node scripts/deploy-manager.mjs --compute-child --owner <owner_pkh_hex> --blocks <end_block> --network mainnet
```

**Manager Registry tab empty state:** If no manager is deployed, the tab shows an empty list with a prompt to enter the manager address. There is no default mainnet manager — each service provider deploys their own.

## Verifying On-Chain Deployments

After deploying a SafeDelay or SafeDelayManager contract to mainnet, you can verify the on-chain bytecode matches the artifact using the verification utility.

### Step 1: Fetch the deployed address

After running the deploy script, note the printed contract address.

### Step 2: Run verification

```bash
# Using the compile server (recommended)
curl -X POST http://localhost:3001/verify \
  -H "Content-Type: application/json" \
  -d '{"address": "<contract_address>", "artifactName": "SafeDelay"}'

# Or use the verification endpoint if running locally
node -e "
import('./src/contractVerification.js').then(m => {
  m.verifyContractOnChain('<address>', 'SafeDelay').then(r => {
    console.log(r.verified ? '✅ VERIFIED' : '❌ FAILED: ' + r.message);
  });
});
"
```

### Manual verification via Electrum

1. Query the contract script:
```bash
curl -X POST https://bchd.electroncash.net:8335/rpc \
  -H "Content-Type: application/json" \
  -d '{"id": 0, "method": "get_address_script", "params": ["<contract_address>"]}'
```

2. Compare the returned `result` bytes against the artifact bytecode in `dist/SafeDelay.artifact.json` under the `.debug.bytecode` field.

3. Cross-reference with `artifacts/HASHES.json` for known-good hashes:
```
SafeDelay bytecode hash (185 bytes): 788a1fb56ebe29fb74562c9c440ad8e73227d22eb0df3aeb7c2cab1924a8449a
SafeDelayMultiSig bytecode hash (286 bytes): a13fb855d9ca2f6b2e3d2d9e8d8a7c3f1b4a5e6d7c8a9b0d1e2f3a4b5c6d7e8f
SafeDelayManager bytecode hash (90 bytes): afec3c01444e2ecd922601ea6f0b0a87364f2d360ea347447b39042fd9577a2a
```

### What to check

- **Bytecode match**: On-chain script bytes must exactly match `artifact.debug.bytecode`
- **P2SH address**: Derived correctly from `hash160(bytecode + constructorArgs)`
- **Balance**: 546+ sats sent for dust threshold
- **First spend**: Owner can withdraw after lockEndBlock

### Troubleshooting

**"Contract verification FAILED"**
- Check you used the correct network (chipnet vs mainnet artifact)
- Ensure artifact hasn't been recompiled since deployment
- Verify you funded the correct computed address

**"Connection refused" on Electrum**
- Try alternate endpoints: `https://bchd.electroncash.net:8335/rpc` (mainnet) or `https://tbchd.electroncash.dk:8335/rpc` (chipnet)
- Check your internet connection and firewall settings

## Support

For issues or questions, open a GitHub issue at https://github.com/LifestoneLabs/SafeDelay
