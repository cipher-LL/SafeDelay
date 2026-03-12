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
});
