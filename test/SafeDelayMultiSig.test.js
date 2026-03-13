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
  
  const owner1KeyPair = generateKeyPair();
  const owner2KeyPair = generateKeyPair();
  const owner3KeyPair = generateKeyPair();
  const depositorKeyPair = generateKeyPair();
  
  const owner1PKH = owner1KeyPair.pkh;
  const owner2PKH = owner2KeyPair.pkh;
  const owner3PKH = owner3KeyPair.pkh;
  const threshold = 2n;
  const lockEndBlock = 1000n;
  
  let contract;
  let contractUtxo;

  beforeEach(() => {
    contract = new Contract(artifact, [owner1PKH, owner2PKH, owner3PKH, threshold, lockEndBlock], { provider });
    const utxo = createUtxo(400000n);
    provider.addUtxo(contract.address, utxo);
    contractUtxo = utxo;
  });

  describe('deposit', () => {
    it('should allow anyone to deposit BCH into the contract', async () => {
      const depositorUtxo = createUtxo(100000n);
      provider.addUtxo(depositorKeyPair.address, depositorUtxo);

      const tx = await contract.functions.deposit(depositorKeyPair.publicKey, depositorKeyPair.signer)
        .from(contractUtxo)
        .from(depositorUtxo)
        .to(contract.address, 499000n)
        .withTime(500)
        .send();

      expect(tx).toBeDefined();
    });
  });

  describe('withdraw', () => {
    it('should allow withdrawal with 2-of-3 signatures after lock expires', async () => {
      const owner1Utxo = createUtxo(5000n);
      const owner2Utxo = createUtxo(5000n);
      provider.addUtxo(owner1KeyPair.address, owner1Utxo);
      provider.addUtxo(owner2KeyPair.address, owner2Utxo);

      const tx = await contract.functions.withdraw(
        owner1KeyPair.publicKey, owner1KeyPair.signer,
        owner2KeyPair.publicKey, owner2KeyPair.signer,
        owner3KeyPair.publicKey, owner3KeyPair.signer,
        100000n
      )
        .from(contractUtxo)
        .from(owner1Utxo)
        .from(owner2Utxo)
        .to(owner2KeyPair.address, 100000n)
        .to(contract.address, 299000n)
        .withTime(1100)
        .send();

      expect(tx).toBeDefined();
    });
  });

  describe('cancel', () => {
    it('should allow any single owner to cancel and refund anytime', async () => {
      const owner1Utxo = createUtxo(5000n);
      provider.addUtxo(owner1KeyPair.address, owner1Utxo);

      const tx = await contract.functions.cancel(owner1KeyPair.publicKey, owner1KeyPair.signer)
        .from(contractUtxo)
        .from(owner1Utxo)
        .to(owner1KeyPair.address, 399000n)
        .withTime(500)
        .send();

      expect(tx).toBeDefined();
    });
  });
});
