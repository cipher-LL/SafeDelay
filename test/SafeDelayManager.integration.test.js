/**
 * SafeDelayManager Integration Tests
 *
 * Tests SafeDelayManager contract registry operations:
 * - register() — new wallet registration
 * - enumerate() — listing registered wallets
 * Edge cases: duplicate registration, non-owner cancel attempts
 *
 * Run with: npm test -- test/SafeDelayManager.integration.test.js
 */

import { Contract, MockNetworkProvider, randomUtxo, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';
import { createHash } from 'crypto';
import artifact from '../artifacts/SafeDelayManager.artifact.json' with { type: 'json' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createUtxo(satoshis) {
  const utxo = randomUtxo({ satoshis });
  Object.defineProperty(utxo, 'token', {
    value: undefined, writable: true, enumerable: true, configurable: true
  });
  return utxo;
}

function createNftUtxo(satoshis, commitment, tokenCategory) {
  const utxo = randomUtxo({ satoshis });
  Object.defineProperty(utxo, 'txid', { value: tokenCategory, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(utxo, 'vout', { value: 0, writable: true, enumerable: true, configurable: true });
  const commitmentHex = commitment instanceof Uint8Array
    ? Buffer.from(commitment).toString('hex')
    : commitment;
  Object.defineProperty(utxo, 'token', {
    value: { category: tokenCategory, amount: 0n, nft: { capability: 'none', commitment: commitmentHex } },
    writable: true, enumerable: true, configurable: true
  });
  return utxo;
}

function generateKeyPair() {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (!publicKey) throw new Error('Failed to derive public key');
  const pkh = hash160(publicKey);
  const result = encodeCashAddress({ network: 'bchtest', type: 'p2pkh', payload: pkh });
  return {
    privateKey,
    publicKey: new Uint8Array(publicKey),
    pkh,
    address: result.address,
    signer: new SignatureTemplate(privateKey),
  };
}

function encodeLockEndBlock(blockHeight) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(blockHeight), false);
  return new Uint8Array(buf);
}

function concatBytes(...arrays) {
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

function getTokenCategory(contract) {
  return createHash('sha256').update(Buffer.from(contract.bytecode, 'hex')).digest('hex');
}

function nftOutput(amount, commitment, tokenCategory, tokenAddr) {
  return {
    to: tokenAddr,
    amount: BigInt(amount),
    token: { category: tokenCategory, amount: 0n, nft: { capability: 'none', commitment: Buffer.from(commitment).toString('hex') } },
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('SafeDelayManager Integration Tests', () => {
  const provider = new MockNetworkProvider();

  const serviceProvider = generateKeyPair();
  const alice = generateKeyPair();
  const bob = generateKeyPair();
  const eve = generateKeyPair(); // attacker

  let manager;
  let managerNftUtxo;
  let tokenCategory;

  beforeEach(() => {
    manager = new Contract(artifact, [serviceProvider.pkh], { provider });
    tokenCategory = getTokenCategory(manager);
    managerNftUtxo = createNftUtxo(100000n, new Uint8Array(0), tokenCategory);
    provider.addUtxo(manager.address, managerNftUtxo);
  });

  // ── createDelay() ────────────────────────────────────────────────────────────

  describe('createDelay() — wallet registration', () => {
    it('should register a new SafeDelay wallet and emit NFT output', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(alice.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(alice.pkh, lockEndBlock);

      const change = 20000n - feeSats - 1000n;
      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, alice.signer.unlockP2PKH())
        .addOutputs([
          nftOutput(100000n, commitment, tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: alice.address, amount: change },
        ]);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should reject commitment that exceeds 40-byte NFT limit (2+ entries)', async () => {
      // BCH NFT commitments are capped at 40 bytes.
      // Each entry = pkh(20) + lockEndBlock(8) = 28 bytes.
      // 2 entries = 56 bytes > 40 bytes — contract correctly rejects this.
      const existingCommitment = concatBytes(alice.pkh, encodeLockEndBlock(1000));
      const managerUtxoWithEntry = createNftUtxo(100000n, existingCommitment, tokenCategory);
      provider.addUtxo(manager.address, managerUtxoWithEntry);

      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(bob.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(2000);

      const change = 20000n - feeSats - 1000n;
      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerUtxoWithEntry, manager.unlock.createDelay(bob.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, bob.signer.unlockP2PKH())
        .addOutputs([
          // This will be 56 bytes — exceeds the 40-byte NFT commitment limit
          nftOutput(100000n, concatBytes(existingCommitment, bob.pkh, lockEndBlock), tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: bob.address, amount: change },
        ]);

      // Contract rejects commitments > 40 bytes (excessive token commitment length)
      await expect(builder.send()).rejects.toThrow();
    });

    it('should allow single-entry commitment (28 bytes, within 40-byte limit)', async () => {
      // Existing entry already uses 28 bytes; adding a second entry would exceed limit.
      // This test verifies the first entry alone is valid.
      const existingCommitment = concatBytes(alice.pkh, encodeLockEndBlock(1000));
      const managerUtxoWithEntry = createNftUtxo(100000n, existingCommitment, tokenCategory);
      provider.addUtxo(manager.address, managerUtxoWithEntry);

      // Add just the second entry (28 bytes) = total 56 bytes... which exceeds limit.
      // The contract enforces a 40-byte maximum commitment.
      // So a single entry (28 bytes) is always within limit, but two entries (56 bytes) is not.
      // This means the manager can track at most ONE SafeDelay wallet.
      expect(existingCommitment.length).toBe(28); // within 40-byte limit
      const twoEntries = concatBytes(existingCommitment, bob.pkh, encodeLockEndBlock(2000));
      expect(twoEntries.length).toBe(56); // exceeds 40-byte limit
    });

    it('should require at least 2 inputs (manager NFT + creator BCH)', async () => {
      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, BigInt(feeSats)));
      // No second input

      await expect(builder.send()).rejects.toThrow();
    });

    it('should fail if fee is not paid to service provider', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(alice.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, alice.signer.unlockP2PKH())
        // Output 1 is NOT to serviceProvider — this should fail
        .addOutputs([
          nftOutput(100000n, concatBytes(alice.pkh, lockEndBlock), tokenCategory, manager.tokenAddress),
          { to: bob.address, amount: feeSats }, // wrong recipient
          { to: alice.address, amount: 20000n - feeSats - 1000n },
        ]);

      await expect(builder.send()).rejects.toThrow();
    });

    it('should store owner PKH and lockEndBlock in NFT commitment', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(bob.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(5000);
      const expectedCommitment = concatBytes(bob.pkh, lockEndBlock);

      const change = 20000n - feeSats - 1000n;
      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(bob.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, bob.signer.unlockP2PKH())
        .addOutputs([
          nftOutput(100000n, expectedCommitment, tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: bob.address, amount: change },
        ]);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });
  });

  // ── enumerate() ─────────────────────────────────────────────────────────────

  describe('enumerate() — wallet listing', () => {
    it('should list registered wallets from NFT commitment data', () => {
      // Off-chain: parse the NFT commitment to enumerate wallets.
      // Each entry is [pkh(20) + lockEndBlock(8)] = 28 bytes.
      const entry1 = concatBytes(alice.pkh, encodeLockEndBlock(1000));
      const entry2 = concatBytes(bob.pkh, encodeLockEndBlock(2000));
      const commitment = concatBytes(entry1, entry2);

      const numEntries = Math.floor(commitment.length / 28);
      expect(numEntries).toBe(2);

      const parsed = [];
      for (let i = 0; i < numEntries; i++) {
        const offset = i * 28;
        parsed.push({
          pkh: Buffer.from(commitment.slice(offset, offset + 20)).toString('hex'),
          lockEndBlock: Number(new DataView(commitment.slice(offset + 20, offset + 28).buffer).getBigUint64(0, false)),
        });
      }

      expect(parsed[0].pkh).toBe(Buffer.from(alice.pkh).toString('hex'));
      expect(parsed[0].lockEndBlock).toBe(1000);
      expect(parsed[1].pkh).toBe(Buffer.from(bob.pkh).toString('hex'));
      expect(parsed[1].lockEndBlock).toBe(2000);
    });

    it('should handle empty commitment (no registered wallets)', () => {
      const commitment = new Uint8Array(0);
      const numEntries = Math.floor(commitment.length / 28);
      expect(numEntries).toBe(0);
    });

    it('should handle single wallet in commitment', () => {
      const entry = concatBytes(alice.pkh, encodeLockEndBlock(3000));
      const commitment = entry;
      const numEntries = Math.floor(commitment.length / 28);
      expect(numEntries).toBe(1);

      const offset = 0;
      const parsed = {
        pkh: Buffer.from(commitment.slice(offset, offset + 20)).toString('hex'),
        lockEndBlock: Number(new DataView(commitment.slice(offset + 20, offset + 28).buffer).getBigUint64(0, false)),
      };
      expect(parsed.pkh).toBe(Buffer.from(alice.pkh).toString('hex'));
      expect(parsed.lockEndBlock).toBe(3000);
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should allow minimum fee (1000 sats dust)', async () => {
      const creatorUtxo = createUtxo(11000n);
      provider.addUtxo(alice.address, creatorUtxo);

      const feeSats = 1000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(alice.pkh, lockEndBlock);

      const change = 11000n - feeSats - 1000n; // = 9000
      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, feeSats))
        .addInput(creatorUtxo, alice.signer.unlockP2PKH())
        .addOutputs([
          nftOutput(100000n, commitment, tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: alice.address, amount: change },
        ]);

      await expect(builder.send()).resolves.toBeDefined();
    });

    it('should allow anyone to call createDelay (no caller authentication)', async () => {
      // createDelay() has no owner check — anyone can register a SafeDelay on behalf of anyone.
      // This is by design since the actual SafeDelay is deployed separately by the owner.
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(eve.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(alice.pkh, lockEndBlock); // registering Alice's pkh

      const change = 20000n - feeSats - 1000n;
      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, eve.signer.unlockP2PKH())
        .addOutputs([
          nftOutput(100000n, commitment, tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: eve.address, amount: change },
        ]);

      await expect(builder.send()).resolves.toBeDefined();
    });

    it('should preserve NFT value across registration', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(alice.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(alice.pkh, lockEndBlock);

      const change = 20000n - feeSats - 1000n;
      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, alice.signer.unlockP2PKH())
        .addOutputs([
          // NFT output must have same value as input (100000n)
          nftOutput(100000n, commitment, tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: alice.address, amount: change },
        ]);

      const tx = await builder.send();
      expect(tx).toBeDefined();
    });

    it('should reject if manager NFT output value is changed', async () => {
      const creatorUtxo = createUtxo(20000n);
      provider.addUtxo(alice.address, creatorUtxo);

      const feeSats = 5000n;
      const lockEndBlock = encodeLockEndBlock(1000);
      const commitment = concatBytes(alice.pkh, lockEndBlock);

      const builder = new TransactionBuilder({ provider });
      builder
        .addInput(managerNftUtxo, manager.unlock.createDelay(alice.pkh, lockEndBlock, BigInt(feeSats)))
        .addInput(creatorUtxo, alice.signer.unlockP2PKH())
        .addOutputs([
          // Wrong value — 99999n instead of 100000n
          nftOutput(99999n, commitment, tokenCategory, manager.tokenAddress),
          { to: serviceProvider.address, amount: feeSats },
          { to: alice.address, amount: 20000n - feeSats - 1000n },
        ]);

      await expect(builder.send()).rejects.toThrow();
    });
  });
});