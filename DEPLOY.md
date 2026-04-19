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

This will compile TypeScript contracts and build the React frontend to `dist-frontend/`.

### Preview Build Locally

```bash
npm run preview
```

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
   netlify deploy --prod --dir=dist-frontend
   ```

Or connect your GitHub repo to Netlify for automatic deployments.

**Build Settings:**
- Build command: `npm run build`
- Publish directory: `dist-frontend`

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
COPY --from=builder /app/dist-frontend /usr/share/nginx/html
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

2. Upload contents of `dist-frontend/` to your static host.

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

## Support

For issues or questions, open a GitHub issue at https://github.com/LifestoneLabs/SafeDelay
