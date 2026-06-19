# SafeDelay NFT UTXO Specification

This document describes the on-chain format for SafeDelay NFTs, how to construct deposit transactions off-chain, and how to query the contract for existing deposits.

---

## 1. NFT UTXO Structure

Each SafeDelay NFT is a UTXO locked to the contract address with data encoded across the locking bytecode and the value field.

### 1.1 Locking Bytecode (P2PKH to Contract)

The NFT's locking bytecode is a standard P2PKH that sends to the contract address:

```
OP_DUP OP_HASH160 <contractPkh> OP_EQUALVERIFY OP_CHECKSIG
```

The contract's public key hash (`contractPkh`) is derived from the deployed `.cash` file.

### 1.2 Value Field (Flag Encoding)

The **last byte of the UTXO value** (in satoshis, as a 32-byte big-endian integer) encodes the NFT's state flag:

| Flag | Value (last byte) | Meaning |
|------|-------------------|---------|
| `0x00` | `...XX:00` | Default — withdrawal not started |
| `0x01` | `...XX:01` | Enabled — withdrawal countdown active |

**Example:** A UTXO with value `65,000,000` satoshis has last byte `0x00` (default state).

> ⚠️ **Critical constraint:** When constructing transactions, the output value must be chosen such that its last byte equals the desired flag. For flag `0x00`, use any value where `value % 256 == 0`. For flag `0x01`, use `value % 256 == 1`.
>
> This means NFT values are effectively **constrained to specific congruence classes modulo 256**. Plan deposit amounts accordingly.

### 1.3 Locking Bytecode Data Encoding

The NFT metadata (amount, userPkh, createdAtBlock) is encoded in the **signature space** of the input when spending the NFT — not in the locking bytecode itself. The contract verifies this data when `withdraw` is called via the `memoryId` and `createdAtBlock` parameters.

- `memoryId` — passed as bytes, typically a hash of (userPkh + createdAtBlock + amount) to uniquely identify the deposit
- `createdAtBlock` — the block number when the deposit was made (used for time-lock calculation)

The contract does **not** store these values on-chain. It trusts the caller to provide them and verifies the values through the covenant mechanism (output must go to the correct userPkh).

---

## 2. Off-Chain Transaction Construction

SafeDelay uses a **two-transaction deposit pattern** — the contract cannot enforce deposit output creation on-chain, so wallet integrators must construct the NFT output themselves.

### 2.1 Deposit Transaction

```
Transaction: deposit()
Inputs:
  - [User's wallet UTXO] — any UTXO with sufficient BCH

Outputs:
  - [0] NFT UTXO
      Address:    SafeDelay contract address (P2PKH to contractPkh)
      Value:      depositAmount — miner fee
      Last byte:  0x00 (FLAG_DEFAULT)
  - [1] (optional) Change output to user
```

**Constructing the NFT output:**

```javascript
// Pseudocode
const depositAmount = 100_000; // satoshis
const flag = 0x00;

// Find a value whose last byte is the desired flag
// For flag 0x00: any value where value % 256 == 0
// For flag 0x01: any value where value % 256 == 1
const nftValue = findValueWithLastByte(depositAmount - minerFee, flag);

const nftOutput = {
  address: contractAddress,  // SafeDelay contract P2PKH address
  value: nftValue,
  // No OP_RETURN data needed — NFT is identified by being sent to contract address
};
```

### 2.2 Finding NFT UTXOs in Subsequent Transactions

Since NFTs are sent to the contract address, a wallet must scan the blockchain for UTXOs sitting at the contract address to find a user's deposits.

```javascript
// Pseudocode: find user's deposits
const userDeposits = await electrumApi.getUtxos(contractAddress)
  .then(utxos => utxos.filter(utxo => {
    // The UTXO is a deposit if it was created by a deposit transaction
    // Additional filtering by userPkh can be done by tracking deposit history
    return utxo.confirmations > 0;
  }));
```

> **Note:** Standard P2PKH UTXOs at the contract address are indistinguishable from regular payments to the contract. SafeDelay relies on the off-chain layer (indexer, wallet) to track which UTXOs are legitimate deposits vs. regular payments.

### 2.3 Start Withdrawal Transaction

```
Transaction: startWithdraw()
Inputs:
  - [0] NFT UTXO (at contract address, flag = 0x00)
        unlockingBytecode: <userSig> <userPk> <memoryId> <currentFlag=0x00>

Outputs:
  - [0] NFT UTXO (same contract address, flag = 0x01)
        Value last byte: 0x01
```

The covenant is enforced by requiring `tx.outputs[0].value.toBytes()[31] == 0x01`.

### 2.4 Withdraw Transaction

```
Transaction: withdraw()
Inputs:
  - [0] NFT UTXO (at contract address, flag = 0x01)
        unlockingBytecode: <userSig> <userPk> <memoryId> <createdAtBlock>

Outputs:
  - [0] BCH to user address (P2PKH to userPkh)
```

Requirements enforced:
- Input flag must be `0x01`
- `tx.time >= createdAtBlock + blockDelay`
- Output goes to `userPkh`

---

## 3. Querying Deposits

### 3.1 Get All Deposits for a User

Since SafeDelay NFTs live at the contract address, finding a user's deposits requires an off-chain indexer that tracks deposit creation events.

```javascript
// High-level approach:
// 1. Listen for deposit() transactions (off-chain monitor)
// 2. Record: { txid, vout, amount, userPkh, createdAtBlock, memoryId }
// 3. Query by userPkh to get user's active deposits

const userDeposits = indexer.getDepositsByUser(userPkh);
const activeDeposits = userDeposits.filter(d => !d.withdrawn);
```

### 3.2 Get Deposit State from Chain

To check if a deposit's withdrawal is enabled:

```javascript
// Check if startWithdraw has been called
const utxo = await electrumApi.getUTXO(txid, vout);
const flag = utxo.value % 256; // Last byte of value

if (flag === 0x01) {
  // Withdrawal enabled — check if blockDelay has passed
  const createdAtBlock = deposit.createdAtBlock;
  const currentBlock = await electrumApi.getCurrentBlock();
  const blocksSinceEnabled = currentBlock - deposit.enabledAtBlock;
  const withdrawable = blocksSinceEnabled >= blockDelay;
}
```

---

## 4. Known Limitations

1. **Off-chain deposit tracking required** — The contract cannot enumerate a user's deposits. Wallets must maintain their own index.

2. **Flag encoding constrains values** — NFT values must satisfy `value % 256 == flag`. This limits deposit amounts to specific congruence classes modulo 256.

3. **memoryId is not verified on-chain** — The contract accepts any `memoryId` bytes. The off-chain layer must ensure `memoryId` is unique per deposit to prevent replay.

4. **NFTs are not burned until withdraw** — A deposit NFT sits at the contract address indefinitely. The `withdraw` function burns it by excluding it from outputs.

5. **Emergency withdraw bypasses everything** — The emergency key can withdraw any deposit at any time, regardless of block delay.

---

## 5. Reference: Contract Parameter Derivation

The contract address is derived from the compiled CashScript artifact:

```javascript
import SafeDelay from './contracts/SafeDelay.json';

// contractPkh is the first 20 bytes of the contract's hash160
const contractPkh = SafeDelay.contractBinaryHash; // or derived from artifact
const contractAddress = pkhToAddress(contractPkh); // converted to cashaddr
```

See [contracts/README.md](contracts/README.md) for deployment instructions.