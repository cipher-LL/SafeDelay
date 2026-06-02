/**
 * Example 4: Emergency Fund (1-year lock, cancelable)
 * 
 * Long-term locked savings with option to cancel.
 * Good for "emergency fund I shouldn't touch"
 * 
 * Features:
 * - 1 year lock period (~52560 blocks)
 * - Cancelable anytime by owner
 * - Cancel has no penalty, but requires intentional action
 * 
 * Run: npx ts-node examples/04-emergency-fund.ts
 */

import { Contract, mnemonicToWallet } from 'cashscript';
import { SafeDelayArtifact } from '../artifacts/SafeDelay.artifact.json' assert { type: "json" };

// Configuration
const config = {
  // Your mnemonic (keep safe!)
  ownerMnemonic: 'your secure mnemonic here',
  
  // 1 year lock ≈ 52560 blocks (assuming ~10 min blocks)
  lockBlocks: 52560
};

const provider = { url: 'https://api.blacktown.io/rpc', network: 'testnet' };

async function main() {
  const keystore = await mnemonicToWallet(config.ownerMnemonic);
  const ownerAddress = keystore.getAddress();
  const ownerPKH = ownerAddress.toHash();

  console.log('=== Emergency Fund Setup ===');
  console.log('Owner:', ownerAddress);

  const currentBlock = await provider.getBlockCount();
  const lockEndBlock = currentBlock + config.lockBlocks;

  // Convert to years/days for display
  const daysLocked = Math.floor(config.lockBlocks / 144);
  const yearsLocked = daysLocked / 365;

  console.log(`Lock Period: ${daysLocked} days (~${yearsLocked.toFixed(1)} years)`);
  console.log(`Lock End Block: ${lockEndBlock}`);

  // Create SafeDelay contract
  const emergencyFund = await Contract.fromArtifact(
    SafeDelayArtifact,
    {
      ownerPKH,
      lockEndBlock: lockEndBlock,
      depositReceipts: []
    },
    { provider, keystore }
  );

  console.log('\n=== Contract Deployed ===');
  console.log('Address:', emergencyFund.address);
  console.log('Lock: 1 year (cancelable)');

  // === DEPOSIT ===
  console.log('\n=== Depositing Funds ===');
  const depositorKeystore = await mnemonicToWallet('depositor mnemonic');
  const depositAmount = 100000n; // 0.001 BCH
  
  await emergencyFund.deposit().send(depositorKeystore.getAddress(), depositAmount);
  console.log(`Deposited: ${depositAmount} sats`);

  // === CHECK BALANCE ===
  const balance = await emergencyFund.getBalance();
  console.log(`\nBalance: ${balance} sats`);

  // === STATUS CHECK ===
  const latestBlock = await provider.getBlockCount();
  const blocksRemaining = lockEndBlock - latestBlock;
  const daysRemaining = Math.floor(blocksRemaining / 144);

  console.log('\n=== Status ===');
  if (blocksRemaining > 0) {
    console.log(`⏳ Locked: ${blocksRemaining} blocks (~${daysRemaining} days)`);
    console.log('');
    console.log('Withdraw: After lock expires, use:');
    console.log('  await emergencyFund.withdraw().send(recipient, amount)');
    console.log('');
    console.log('Cancel (emergency access):');
    console.log('  await emergencyFund.cancel().send(ownerAddress)');
  } else {
    console.log('✅ Lock expired - withdraw available!');
  }

  // === TIMELINE ===
  console.log('\n=== Timeline ===');
  const lockExpiryDate = new Date(Date.now() + (daysLocked * 24 * 60 * 60 * 1000));
  console.log(`Lock expires: ~${lockExpiryDate.toISOString().split('T')[0]}`);
  console.log('');
  console.log('Important Notes:');
  console.log('1. Write down the contract address - you need it to access funds');
  console.log('2. The lock can only be extended, never shortened');
  console.log('3. If you cancel, you get funds immediately but lose the lock');
  console.log('4. Consider setting a new lock after canceling to restart the timer');
}

main().catch(console.error);
