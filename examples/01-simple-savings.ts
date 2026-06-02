/**
 * Example 1: Simple Time-Locked Savings
 * 
 * A single-owner wallet that locks funds for 30 days.
 * Use case: "Don't touch this money for a month"
 * 
 * Run: npx ts-node examples/01-simple-savings.ts
 */

import { Contract, Keystore, mnemonicToWallet } from 'cashscript';
import { readFileSync } from 'fs';
import { SafeDelayArtifact } from '../artifacts/SafeDelay.artifact.json' assert { type: "json" };

// Configuration
const config = {
  // Your mnemonic (or generate a new one)
  mnemonic: 'your twelve word mnemonic here',
  // Lock period in blocks (approximately 1 block = 10 minutes)
  // 30 days ≈ 4320 blocks
  lockBlocks: 4320
};

// Provider (choose one)
// const provider = { network: 'mainnet' };
// const provider = { network: 'testnet' };
const provider = { url: 'https://api.blacktown.io/rpc', network: 'testnet' };

async function main() {
  // Derive wallet from mnemonic
  const keystore = await mnemonicToWallet(config.mnemonic);
  const ownerAddress = keystore.getAddress();
  const ownerPublicKeyHash = ownerAddress.toHash();

  console.log('Owner Address:', ownerAddress);
  console.log('Public Key Hash:', ownerPublicKeyHash);

  // Get current block height
  const currentBlock = await provider.getBlockCount();
  const lockEndBlock = currentBlock + config.lockBlocks;

  console.log('Current Block:', currentBlock);
  console.log('Lock End Block:', lockEndBlock);

  // Create SafeDelay contract
  const contract = await Contract.fromArtifact(
    SafeDelayArtifact,
    {
      ownerPKH: ownerPublicKeyHash,
      lockEndBlock: lockEndBlock,
      depositReceipts: []
    },
    { provider, keystore }
  );

  console.log('\n=== SafeDelay Contract Deployed ===');
  console.log('Contract Address:', contract.address);
  console.log('Lock Period:', config.lockBlocks, 'blocks (~30 days)');
  console.log('Expires at block:', lockEndBlock);

  // === DEPOSIT FUNDS ===
  console.log('\n=== Depositing Funds ===');
  
  // Any address can deposit
  const depositAmount = 100000n; // 0.001 BCH
  const depositorKeystore = await mnemonicToWallet('another mnemonic for depositing funds');
  
  await contract.deposit().send(depositorKeystore.getAddress(), depositAmount);
  console.log('Deposited:', depositAmount, 'satoshis');

  // === CHECK BALANCE ===
  console.log('\n=== Checking Balance ===');
  const balance = await contract.getBalance();
  console.log('Contract Balance:', balance, 'satoshis');

  // === CHECK LOCK STATUS ===
  console.log('\n=== Lock Status ===');
  const latestBlock = await provider.getBlockCount();
  const blocksRemaining = lockEndBlock - latestBlock;
  const daysRemaining = blocksRemaining / 144; // ~144 blocks per day
  console.log('Blocks Remaining:', blocksRemaining);
  console.log('Days Remaining:', daysRemaining.toFixed(1));

  if (blocksRemaining > 0) {
    console.log('⏳ Lock active - cannot withdraw yet');
    console.log('Use contract.cancel() if you need emergency access');
  } else {
    console.log('✅ Lock expired - can withdraw!');
  }

  // === AFTER LOCK EXPIRES: WITHDRAW ===
  // Uncomment after lock expires
  /*
  console.log('\n=== Withdrawing Funds ===');
  const recipientAddress = 'bitcoincash:...'; // Where to send funds
  
  await contract.withdraw().send(recipientAddress, balance - 1000n);
  console.log('Withdrew:', balance - 1000n, 'satoshis');
  */

  // === EMERGENCY: CANCEL ANYTIME ===
  // Uncomment to cancel (gets all funds back immediately)
  /*
  console.log('\n=== Cancelling Contract ===');
  await contract.cancel().send(ownerAddress);
  console.log('Contract cancelled, funds returned to owner');
  */
}

main().catch(console.error);
