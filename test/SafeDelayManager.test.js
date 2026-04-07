import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';
import { createHash } from 'crypto';
import artifact from '../artifacts/SafeDelayManager.artifact.json' with { type: 'json' };

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

// Helper to generate a UTXO representing an NFT (manager UTXO)
// For NFTs in BCH, genesis UTXOs have txid === tokenCategory and vout === 0
// NOTE: commitment must be stored as a hex string (not Uint8Array) because
// cashScriptOutputToLibauthOutput validates token.nft.commitment as a hex string
// when building sourceOutputs for signing.
function createNftUtxo(satoshis, commitment, tokenCategory) {
  const utxo = randomUtxo({ satoshis });
  // Override txid/vout to simulate genesis NFT UTXO
  Object.defineProperty(utxo, 'txid', { value: tokenCategory, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(utxo, 'vout', { value: 0, writable: true, enumerable: true, configurable: true });
  // Convert Uint8Array commitment to hex string for cashscript compatibility
  const commitmentHex = commitment instanceof Uint8Array
    ? Buffer.from(commitment).toString('hex')
    : commitment;
  Object.defineProperty(utxo, 'token', {
    value: { category: tokenCategory, amount: 0n, nft: { capability: 'none', commitment: commitmentHex } },
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

// Encode block height as 8-byte big-endian
function encodeLockEndBlock(blockHeight) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(blockHeight), false); // big-endian
  return new Uint8Array(buf);
}

// Concatenate Uint8Arrays (since Uint8Array has no concat method)
function concatBytes(...arrays) {
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Compute NFT token category = sha256(contract bytecode)
// Returns hex string (cashscript expects hex strings for token categories)
function getTokenCategory(contract) {
  const bytecodeBytes = Buffer.from(contract.bytecode, 'hex');
  return createHash('sha256').update(bytecodeBytes).digest('hex');
}

describe('SafeDelayManager Contract', () => {
  const provider = new MockNetworkProvider();

  const serviceProvider = generateKeyPair();
  const owner1 = generateKeyPair();
  const owner2 = generateKeyPair();
  const attacker = generateKeyPair();

  let manager;
  let managerNftUtxo;
  let tokenCategory;

  beforeEach(() => {
    manager = new Contract(artifact, [serviceProvider.pkh], { provider });
    tokenCategory = getTokenCategory(manager);
    managerNftUtxo = createNftUtxo(100000n, new Uint8Array(0), tokenCategory);
    provider.addUtxo(manager.address, managerNftUtxo);
  });

  // Helper to build NFT output object for the manager contract
  // Use tokenAddress (r... prefix) for NFT outputs, not regular address (p... prefix)
  // Note: token.amount = 0n is required because calculateTotalTokenAmount() sums token.amount
  // for ALL outputs with a token category, including NFTs. Without this, the reduce fails.
  function nftOutput(amount, commitment) {
    return {
      to: manager.tokenAddress,
      amount: BigInt(amount),
      token: {
        category: tokenCategory,
        amount: 0n,
        nft: {
          capability: 'none',
          commitment: Buffer.from(commitment).toString('hex'),
        },
      },
    };
  }

  describe('createDelay', () => {
    it('should register a new SafeDelay wallet and pay fee to service provider', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, BigInt(feeSats))
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: BigInt(feeSats) }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should append to existing NFT commitment when registering second wallet', async () => {
      // First entry already committed
      const existingCommitment = concatBytes(owner1.pkh, encodeLockEndBlock(1000));
      const managerUtxoWithEntry = createNftUtxo(100000n, existingCommitment, tokenCategory);
      provider.addUtxo(manager.address, managerUtxoWithEntry);

      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner2.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock2 = encodeLockEndBlock(2000);

      // New commitment = existing + new entry
      const expectedCommitment = concatBytes(existingCommitment, owner2.pkh, lockEndBlock2);

      const tx = await manager.functions.createDelay(owner2.pkh, lockEndBlock2, BigInt(feeSats))
        .from(managerUtxoWithEntry)
        .from(creatorUtxo)
        .to([nftOutput(100000n, expectedCommitment), { to: serviceProvider.address, amount: BigInt(feeSats) }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should return change to creator when change >= 1000 sats', async () => {
      const creatorUtxo = createUtxo(100000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const expectedChange = 100000n - BigInt(feeSats) - 1000n; // 94000n
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, BigInt(feeSats))
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: BigInt(feeSats) }, { to: owner1.address, amount: expectedChange }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should succeed without change output when change < 1000 sats', async () => {
      const creatorUtxo = createUtxo(6000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      // change = 6000 - 5000 - 1000 = 0, no change output needed
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, BigInt(feeSats))
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: BigInt(feeSats) }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should allow any fee amount >= 1000', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 1000n; // minimum fee
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: feeSats }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should preserve manager NFT value and token category', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      // Manager UTXO must preserve its value (100000n) in output 0
      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, BigInt(feeSats))
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: BigInt(feeSats) }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should accept arbitrary lockEndBlock values (up to 8 bytes)', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      // Very high block height
      const lockEndBlock = encodeLockEndBlock(800000000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, BigInt(feeSats))
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: BigInt(feeSats) }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should fail if second input is not BCH (has token category)', async () => {
      // Create a fake token UTXO (not BCH)
      const tokenUtxo = randomUtxo({ satoshis: 20000n });
      Object.defineProperty(tokenUtxo, 'token', {
        value: { category: new Uint8Array(32).fill(1), commitment: new Uint8Array(0) },
        writable: true,
        enumerable: true,
        configurable: true
      });
      provider.addUtxo(owner1.address, tokenUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .from(tokenUtxo)
          .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: feeSats }])
          .send()
      ).rejects.toThrow();
    });

    it('should fail if fee output is not to service provider', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .from(creatorUtxo)
          .to([nftOutput(100000n, commitment), { to: owner1.address, amount: feeSats }])
          .send()
      ).rejects.toThrow();
    });

    it('should fail if fee amount is incorrect', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .from(creatorUtxo)
          .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: 4000n }])
          .send()
      ).rejects.toThrow();
    });

    it('should fail if creator BCH input is missing (only 1 input)', async () => {
      // No second input - only the manager NFT
      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: feeSats }])
          .send()
      ).rejects.toThrow();
    });

    it('should fail if manager NFT commitment is not correctly updated', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      // Wrong commitment - doesn't include the new entry (empty instead)
      const wrongCommitment = new Uint8Array(0);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .from(creatorUtxo)
          .to([nftOutput(100000n, wrongCommitment), { to: serviceProvider.address, amount: feeSats }])
          .send()
      ).rejects.toThrow();
    });

    it('should fail if manager output value is changed', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .from(creatorUtxo)
          .to([nftOutput(99999n, commitment), { to: serviceProvider.address, amount: feeSats }])
          .send()
      ).rejects.toThrow();
    });

    it('should fail if fee output has token category (not pure BCH)', async () => {
      const tokenUtxo = randomUtxo({ satoshis: 20000n });
      Object.defineProperty(tokenUtxo, 'token', {
        value: { category: new Uint8Array(32).fill(1), commitment: new Uint8Array(0) },
        writable: true,
        enumerable: true,
        configurable: true
      });
      provider.addUtxo(owner1.address, tokenUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(owner1.pkh, lockEndBlock);

      await expect(
        manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
          .from(managerNftUtxo)
          .from(tokenUtxo)
          .to([nftOutput(100000n, commitment), { to: serviceProvider.address, amount: feeSats }])
          .send()
      ).rejects.toThrow();
    });

    it('should allow zero-length initial commitment', async () => {
      // managerNftUtxo already has empty commitment from beforeEach
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(owner1.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const expectedCommitment = concatBytes(owner1.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(owner1.pkh, lockEndBlock, feeSats)
        .from(managerNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, expectedCommitment), { to: serviceProvider.address, amount: feeSats }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });

    it('should handle maximum-size commitment (many entries)', async () => {
      // Build a commitment with many entries
      const entryParts = [];
      for (let i = 0; i < 10; i++) {
        const kp = generateKeyPair();
        entryParts.push(kp.pkh);
        entryParts.push(encodeLockEndBlock(1000 + i * 100));
      }
      const largeCommitment = concatBytes(...entryParts);

      const largeNftUtxo = createNftUtxo(100000n, largeCommitment, tokenCategory);
      provider.addUtxo(manager.address, largeNftUtxo);

      const creatorUtxo = createUtxo(20000n);
      const newOwner = generateKeyPair();
      provider.addUtxo(newOwner.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(5000);
      const expectedCommitment = concatBytes(largeCommitment, newOwner.pkh, lockEndBlock);

      const tx = await manager.functions.createDelay(newOwner.pkh, lockEndBlock, feeSats)
        .from(largeNftUtxo)
        .from(creatorUtxo)
        .to([nftOutput(100000n, expectedCommitment), { to: serviceProvider.address, amount: feeSats }])
        .withoutTokenChange()
        .send();

      expect(tx).toBeDefined();
    });
  });
});
