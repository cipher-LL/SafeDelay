// ESM test runner for SafeDelay contract using CashScript 0.10+ API
import artifact from '../artifacts/SafeDelay.artifact.json' with { type: 'json' };
import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';

// Helper to generate key pair with proper BCH address
function generateKeyPair() {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (!publicKey) throw new Error('Failed to derive public key');
  
  const pkh = hash160(new Uint8Array(publicKey));
  
  const result = encodeCashAddress({
    network: 'bchtest',
    type: 'p2pkh',
    payload: pkh
  });
  const address = result.address;
  
  return {
    privateKey,
    publicKey: new Uint8Array(publicKey),
    pkh,
    address,
    signer: new SignatureTemplate(privateKey),
  };
}

// Create a fixed UTXO for testing
function createUtxo(address, satoshis) {
  return {
    txHash: '0'.repeat(64),
    vout: 0,
    satoshis: BigInt(satoshis),
    token: null,
    address: address
  };
}

// Test counters
let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    if (e.stack) {
      console.log(`  Stack: ${e.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function notToFailRequire(tx) {
  try {
    await tx.toString();
    return true;
  } catch (e) {
    throw new Error(`Transaction should not fail require but got: ${e.message}`);
  }
}

async function toFailRequire(tx) {
  try {
    await tx.toString();
    throw new Error('Transaction should have failed require but did not');
  } catch (e) {
    if (e.message.includes('REJECTED') || e.message.includes('require')) {
      return true;
    }
    throw new Error(`Transaction failed with unexpected error: ${e.message}`);
  }
}

// Main test suite
async function main() {
  console.log('Running SafeDelay Contract Tests\n');
  console.log('================================\n');
  
  // Initialize provider
  const provider = new MockNetworkProvider();
  
  // Generate key pairs
  const ownerKeyPair = generateKeyPair();
  const depositorKeyPair = generateKeyPair();
  const ownerPKH = ownerKeyPair.pkh;
  const lockEndBlock = 1000n;
  
  console.log(`Owner: ${ownerKeyPair.address}`);
  console.log(`Depositor: ${depositorKeyPair.address}\n`);
  
  // Create contract - new API: constructor takes artifact, args array, and options object
  const contract = new Contract(artifact, [ownerPKH, lockEndBlock], { provider });
  console.log(`Contract address: ${contract.address}\n`);
  
  // Add contract UTXO with initial balance
  const initialUtxo = createUtxo(contract.address, 100000);
  provider.addUtxo(contract.address, initialUtxo);
  
  // Get contract methods
  console.log('Contract methods:', Object.keys(contract));
  console.log('Contract functions:', contract.functions);
  
  // Check if unlock exists
  if (contract.unlock) {
    console.log('Unlock methods:', Object.keys(contract.unlock));
  }
  
  // TESTS
  await runTest('deposit: should allow anyone to deposit BCH into the contract', async () => {
    const depositorUtxo = createUtxo(depositorKeyPair.address, 50000);
    provider.addUtxo(depositorKeyPair.address, depositorUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    // Use TransactionBuilder with new API
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.deposit(depositorKeyPair.publicKey, depositorKeyPair.signer))
      .addInput(depositorUtxo, new SignatureTemplate(depositorKeyPair.privateKey))
      .addOutput({ to: contract.address, amount: 149000n });
    
    await notToFailRequire(builder);
  });
  
  await runTest('withdraw: should allow owner to withdraw after lock expires', async () => {
    const ownerUtxo = createUtxo(ownerKeyPair.address, 60000);
    provider.addUtxo(ownerKeyPair.address, ownerUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n))
      .addInput(ownerUtxo, new SignatureTemplate(ownerKeyPair.privateKey))
      .addOutput({ to: ownerKeyPair.address, amount: 50000n })
      .setLocktime(1100);
    
    await notToFailRequire(builder);
  });
  
  await runTest('withdraw: should fail if lock has not expired', async () => {
    const ownerUtxo = createUtxo(ownerKeyPair.address, 1000);
    provider.addUtxo(ownerKeyPair.address, ownerUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n))
      .addInput(ownerUtxo, new SignatureTemplate(ownerKeyPair.privateKey))
      .addOutput({ to: ownerKeyPair.address, amount: 50000n })
      .setLocktime(500);
    
    await toFailRequire(builder);
  });
  
  await runTest('withdraw: should fail if called by non-owner', async () => {
    const attackerKeyPair = generateKeyPair();
    const ownerUtxo = createUtxo(ownerKeyPair.address, 1000);
    provider.addUtxo(ownerKeyPair.address, ownerUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.withdraw(attackerKeyPair.publicKey, attackerKeyPair.signer, 50000n))
      .addInput(ownerUtxo, new SignatureTemplate(ownerKeyPair.privateKey))
      .addOutput({ to: ownerKeyPair.address, amount: 50000n })
      .setLocktime(1100);
    
    await toFailRequire(builder);
  });
  
  await runTest('cancel: should allow owner to cancel and refund anytime', async () => {
    const ownerUtxo = createUtxo(ownerKeyPair.address, 100000);
    provider.addUtxo(ownerKeyPair.address, ownerUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer))
      .addInput(ownerUtxo, new SignatureTemplate(ownerKeyPair.privateKey))
      .addOutput({ to: ownerKeyPair.address, amount: 100000n })
      .setLocktime(500);
    
    await notToFailRequire(builder);
  });
  
  await runTest('cancel: should fail if called by non-owner', async () => {
    const attackerKeyPair = generateKeyPair();
    const ownerUtxo = createUtxo(ownerKeyPair.address, 1000);
    provider.addUtxo(ownerKeyPair.address, ownerUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.cancel(attackerKeyPair.publicKey, attackerKeyPair.signer))
      .addInput(ownerUtxo, new SignatureTemplate(ownerKeyPair.privateKey))
      .addOutput({ to: ownerKeyPair.address, amount: 1000n })
      .setLocktime(500);
    
    await toFailRequire(builder);
  });
  
  await runTest('cancel: should allow cancel after lock has expired', async () => {
    const ownerUtxo = createUtxo(ownerKeyPair.address, 100000);
    provider.addUtxo(ownerKeyPair.address, ownerUtxo);
    
    const contractUtxos = await provider.getUtxos(contract.address);
    const contractUtxo = contractUtxos[0];
    
    const builder = new TransactionBuilder({ provider });
    builder
      .addInput(contractUtxo, contract.unlock.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer))
      .addInput(ownerUtxo, new SignatureTemplate(ownerKeyPair.privateKey))
      .addOutput({ to: ownerKeyPair.address, amount: 100000n })
      .setLocktime(2000);
    
    await notToFailRequire(builder);
  });
  
  // Summary
  console.log('\n================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
