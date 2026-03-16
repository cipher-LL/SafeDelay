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

The CashScript contracts in `src/` need to be compiled and deployed separately:

```bash
npm run compile:contracts
```

This outputs compiled `.cash.json` artifacts to `dist/`.

## Support

For issues or questions, open a GitHub issue at https://github.com/LifestoneLabs/SafeDelay
