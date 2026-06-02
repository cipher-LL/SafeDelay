# SafeDelay Demo Files

Standalone HTML demos for testing SafeDelay contracts.

## Files

| File | Description |
|------|-------------|
| [01-simple-savings.html](./01-simple-savings.html) | Deploy a basic time-locked wallet |
| [02-multisig-wallet.html](./02-multisig-wallet.html) | Create a 2-of-3 or 3-of-3 MultiSig wallet |
| [03-check-status.html](./03-check-status.html) | Check contract lock status |

## Usage

1. Open any `.html` file in a browser
2. Enter your mnemonic (testnet recommended)
3. Configure lock period
4. Click the button

## Notes

- **Testnet recommended** - These demos interact with the BCH network
- Mnemonics are processed locally - never share your real mnemonics
- For full deployment with transaction signing, use the Node.js examples in `/examples`
- The demos calculate contract addresses but full on-chain deployment requires a signer

## Network

Default network: Testnet (via Blacktown RPC)

To switch to mainnet, select "Mainnet" from the dropdown.
