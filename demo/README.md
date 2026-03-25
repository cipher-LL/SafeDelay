# SafeDelay Demo Examples

Interactive demonstrations of the SafeDelay time-locked wallet contract.

## Available Demos

### 1. Create Time Lock (`create-lock.html`)
Create a new time-locked wallet that locks your BCH until a specified block height.

**Features:**
- Select lock period (1 week to 5 years)
- Enter your wallet address
- Specify deposit amount
- Shows estimated unlock date

**Use case:** Savings accounts, emergency funds, gift locks

### 2. Extend Lock (`extend-lock.html`)
Extend your existing time lock to a later block height.

**Features:**
- Enter contract address and current expiry
- Choose additional lock time
- One-way extension warning

**Use case:** Want to keep funds locked longer

### 3. Cancel & Refund (`cancel-refund.html`)
Cancel your time lock and get an immediate full refund.

**Features:**
- Works before OR after lock expiry
- No waiting period
- Full balance returned

**Use case:** Emergency access, changed mind

## Contract Functions Reference

| Function | Description |
|----------|-------------|
| `deposit()` | Add more funds to locked wallet (anyone can deposit) |
| `withdraw()` | Withdraw any amount after lock expires (owner only) |
| `extend()` | Extend lock to later block (owner only, one-way) |
| `cancel()` | Cancel and get full refund immediately (owner only) |

## Running Locally

Serve the demo folder:
```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080/demo/create-lock.html`

## Production Use

In production, these demos would integrate with:
- CashScript library for contract compilation
- ElectrumX for current block height
- Wallet signing (WalletConnect, CashID, or private key)