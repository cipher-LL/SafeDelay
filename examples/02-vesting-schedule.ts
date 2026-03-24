/**
 * Example 2: Vesting Schedule
 * 
 * 12-month linear unlock with a 2-of-3 multisig for security.
 * Use case: "Team vesting - releases monthly over a year"
 * 
 * This example shows how to set up a vesting schedule:
 * 1. Create contracts for each monthly unlock
 * 2. Use 2-of-3 multisig for security
 * 3. Configure lock periods for each tranche
 * 
 * Run: npx ts-node examples/02-vesting-schedule.ts
 */

import { Contract, mnemonicToWallet } from 'cashscript';
import { SafeDelayMultiSigArtifact } from '../artifacts/SafeDelayMultiSig.artifact.json' assert { type: "json" };

// Configuration
const config = {
  // Team member mnemonics (replace with actual ones)
  member1Mnemonic: 'member one twelve word mnemonic',
  member2Mnemonic: 'member two twelve word mnemonic', 
  member3Mnemonic: 'member three twelve word mnemonic',
  
  // Total vesting period: 12 months
  totalMonths: 12,
  
  // Amount to vest total
  totalAmount: 1000000n // 0.01 BCH total
};

const provider = { url: 'https://api.blacktown.io/rpc', network: 'testnet' };

async function main() {
  // Derive keys for all 3 team members
  const keystore1 = await mnemonicToWallet(config.member1Mnemonic);
  const keystore2 = await mnemonicToWallet(config.member2Mnemonic);
  const keystore3 = await mnemonicToWallet(config.member3Mnemonic);

  const owner1 = keystore1.getAddress().toHash();
  const owner2 = keystore2.getAddress().toHash();
  const owner3 = keystore3.getAddress().toHash();

  console.log('Team Member 1:', keystore1.getAddress());
  console.log('Team Member 2:', keystore2.getAddress());
  console.log('Team Member 3:', keystore3.getAddress());

  const currentBlock = await provider.getBlockCount();
  
  // Calculate blocks per month (~4320 blocks/month)
  const blocksPerMonth = 4320;

  // === VESTING APPROACH ===
  // 
  // For true vesting, you'd create multiple contracts:
  // - Month 1: unlock at currentBlock + 4320
  // - Month 2: unlock at currentBlock + 8640
  // - etc.
  //
  // This example shows the first tranche unlock.

  const firstTrancheUnlock = currentBlock + blocksPerMonth;
  const amountPerTranche = config.totalAmount / BigInt(config.totalMonths);

  console.log('\n=== Creating Month 1 Vesting Contract ===');
  console.log('Unlock Block:', firstTrancheUnlock);
  console.log('Amount:', amountPerTranche, 'satoshis');

  // Create 2-of-3 multisig SafeDelay
  const vestingContract = await Contract.fromArtifact(
    SafeDelayMultiSigArtifact,
    {
      owner1,
      owner2,
      owner3,
      threshold: 2,
      lockEndBlock: firstTrancheUnlock,
      depositReceipts: []
    },
    { provider }
  );

  console.log('\nContract Address:', vestingContract.address);
  console.log('Requires 2-of-3 signatures to withdraw');
  console.log('Unlocks at block:', firstTrancheUnlock);

  // === DEPOSIT ===
  const depositor = await mnemonicToWallet('depositor mnemonic');
  await vestingContract.deposit().send(depositor.getAddress(), amountPerTranche);
  console.log('\nDeposited vesting tranche');

  // === CHECK STATUS ===
  const latestBlock = await provider.getBlockCount();
  const blocksUntilUnlock = firstTrancheUnlock - latestBlock;
  
  if (blocksUntilUnlock > 0) {
    const daysUntil = Math.floor(blocksUntilUnlock / 144);
    console.log(`Lock active: ${blocksUntilUnlock} blocks (~${daysUntil} days)`);
  } else {
    console.log('✅ Unlock period reached!');
  }

  // === WITHDRAW (after unlock) ===
  // Requires 2-of-3 signatures
  /*
  const recipient = keystore1.getAddress();
  
  await vestingContract.withdraw(
    keystore1.getPrivateKey(),
    keystore1.getPublicKey(),
    keystore1.sign(new Uint8Array(32)),
    
    keystore2.getPrivateKey(),
    keystore2.getPublicKey(),
    keystore2.sign(new Uint8Array(32)),
    
    keystore3.getPrivateKey(),
    keystore3.getPublicKey(),
    keystore3.sign(new Uint8Array(32)),
    
    amountPerTranche - 1000n
  ).send(recipient);
  */

  console.log('\n=== Full Vesting Setup ===');
  console.log('To complete vesting setup, create 11 more contracts:');
  for (let month = 2; month <= config.totalMonths; month++) {
    const unlockBlock = currentBlock + (blocksPerMonth * month);
    console.log(`  Month ${month}: unlock at block ${unlockBlock}`);
  }
}

main().catch(console.error);
