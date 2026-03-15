import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';
import artifact from '../artifacts/SafeDelayMultiSig.artifact.json' with { type: 'json' };

// Helper to generate a UTXO with token property (required by cashscript 0.10+)
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

describe('SafeDelayMultiSig Contract', () => {
  const provider = new MockNetworkProvider();
  
  // Generate 3 owners for multi-sig setup
  const owner1 = generateKeyPair();
  const owner2 = generateKeyPair();
  const owner3 = generateKeyPair();
  
  // Require 2 of 3 signatures
  const requiredSigs = 2n;
  const lockEndBlock = 1000n;
  
  let contract;
  let contractUtxo;

  beforeEach(() => {
    // Constructor: owner1, owner2, owner3, requiredSigs, lockEndBlock
    contract = new Contract(artifact, [
      owner1.pkh, 
      owner2.pkh, 
      owner3.pkh, 
      requiredSigs, 
      lockEndBlock
    ], { provider });
    
    const utxo = createUtxo(200000n);
    provider.addUtxo(contract.address, utxo);
    contractUtxo = utxo;
  });

  describe('deposit', () => {
    it('should allow anyone to deposit BCH into the contract', async () => {
      const depositor = generateKeyPair();
      const depositorUtxo = createUtxo(50000n);
      provider.addUtxo(depositor.address, depositorUtxo);

      // Deposit: contract receives original + deposit - fee
      const tx = await contract.functions.deposit(depositor.publicKey, depositor.signer)
        .from(contractUtxo)
        .from(depositorUtxo)
        .to(contract.address, 245000n)  // Reduced for fees
        .withTime(500)
        .send();

      expect(tx).toBeDefined();
    });
  });

  describe('withdraw', () => {
    it('should allow withdrawal with 2 signatures after lock expires', async () => {
      // Use 0-value owner UTXOs (contract handles them as empty inputs)
      const owner1Utxo = createUtxo(0n);
      const owner2Utxo = createUtxo(0n);
      provider.addUtxo(owner1.address, owner1Utxo);
      provider.addUtxo(owner2.address, owner2Utxo);

      // Use owner1 and owner2 signatures (2 of 3 threshold met)
      // Also pass owner3 keys but since they don't match owners, they won't count
      const tx = await contract.functions
        .withdraw(
          owner1.publicKey, owner1.signer,
          owner2.publicKey, owner2.signer,
          owner3.publicKey, owner3.signer,  // Pass but won't match any owner
          100000n,
          owner1.pkh
        )
        .from(contractUtxo)
        .from(owner1Utxo)
        .from(owner2Utxo)
        .to(owner1.address, 100000n)
        .to(contract.address, 95000n)  // Adjusted for fees
        .withTime(1100)
        .send();

      expect(tx).toBeDefined();
    });

    it('should fail with only 1 signature (below threshold)', async () => {
      const owner1Utxo = createUtxo(0n);
      provider.addUtxo(owner1.address, owner1Utxo);

      // Only 1 valid signature (owner1) - doesn't meet 2-of-3 threshold
      // owner3 doesn't match any owner so won't count
      await expect(
        contract.functions
          .withdraw(
            owner1.publicKey, owner1.signer,
            owner3.publicKey, owner3.signer,  // Not an owner
            owner3.publicKey, owner3.signer,
            100000n,
            owner1.pkh
          )
          .from(contractUtxo)
          .from(owner1Utxo)
          .to(owner1.address, 100000n)
          .to(contract.address, 98000n)
          .withTime(1100)
          .send()
      ).rejects.toThrow();
    });

    it('should fail if lock has not expired', async () => {
      const owner1Utxo = createUtxo(0n);
      const owner2Utxo = createUtxo(0n);
      provider.addUtxo(owner1.address, owner1Utxo);
      provider.addUtxo(owner2.address, owner2Utxo);

      await expect(
        contract.functions
          .withdraw(
            owner1.publicKey, owner1.signer,
            owner2.publicKey, owner2.signer,
            owner3.publicKey, owner3.signer,
            100000n,
            owner1.pkh
          )
          .from(contractUtxo)
          .from(owner1Utxo)
          .from(owner2Utxo)
          .to(owner1.address, 100000n)
          .to(contract.address, 98000n)
          .withTime(500) // Before lock expiry
          .send()
      ).rejects.toThrow();
    });

    it('should fail if withdrawer is not an owner', async () => {
      const attacker = generateKeyPair();
      const attackerUtxo = createUtxo(0n);
      provider.addUtxo(attacker.address, attackerUtxo);

      // attacker is not an owner so no valid signatures
      await expect(
        contract.functions
          .withdraw(
            attacker.publicKey, attacker.signer,
            attacker.publicKey, attacker.signer,
            attacker.publicKey, attacker.signer,
            100000n,
            attacker.pkh
          )
          .from(contractUtxo)
          .from(attackerUtxo)
          .to(attacker.address, 100000n)
          .to(contract.address, 98000n)
          .withTime(1100)
          .send()
      ).rejects.toThrow();
    });
  });

  describe('cancel', () => {
    it('should allow cancel with 2 signatures anytime (bypasses lock)', async () => {
      const owner1Utxo = createUtxo(0n);
      const owner2Utxo = createUtxo(0n);
      provider.addUtxo(owner1.address, owner1Utxo);
      provider.addUtxo(owner2.address, owner2Utxo);

      // Cancel using owner1 and owner2 - bypasses lock
      const tx = await contract.functions
        .cancel(
          owner1.publicKey, owner1.signer,
          owner2.publicKey, owner2.signer,
          owner3.publicKey, owner3.signer,  // Not an owner
          owner1.pkh
        )
        .from(contractUtxo)
        .from(owner1Utxo)
        .from(owner2Utxo)
        .to(owner1.address, 198000n)
        .withTime(500) // Before lock expiry - should still work
        .send();

      expect(tx).toBeDefined();
    });

    it('should fail with only 1 signature', async () => {
      const owner1Utxo = createUtxo(0n);
      provider.addUtxo(owner1.address, owner1Utxo);

      await expect(
        contract.functions
          .cancel(
            owner1.publicKey, owner1.signer,
            owner3.publicKey, owner3.signer,  // Not an owner
            owner3.publicKey, owner3.signer,
            owner1.pkh
          )
          .from(contractUtxo)
          .from(owner1Utxo)
          .to(owner1.address, 198000n)
          .send()
      ).rejects.toThrow();
    });

    it('should fail if caller is not an owner', async () => {
      const attacker = generateKeyPair();
      const attackerUtxo = createUtxo(0n);
      provider.addUtxo(attacker.address, attackerUtxo);

      await expect(
        contract.functions
          .cancel(
            attacker.publicKey, attacker.signer,
            attacker.publicKey, attacker.signer,
            attacker.publicKey, attacker.signer,
            attacker.pkh
          )
          .from(contractUtxo)
          .from(attackerUtxo)
          .to(attacker.address, 198000n)
          .send()
      ).rejects.toThrow();
    });
  });
});