import artifact from '../artifacts/SafeDelay.artifact.json' with { type: 'json' };
import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';

// Helper to generate key pair with proper BCH address
function generateKeyPair() {
  // Generate random 32 bytes for private key
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (!publicKey) throw new Error('Failed to derive public key');
  
  const pkh = hash160(publicKey);
  
  // Use CashAddress format with testnet prefix
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
    // Create SignatureTemplate for automatic signing
    signer: new SignatureTemplate(privateKey),
  };
}

describe('SafeDelay Contract', () => {
  const provider = new MockNetworkProvider();
  
  // Generate key pairs for testing
  const ownerKeyPair = generateKeyPair();
  const depositorKeyPair = generateKeyPair();
  const attackerKeyPair = generateKeyPair();
  
  // Contract parameters
  const ownerPKH = ownerKeyPair.pkh;
  const lockEndBlock = 1000n;
  
  let contract;
  let contractUtxo;

  beforeEach(() => {
    // Create contract with owner PKH and lock end block
    contract = new Contract(artifact, [ownerPKH, lockEndBlock], { provider });
    
    // Add contract UTXO with initial balance
    contractUtxo = provider.addUtxo(contract.address, randomUtxo({
      satoshis: 100000n,
    }));
  });

  describe('deposit', () => {
    it('should allow anyone to deposit BCH into the contract', async () => {
      const depositorUtxo = provider.addUtxo(depositorKeyPair.address, randomUtxo({
        satoshis: 50000n,
      }));

      // Use contract.functions.deposit() pattern
      const tx = await contract.functions.deposit(depositorKeyPair.publicKey, depositorKeyPair.signer)
        .from(depositorUtxo) // depositor's input
        .to(contract.address, 149000n) // back to contract (100000 + 50000 - 1000 fee)
        .withTime(500n)
        .send();

      // Should pass without errors
      expect(tx).not.toFailRequire();
    });
  });

  describe('withdraw', () => {
    it('should allow owner to withdraw after lock expires', async () => {
      const ownerUtxo = provider.addUtxo(ownerKeyPair.address, randomUtxo({
        satoshis: 1000n,
      }));

      // Lock has expired (locktime > lockEndBlock)
      const tx = await contract.functions.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n)
        .from(ownerUtxo) // owner's funding input
        .to(ownerKeyPair.address, 50000n) // withdrawal to owner
        .to(contract.address, 49000n) // remaining balance
        .withTime(1100n) // lock has expired
        .send();

      expect(tx).not.toFailRequire();
    });

    it('should fail if lock has not expired', async () => {
      const ownerUtxo = provider.addUtxo(ownerKeyPair.address, randomUtxo({
        satoshis: 1000n,
      }));

      // Lock has NOT expired (locktime < lockEndBlock)
      const tx = await contract.functions.withdraw(ownerKeyPair.publicKey, ownerKeyPair.signer, 50000n)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 50000n)
        .to(contract.address, 49000n)
        .withTime(500n) // lock NOT expired
        .send();

      expect(tx).toFailRequire();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = provider.addUtxo(attackerKeyPair.address, randomUtxo({
        satoshis: 1000n,
      }));

      const tx = await contract.functions.withdraw(attackerKeyPair.publicKey, attackerKeyPair.signer, 50000n)
        .from(attackerUtxo)
        .to(attackerKeyPair.address, 50000n)
        .to(contract.address, 49000n)
        .withTime(1100n)
        .send();

      // Should fail because hash160(attackerKeyPair) != ownerPKH
      expect(tx).toFailRequire();
    });
  });

  describe('cancel', () => {
    it('should allow owner to cancel and refund anytime', async () => {
      const ownerUtxo = provider.addUtxo(ownerKeyPair.address, randomUtxo({
        satoshis: 1000n,
      }));

      // Can cancel even before lock expires
      const tx = await contract.functions.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 100000n) // Full balance back to owner
        .withTime(500n)
        .send();

      expect(tx).not.toFailRequire();
    });

    it('should fail if called by non-owner', async () => {
      const attackerUtxo = provider.addUtxo(attackerKeyPair.address, randomUtxo({
        satoshis: 1000n,
      }));

      const tx = await contract.functions.cancel(attackerKeyPair.publicKey, attackerKeyPair.signer)
        .from(attackerUtxo)
        .to(attackerKeyPair.address, 100000n)
        .withTime(500n)
        .send();

      expect(tx).toFailRequire();
    });

    it('should allow cancel after lock has expired', async () => {
      const ownerUtxo = provider.addUtxo(ownerKeyPair.address, randomUtxo({
        satoshis: 1000n,
      }));

      // Can cancel even after lock expires
      const tx = await contract.functions.cancel(ownerKeyPair.publicKey, ownerKeyPair.signer)
        .from(ownerUtxo)
        .to(ownerKeyPair.address, 100000n)
        .withTime(2000n)
        .send();

      expect(tx).not.toFailRequire();
    });
  });
});
