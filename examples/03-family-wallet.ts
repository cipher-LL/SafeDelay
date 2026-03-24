/**
 * Example 3: Family Wallet (2-of-3 with 7-day lock)
 * 
 * Family members share a wallet requiring 2-of-3 signatures.
 * 7-day lock provides cooldown to prevent hasty decisions.
 * 
 * Use case: "Family savings - parents + grandparent + child"
 * Any 2 can authorize, but there's a 7-day waiting period.
 * 
 * Run: npx ts-node examples/03-family-wallet.ts
 */

import { Contract, mnemonicToWallet } from 'cashscript';
import { SafeDelayMultiSigArtifact } from '../artifacts/SafeDelayMultiSig.artifact.json' assert { type: "json" };

// Configuration
const config = {
  // Family member mnemonics (replace with actual ones)
  parent1Mnemonic: 'parent one mnemonic',
  parent2Mnemonic: 'parent two mnemonic',
  grandparentMnemonic: 'grandparent mnemonic',
  
  // Lock period: 7 days ≈ 1008 blocks
  lockBlocks: 1008
};

const provider = { url: 'https://api.blacktown.io/rpc', network: 'testnet' };

async function main() {
  // Derive keys
  const ks1 = await mnemonicToWallet(config.parent1Mnemonic);
  const ks2 = await mnemonicToWallet(config.parent2Mnemonic);
  const ks3 = await mnemonicToWallet(config.grandparentMnemonic);

  const owner1 = ks1.getAddress().toHash();
  const owner2 = ks2.getAddress().toHash();
  const owner3 = ks3.getAddress().toHash();

  console.log('=== Family Wallet Setup ===');
  console.log('Parent 1:', ks1.getAddress());
  console.log('Parent 2:', ks2.getAddress());
  console.log('Grandparent:', ks3.getAddress());

  const currentBlock = await provider.getBlockCount();
  const lockEndBlock = currentBlock + config.lockBlocks;

  // Create 2-of-3 multisig with 7-day lock
  const familyWallet = await Contract.fromArtifact(
    SafeDelayMultiSigArtifact,
    {
      owner1,
      owner2,
      owner3,
      threshold: 2,
      lockEndBlock: lockEndBlock,
      depositReceipts: []
    },
    { provider }
  );

  console.log('\n=== Contract Deployed ===');
  console.log('Address:', familyWallet.address);
  console.log('Lock: 7 days (~1008 blocks)');
  console.log('Required: 2-of-3 signatures');
  console.log('Expires at block:', lockEndBlock);

  // === ANYONE CAN DEPOSIT ===
  console.log('\n=== Depositing Funds ===');
  const depositor = await mnemonicToWallet('any family member can deposit');
  await familyWallet.deposit().send(depositor.getAddress(), 50000n);
  console.log('Deposited 50,000 sats');

  // === CHECK STATUS ===
  const latestBlock = await provider.getBlockCount();
  const daysRemaining = Math.floor((lockEndBlock - latestBlock) / 144);
  console.log('\n=== Status ===');
  console.log(`Blocks until unlock: ${lockEndBlock - latestBlock}`);
  console.log(`Days remaining: ${daysRemaining}`);

  // === WITHDRAW (requires 2-of-3 + lock expired) ===
  // 
  // Example: Parent 1 + Parent 2 agree to withdraw
  // After 7-day lock expires
  /*
  const recipient = ks1.getAddress();
  
  await familyWallet.withdraw(
    ks1.getPrivateKey(), ks1.getPublicKey(), await ks1.sign(message),
    ks2.getPrivateKey(), ks2.getPublicKey(), await ks2.sign(message),
    ks3.getPrivateKey(), ks3.getPublicKey(), await ks3.sign(message),
    40000n
  ).send(recipient);
  */

  // === EMERGENCY: ANY 1 OWNER CAN CANCEL ===
  // Useful if some family members are unavailable
  console.log('\n=== Emergency Recovery ===');
  console.log('Any single owner can cancel anytime:');
  console.log('  await familyWallet.cancel().send(ownerAddress)');
  console.log('This immediately retrieves all funds to that owner');
}

main().catch(console.error);
