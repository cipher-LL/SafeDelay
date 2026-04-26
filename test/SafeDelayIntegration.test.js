import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';
import artifact from '../artifacts/SafeDelay.artifact.json' with { type: 'json' };

function createUtxo(satoshis) {
  const utxo = randomUtxo({ satoshis });
  Object.defineProperty(utxo, 'token', {
    value: undefined,
    writable: true,
    enumerable: true,
    configurable: true
  });
  return utxo;
}

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

  return {
    privateKey,
    publicKey: new Uint8Array(publicKey),
    pkh,
    address: result.address,
    signer: new SignatureTemplate(privateKey),
  };
}

describe('SafeDelay Integration Tests', () => {
  const provider = new MockNetworkProvider();
  const ownerKeyPair = generateKeyPair();
  const ownerPKH = ownerKeyPair.pkh;

  describe('extend() function', () => {
    it('should allow owner to extend lock to a later block', async () => {
      const contract = new Contract(artifact, [ownerPKH, 1000n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);

      // Owner UTXO is for signature only (contract funds the tx)
      // Use 0-value to avoid MockNetworkProvider auto-change placing at output[0]
      const ownerUtxo = createUtxo(0n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(utxo, contract.unlock.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, 2000n))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 99000n })
        .setLocktime(500);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should fail when extending to an earlier block', async () => {
      const contract = new Contract(artifact, [ownerPKH, 2000n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);

      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(utxo, contract.unlock.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, 1000n))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 99000n })
        .setLocktime(500);

      await expect(builder.send()).rejects.toThrow();
    });

    it('should fail if called by non-owner', async () => {
      const attacker = generateKeyPair();
      const contract = new Contract(artifact, [ownerPKH, 1000n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);

      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attacker.address, attackerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(utxo, contract.unlock.extend(attacker.publicKey, attacker.signer, 2000n))
        .addInput(attackerUtxo, attacker.signer.unlockP2PKH())
        .addOutput({ to: attacker.address, amount: 99000n })
        .setLocktime(500);

      await expect(builder.send()).rejects.toThrow();
    });
  });

  describe('Partial withdrawal edge cases', () => {
    it('should allow partial balance withdrawal after lock expires', async () => {
      const contract = new Contract(artifact, [ownerPKH, 500n], { provider });
      const utxo = createUtxo(500000n);
      provider.addUtxo(contract.address, utxo);

      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(utxo, contract.unlock.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 100000n))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 100000n })
        .addOutput({ to: contract.address, amount: 399000n })
        .setLocktime(600);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should allow cancel after lock expires', async () => {
      const contract = new Contract(artifact, [ownerPKH, 500n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);

      // Owner UTXO is for signature only (contract funds the tx)
      // Use 0-value to avoid MockNetworkProvider auto-change placing at output[0]
      const ownerUtxo = createUtxo(0n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(utxo, contract.unlock.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer))
        .addInput(ownerUtxo, ownerKeyPair.signer.unlockP2PKH())
        .addOutput({ to: ownerKeyPair.address, amount: 99000n })
        .setLocktime(1000);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });
  });

  describe('Multi-deposit scenarios', () => {
    it('should handle multiple deposits over time', async () => {
      const contract = new Contract(artifact, [ownerPKH, 1000n], { provider });

      // First deposit
      const depositor1 = generateKeyPair();
      const d1Utxo = createUtxo(100000n);
      provider.addUtxo(depositor1.address, d1Utxo);

      const initialUtxo = createUtxo(100000n);
      provider.addUtxo(contract.address, initialUtxo);

      const builder1 = new TransactionBuilder({ provider });
      builder1
        .addInput(initialUtxo, contract.unlock.deposit(depositor1.publicKey, depositor1.signer))
        .addInput(d1Utxo, depositor1.signer.unlockP2PKH())
        .addOutput({ to: contract.address, amount: 199000n })
        .setLocktime(500);

      await builder1.send();

      // Second deposit
      const depositor2 = generateKeyPair();
      const d2Utxo = createUtxo(100000n);
      provider.addUtxo(depositor2.address, d2Utxo);

      const contractUtxo = createUtxo(199000n);
      provider.addUtxo(contract.address, contractUtxo);

      const builder2 = new TransactionBuilder({ provider });
      builder2
        .addInput(contractUtxo, contract.unlock.deposit(depositor2.publicKey, depositor2.signer))
        .addInput(d2Utxo, depositor2.signer.unlockP2PKH())
        .addOutput({ to: contract.address, amount: 298000n })
        .setLocktime(600);

      const tx = await builder2.send();
      expect(tx).toBeDefined();
    });
  });
});
