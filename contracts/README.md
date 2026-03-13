# SafeDelay Contracts

This directory contains the CashScript smart contracts for the SafeDelay project.

## Contracts

| Contract | Description |
|----------|-------------|
| `SafeDelay.cash` | Basic time-locked wallet (single owner) |
| `SafeDelay_NFT.cash` | Time-locked wallet with NFT-based recovery |
| `SafeDelayMultiSig.cash` | Multi-signature time-locked wallet (M-of-N) |

## Version Changelog

### v1.0.0 - 2026-03-13
**Contracts:** SafeDelay.cash, SafeDelay_NFT.cash, SafeDelayMultiSig.cash

#### SafeDelay.cash
- Initial release
- `deposit()` - Add BCH to locked wallet (anyone)
- `withdraw()` - Remove BCH after lock expires (owner only)
- `cancel()` - Close contract, retrieve all funds (owner only)
- `extend()` - One-way lock extension (owner only)

#### SafeDelay_NFT.cash
- Added NFT-based recovery mechanism
- Added `recoverPKH` parameter for emergency key recovery
- Supports BCH recovery to a separate key if NFT is transferred

#### SafeDelayMultiSig.cash
- Multi-signature support (M-of-N threshold)
- Supports 2-of-3, 3-of-3, or any M-of-N configuration
- All functions require threshold signatures
- `extend()` function requires M signatures to extend lock period

## Migration Guide

### Extending Lock Period

Due to UTXO model constraints, lock extension requires creating a new contract:

```typescript
// Step 1: Withdraw using extend()
await safeDelay.extend(newLockEndBlock).send(ownerAddress, fullBalance);

// Step 2: Create new contract with extended lock
const newSafeDelay = await Contract.fromArtifact(
  SafeDelayArtifact,
  { ownerPKH, lockEndBlock: newLockEndBlock },
  { provider }
);
await newSafeDelay.deposit().send(ownerAddress, fullBalance);
```

## Security Notes

- All contracts use `require()` for access control
- Time locks are enforced via `lockEndBlock` check
- Multi-sig requires M valid signatures for any state-changing operation
- No admin override exists by design (commitment use case)
