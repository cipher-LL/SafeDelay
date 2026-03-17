import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate } from 'cashscript';
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
      
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);
      
      const tx = await contract.functions.extend(
        ownerKeyPair.publicKey, ownerKeyPair.signer, 2000n
      )
        .from(utxo).from(ownerUtxo)
        .to(ownerKeyPair.address, 199000n)
        .withTime(500).send();
      
      expect(tx).toBeDefined();
    });
    
    it('should fail when extending to an earlier block', async () => {
      const contract = new Contract(artifact, [ownerPKH, 2000n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);
      
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);
      
      await expect(
        contract.functions.extend(
          ownerKeyPair.publicKey, ownerKeyPair.signer, 1000n
        )
          .from(utxo).from(ownerUtxo)
          .to(ownerKeyPair.address, 199000n)
          .withTime(500).send()
      ).rejects.toThrow();
    });
    
    it('should fail if called by non-owner', async () => {
      const attacker = generateKeyPair();
      const contract = new Contract(artifact, [ownerPKH, 1000n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);
      
      const attackerUtxo = createUtxo(100000n);
      provider.addUtxo(attacker.address, attackerUtxo);
      
      await expect(
        contract.functions.extend(
          attacker.publicKey, attacker.signer, 2000n
        )
          .from(utxo).from(attackerUtxo)
          .to(attacker.address, 199000n)
          .withTime(500).send()
      ).rejects.toThrow();
    });
  });
  
  describe('Partial withdrawal edge cases', () => {
    it('should allow partial balance withdrawal after lock expires', async () => {
      const contract = new Contract(artifact, [ownerPKH, 500n], { provider });
      const utxo = createUtxo(500000n);
      provider.addUtxo(contract.address, utxo);
      
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);
      
      const tx = await contract.functions.withdraw(
        ownerKeyPair.publicKey, ownerKeyPair.signer, 100000n
      )
        .from(utxo).from(ownerUtxo)
        .to(ownerKeyPair.address, 100000n)
        .to(contract.address, 399000n)
        .withTime(600).send();
      
      expect(tx).toBeDefined();
    });
    
    it('should allow cancel after lock expires', async () => {
      const contract = new Contract(artifact, [ownerPKH, 500n], { provider });
      const utxo = createUtxo(100000n);
      provider.addUtxo(contract.address, utxo);
      
      const ownerUtxo = createUtxo(100000n);
      provider.addUtxo(ownerKeyPair.address, ownerUtxo);
      
      const tx = await contract.functions.cancel(
        ownerKeyPair.publicKey, ownerKeyPair.signer
      )
        .from(utxo).from(ownerUtxo)
        .to(ownerKeyPair.address, 199000n)
        .withTime(1000).send();
      
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
      
      await contract.functions.deposit(depositor1.publicKey, depositor1.signer)
        .from(initialUtxo).from(d1Utxo)
        .to(contract.address, 199000n)
        .withTime(500).send();
      
      // Second deposit
      const depositor2 = generateKeyPair();
      const d2Utxo = createUtxo(100000n);
      provider.addUtxo(depositor2.address, d2Utxo);
      
      const contractUtxo = createUtxo(199000n);
      provider.addUtxo(contract.address, contractUtxo);
      
      const tx = await contract.functions.deposit(depositor2.publicKey, depositor2.signer)
        .from(contractUtxo).from(d2Utxo)
        .to(contract.address, 298000n)
        .withTime(600).send();
      
      expect(tx).toBeDefined();
    });
  });
});
