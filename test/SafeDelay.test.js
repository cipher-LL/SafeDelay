import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';
import artifact from '../artifacts/SafeDelay.artifact.json' with { type: 'json' };

// Helper to generate a UTXO with token property (required by cashscript 0.10+)
function createUtxo(satoshis) {
  const utxo = randomUtxo({ satoshis });
  // Add token property - undefined means no tokens, just BCH
  Object.defineProperty(utxo, 'token', {
    value: undefined,
    writable: true,
    enumerable: true,
    configurable: true
  });
  return utxo;
}

// Helper to generate key pair with proper BCH address
function generateKeyPair() {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (!publicKey) throw new Error('Failed to derive public key');
  
  const pkh = hash160(publicKey);
  
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

describe('SafeDelay Contract', () => {
  const provider = new MockNetworkProvider();
  
  const ownerKeyPair = generateKeyPair();
  const depositorKeyPair = generateKeyPair();
  const attackerKeyPair = generateKeyPair();
  
  const ownerPKH = ownerKeyPair.pkh;
  const lockEndBlock = 1000n;
  
  let contract;
  let contractUtxo;

  beforeEach(() => {
    contract = new Contract(artifact, [ownerPKH, lockEndBlock], { provider });
    
    const utxo = createUtxo(100000n);
    provider.addUtxo(contract.address, utxo);
    contractUtxo = utxo;
  });

  describe('deposit', () => {
    it('should allow anyone to deposit BCH into the contract', async () => {
      const depositorUtxo = createUtxo(50000n);
      provider.addUtxo(depositorKeyPair.address, depositorUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.deposit(depositorKeyPair.publicKey, depositorKeyPair.signer))
        .addInput(depositorUtxo, depositorKeyPair.signer.unlockP2PKH())
        .addOutput({ to: contract.address, amount: 149000n })
        .setLocktime(500);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });
  });

  describe('withdraw', () => {
    it('should allow owner to withdraw after lock expires', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 50000n })
        .addOutput({ to: contract.address, amount: 49000n })
        .setLocktime(1100);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should fail if lock has not expired', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 50000n })
        .addOutput({ to: contract.address, amount: 49000n })
        .setLocktime(500);

      await expect(builder.send()).rejects.toThrow();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attackerKeyPair.address, attackerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.withdraw(attackerKeyPair.publicKey, attackerKeyPair.signer, 50000n))
        .addInput(attackerUtxo, attackerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: attackerKeyPair.address, amount: 50000n })
        .addOutput({ to: contract.address, amount: 49000n })
        .setLocktime(1100);

      await expect(builder.send()).rejects.toThrow();
    });
  });

  describe('cancel', () => {
    it('should allow owner to cancel and refund anytime', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 199000n })
        .setLocktime(500);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attackerKeyPair.address, attackerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.cancel(attackerKeyPair.publicKey, attackerKeyPair.signer))
        .addInput(attackerUtxo, attackerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: attackerKeyPair.address, amount: 199000n })
        .setLocktime(500);

      await expect(builder.send()).rejects.toThrow();
    });

    it('should allow cancel after lock has expired', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 199000n })
        .setLocktime(2000);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });
  });

  describe('extend', () => {
    it('should allow owner to extend lock to a later block', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // lockEndBlock is 1000, extend to 2000
      const newLockEndBlock = 2000n;

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, newLockEndBlock))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 199000n })
        .setLocktime(500);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should fail if new lock end block is not greater than current', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // lockEndBlock is 1000, trying to extend to same value should fail
      const newLockEndBlock = 1000n;

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, newLockEndBlock))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 199000n })
        .setLocktime(500);

      await expect(builder.send()).rejects.toThrow();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attackerKeyPair.address, attackerUtxo);

      const newLockEndBlock = 2000n;

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.extend(attackerKeyPair.publicKey, attackerKeyPair.signer, newLockEndBlock))
        .addInput(attackerUtxo, attackerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: attackerKeyPair.address, amount: 199000n })
        .setLocktime(500);

      await expect(builder.send()).rejects.toThrow();
    });

    it('should succeed when extending even before lock has expired', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // lockEndBlock is 1000, current locktime is 500 (before expiry), extend to 2000
      const newLockEndBlock = 2000n;

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, newLockEndBlock))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 199000n })
        .setLocktime(500);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should succeed when extending after lock has already expired', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // lockEndBlock is 1000, extend to 2000, locktime past expiry
      const newLockEndBlock = 2000n;

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(contractUtxo, contract.unlock.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, newLockEndBlock))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 199000n })
        .setLocktime(1500);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });
  });
});