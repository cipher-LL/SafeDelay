# SafeDelay Emergency Withdrawal Guide

## Overview

SafeDelay includes an **emergency withdrawal mechanism** via the `cancel()` function. This allows you to recover your funds at any time — before or after the lock expires. It effectively closes the contract and returns all locked funds to your wallet.

---

## When to Use Emergency Withdrawal

Consider using emergency withdrawal when:

- **You need liquidity urgently** — unexpected expenses, investment opportunities, or personal emergencies
- **Your financial situation changed** — you no longer need the funds locked away
- **The lock period is too long** — you misjudged how long you needed to lock funds
- **You're closing the SafeDelay** — you're done using this particular wallet

> **Note:** There is no cooldown period on emergency withdrawal. Funds are returned immediately after the transaction confirms on-chain.

---

## How Emergency Withdrawal Works

### Step 1: Open SafeDelay Dashboard

Go to [safedelay.cash](https://safedelay.cash) and connect your wallet (WalletConnect, WIF key, or paste your contract address).

### Step 2: Locate Your SafeDelay Contract

- **If connected via WalletConnect:** Your SafeDelay wallets are loaded automatically from localStorage.
- **If using WIF key:** Paste your contract address to load it.
- **If tracking externally:** Navigate to the **SafeDelayManager** tab and use **"Track External SafeDelay"**.

### Step 3: Trigger Emergency Withdrawal (Cancel)

On the dashboard for your SafeDelay contract, locate the **"Cancel & Withdraw"** or **"Emergency Withdraw"** button.

Click it to initiate the cancel transaction.

### Step 4: Confirm the Transaction

- The dashboard will show the transaction details (amount returning to your wallet, network fee)
- Confirm in your wallet (WalletConnect popup, or WIF key signing)
- Wait for on-chain confirmation (~1 block, ~10 minutes on BCH)

### Step 5: Funds Returned

After confirmation, all locked BCH (minus the network fee and a 1000 sat dust remainder) is sent to your wallet's P2PKH address. The SafeDelay contract UTXO is spent and no longer exists on-chain.

---

## What Happens to Deposited Funds

When you trigger emergency withdrawal (`cancel()`):

| Scenario | Outcome |
|----------|---------|
| **All funds returned** | The full locked balance (minus ~1000 sats for network fees) goes to your wallet |
| **Dust remainder** | ~1000 sats remain as the minimum UTXO dust — this is burned/lost if the amount is below dust |
| **NFT registration** | The entry remains in SafeDelayManager on-chain; it won't affect fund retrieval |
| **No partial withdrawal** | `cancel()` returns **all** funds in one transaction — you cannot withdraw a portion |

The contract is **permanently closed** after cancel. The UTXO is spent, and the bytecode can never be re-created at the same address. To lock funds again, you must create a new SafeDelay.

---

## Is There a Cooldown Period?

**No.** Unlike a time-delayed withdrawal (which requires waiting for `lockEndBlock`), emergency withdrawal via `cancel()` has:

- **No waiting period** — executes in the next block
- **No additional delay** — the cancel function has no time constraints
- **Immediate finality** — once confirmed on-chain, funds are back in your wallet

---

## Technical Details (For Developers)

### The `cancel()` Function

```cashscript
function cancel(pubkey ownerPk, sig ownerSig) {
    require(hash160(ownerPk) == ownerPKH);
    require(checkSig(ownerSig, ownerPk));

    int totalBalance = tx.inputs[0].value - 1000;

    require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(ownerPKH));
    require(tx.outputs[0].value >= totalBalance);
}
```

Key points:
- Requires **owner signature only** — no threshold, no time lock
- Sends **all funds** to owner's P2PKH address
- **No time lock check** — works before or after `lockEndBlock`
- **Single-sig** — unlike `withdraw()` which also requires owner sig, and `extend()` which requires M-of-N

### Comparison of Withdrawal Methods

| Function | When Available | Time Lock | Signatures | Amount |
|----------|----------------|-----------|------------|--------|
| `withdraw()` | After `lockEndBlock` | Yes | Owner only | Any amount |
| `cancel()` | Anytime | No | Owner only | All funds |
| `extend()` | Anytime | N/A | Owner only | All funds (re-lock required) |

### Estimating Network Fees

Cancel transactions are standard 2-input, 1-output P2PKH transactions on BCH. Typical fees:

- **Low priority:** ~200-300 sat/vbyte × ~250 bytes = ~50,000-75,000 sats (0.0005-0.00075 BCH)
- **Medium priority:** ~400-500 sat/vbyte × ~250 bytes = ~100,000-125,000 sats (0.001-0.00125 BCH)
- **High priority:** ~1000+ sat/vbyte × ~250 bytes = ~250,000+ sats (0.0025+ BCH)

These fees are deducted from the locked balance, not added separately.

---

## Common Questions

### Q: Does emergency withdrawal affect my SafeDelayManager registration?

No. The SafeDelayManager is a read-only registry. Even after a SafeDelay is cancelled/closed, the manager entry remains on-chain (it cannot be removed). This is by design — it preserves a historical record and prevents replay attacks.

### Q: Can I cancel just part of the funds?

No. The `cancel()` function sends **all** locked funds to the owner in a single transaction. There is no partial cancel option.

If you need to keep some funds locked, you should instead:
1. Wait for `lockEndBlock` to expire
2. Use `withdraw()` to withdraw only the amount you need
3. Leave the remainder in the SafeDelay

### Q: What if I extend the lock and then need emergency access?

You can call `cancel()` after calling `extend()`. The `extend()` function withdraws all funds from the old contract — those funds go to your wallet, not into any new contract. If you want to keep funds locked after extending, you must manually redeposit into a new SafeDelay with the extended `lockEndBlock`.

The `extend()` function's design ensures you make a conscious decision: extending requires you to withdraw and then explicitly redeposit into a new contract.

### Q: Is there a time delay before I can cancel?

**No.** The `cancel()` function has no time constraints. You can call it immediately after creating a SafeDelay, or at any point thereafter, before or after the lock expires.

### Q: Can the service provider block my emergency withdrawal?

No. The service provider PKH only receives a fee when you create a new delay via `createDelay()`. The cancel function does not involve the service provider — it's a direct owner-to-contract operation.

---

## Security Notes

- **Your private key is required** to sign the cancel transaction — keep your wallet access secure
- **Emergency withdrawal bypasses the time lock** — this is intentional for genuine emergencies
- **All funds exit at once** — there is no partial cancel; plan accordingly if you want to keep some locked
- **Network fees apply** — the cancel transaction costs BCH fees, deducted from the locked balance
- **Contract is destroyed** — after cancel, the SafeDelay address no longer exists; you cannot re-open it

---

## Related

- [SafeDelay README](./README.md) — full contract documentation
- [SafeDelayManager README section](./README.md#safedelaymanager-registry) — registry details
- [DEPLOY.md](./DEPLOY.md) — deploying on mainnet/chipnet