import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate } from 'cashscript';
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

      // Should succeed - deposit adds funds to the contract
      const tx = await contract.functions.deposit(depositorKeyPair.publicKey, depositorKeyPair.signer)
        .from(contractUtxo)
        .from(depositorUtxo)
        .to(contract.address, 149000n)
        .withTime(500)
        .send();

      // If we get here, the contract succeeded
      expect(tx).toBeDefined();
    });
  });

  describe('withdraw', () => {
    it('should allow owner to withdraw after lock expires', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const tx = await contract.functions.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n)
        .from(contractUtxo)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 50000n)
        .to(contract.address, 49000n)
        .withTime(1100)
        .send();

      expect(tx).toBeDefined();
    });

    it('should fail if lock has not expired', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // Should fail because lock hasn't expired
      await expect(
        contract.functions.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n)
          .from(contractUtxo)
          .from(ownerUtxo)
          .to(ownerKeyPair.address, 50000n)
          .to(contract.address, 49000n)
          .withTime(500)
          .send()
      ).rejects.toThrow();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attackerKeyPair.address, attackerUtxo);

      // Should fail because attacker is not the owner
      await expect(
        contract.functions.withdraw(attackerKeyPair.publicKey, attackerKeyPair.signer, 50000n)
          .from(contractUtxo)
          .from(attackerUtxo)
          .to(attackerKeyPair.address, 50000n)
          .to(contract.address, 49000n)
          .withTime(1100)
          .send()
      ).rejects.toThrow();
    });
  });

  describe('cancel', () => {
    it('should allow owner to cancel and refund anytime', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const tx = await contract.functions.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer)
        .from(contractUtxo)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 199000n)
        .withTime(500)
        .send();

      expect(tx).toBeDefined();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attackerKeyPair.address, attackerUtxo);

      // Should fail because attacker is not the owner
      await expect(
        contract.functions.cancel(attackerKeyPair.publicKey, attackerKeyPair.signer)
          .from(contractUtxo)
          .from(attackerUtxo)
          .to(attackerKeyPair.address, 199000n)
          .withTime(500)
          .send()
      ).rejects.toThrow();
    });

    it('should allow cancel after lock has expired', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const tx = await contract.functions.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer)
        .from(contractUtxo)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 199000n)
        .withTime(2000)
        .send();

      expect(tx).toBeDefined();
    });
  });

  describe('extend', () => {
    it('should allow owner to extend lock to a later block', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      const newLockEndBlock = 2000n;
      // totalBalance = 100000 + 100000 - 1000 = 199000

      const tx = await contract.functions.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, newLockEndBlock)
        .from(contractUtxo)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 199000n)
        .withTime(500)
        .send();

      expect(tx).toBeDefined();
    });

    it('should fail if trying to extend to an earlier block', async () => {
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // Try to extend to an earlier block (500 < 1000 original lockEndBlock)
      const earlierLockEndBlock = 500n;

      await expect(
        contract.functions.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, earlierLockEndBlock)
          .from(contractUtxo)
          .from(ownerUtxo)
          .to(ownerKeyPair.address, 199000n)
          .withTime(500)
          .send()
      ).rejects.toThrow();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attackerKeyPair.address, attackerUtxo);

      const newLockEndBlock = 2000n;

      // Should fail because attacker is not the owner
      await expect(
        contract.functions.extend(attackerKeyPair.publicKey, attackerKeyPair.signer, newLockEndBlock)
          .from(contractUtxo)
          .from(attackerUtxo)
          .to(attackerKeyPair.address, 199000n)
          .withTime(500)
          .send()
      ).rejects.toThrow();
    });

    it('should allow owner to extend again after first extension', async () => {
      // First extension
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);

      // Get the contract at the extended state (this is a simplified test)
      // In practice, you'd need to track the new contract instance
      const extendedContract = new Contract(artifact, [ownerPKH, 2000n], { provider });
      const extendedUtxo = createUtxo(100000n);
      provider.addUtxo(extendedContract.address, extendedUtxo);

      const secondLockEndBlock = 3000n;
      // totalBalance = 100000 + 100000 - 1000 = 199000

      const tx = await extendedContract.functions.extend(ownerKeyPair.publicKey, ownerKeyPair.signer, secondLockEndBlock)
        .from(extendedUtxo)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 199000n)
        .withTime(500)
        .send();

      expect(tx).toBeDefined();
    });
  });
});
