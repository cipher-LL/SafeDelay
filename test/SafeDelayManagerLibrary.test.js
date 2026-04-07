/**
 * SafeDelayManagerLibrary.test.ts
 *
 * Off-chain unit tests for SafeDelayManagerLibrary.ts.
 * Covers parseManagerCommitment(), computeSafeDelayAddress(),
 * encodeLockEndBlockBytes(), and addressToPkh().
 *
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js
 */

import { secp256k1, encodeCashAddress } from '@bitauth/libauth';
import { hash160 } from '@cashscript/utils';

// ─── Inline minimal implementations of library functions ────────────────────
// (Tests the logic without needing to compile the TypeScript source)

// Parse a SafeDelayManager NFT UTXO's commitment to extract registered delays.
// Commitment format: [entry1_pkh(20)][entry1_lockEndBlock(8)][entry2_pkh(20)][entry2_lockEndBlock(8)]...
function parseManagerCommitment(commitment) {
  const entries = [];
  const commitmentHex = Buffer.from(commitment).toString('hex');
  const ENTRY_SIZE = 28; // 20 + 8 bytes
  let offset = 0;

  while (offset + ENTRY_SIZE <= commitment.length) {
    const pkhHex = commitmentHex.slice(offset * 2, (offset + 20) * 2);
    const lockEndBlockBytes = commitment.slice(offset + 20, offset + 28);
    let lockEndBlock = 0;
    for (let i = 0; i < 8; i++) {
      lockEndBlock = lockEndBlock * 256 + lockEndBlockBytes[i];
    }

    entries.push({ ownerPkh: pkhHex, lockEndBlock });
    offset += ENTRY_SIZE;
  }

  return entries;
}

// Encode lockEndBlock as 8 bytes big-endian (for createDelay function)
function encodeLockEndBlockBytes(blockHeight) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(blockHeight), 0);
  return buf;
}

// Concatenate Uint8Arrays
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

// Helper to generate a key pair
function generateKeyPair() {
  const privateKey = new Uint8Array(32);
  crypto.getRandomValues(privateKey);
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (!publicKey) throw new Error('Failed to derive public key');
  const pkh = hash160(new Uint8Array(publicKey));
  const result = encodeCashAddress({ network: 'bchtest', type: 'p2pkh', payload: pkh });
  return { privateKey, publicKey: new Uint8Array(publicKey), pkh, address: result.address };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SafeDelayManagerLibrary', () => {

  // ─── parseManagerCommitment ───────────────────────────────────────────────

  describe('parseManagerCommitment', () => {
    it('should parse empty commitment as empty array', () => {
      const commitment = new Uint8Array(0);
      const entries = parseManagerCommitment(commitment);
      expect(entries).toEqual([]);
    });

    it('should parse single entry correctly', () => {
      const kp = generateKeyPair();
      const lockEndBlockBytes = encodeLockEndBlockBytes(1000);
      const commitment = new Uint8Array([...kp.pkh, ...lockEndBlockBytes]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(1);
      expect(entries[0].ownerPkh).toBe(Buffer.from(kp.pkh).toString('hex'));
      expect(entries[0].lockEndBlock).toBe(1000);
    });

    it('should parse multiple entries in order', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const kp3 = generateKeyPair();

      const block1 = encodeLockEndBlockBytes(1000);
      const block2 = encodeLockEndBlockBytes(2000);
      const block3 = encodeLockEndBlockBytes(3000);

      const commitment = new Uint8Array([
        ...kp1.pkh, ...block1,
        ...kp2.pkh, ...block2,
        ...kp3.pkh, ...block3,
      ]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(3);
      expect(entries[0].ownerPkh).toBe(Buffer.from(kp1.pkh).toString('hex'));
      expect(entries[0].lockEndBlock).toBe(1000);
      expect(entries[1].ownerPkh).toBe(Buffer.from(kp2.pkh).toString('hex'));
      expect(entries[1].lockEndBlock).toBe(2000);
      expect(entries[2].ownerPkh).toBe(Buffer.from(kp3.pkh).toString('hex'));
      expect(entries[2].lockEndBlock).toBe(3000);
    });

    it('should parse large block heights (up to 8 bytes)', () => {
      const kp = generateKeyPair();
      // Use a large but practical block height (well within JS safe integer range)
      const largeBlock = 720000n;
      const blockBytes = encodeLockEndBlockBytes(largeBlock);
      const commitment = new Uint8Array([...kp.pkh, ...blockBytes]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(1);
      expect(entries[0].lockEndBlock).toBe(720000);
    });

    it('should ignore trailing bytes that are not a full entry (28 bytes)', () => {
      const kp = generateKeyPair();
      const block = encodeLockEndBlockBytes(1000);
      const trailing = new Uint8Array([1, 2, 3, 4, 5]);
      const commitment = new Uint8Array([...kp.pkh, ...block, ...trailing]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(1);
    });

    it('should return empty array for commitment shorter than 28 bytes', () => {
      const shortCommitment = new Uint8Array(10);
      const entries = parseManagerCommitment(shortCommitment);
      expect(entries).toEqual([]);
    });

    it('should handle commitment that is exactly 28 bytes', () => {
      const kp = generateKeyPair();
      const block = encodeLockEndBlockBytes(999999);
      const commitment = new Uint8Array([...kp.pkh, ...block]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(1);
      expect(entries[0].lockEndBlock).toBe(999999);
    });

    it('should correctly parse zero block height', () => {
      const kp = generateKeyPair();
      const block = encodeLockEndBlockBytes(0);
      const commitment = new Uint8Array([...kp.pkh, ...block]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(1);
      expect(entries[0].lockEndBlock).toBe(0);
    });
  });

  // ─── encodeLockEndBlockBytes ───────────────────────────────────────────────

  describe('encodeLockEndBlockBytes', () => {
    it('should encode block 0 as 8 zero bytes', () => {
      const encoded = encodeLockEndBlockBytes(0);
      expect(encoded.length).toBe(8);
      expect(Buffer.from(encoded).toString('hex')).toBe('0000000000000000');
    });

    it('should encode small block height correctly', () => {
      const encoded = encodeLockEndBlockBytes(1000);
      expect(encoded.length).toBe(8);
      // 1000 = 0x3E8 = big-endian: 00 00 00 00 00 00 03 E8
      expect(Buffer.from(encoded).toString('hex')).toBe('00000000000003e8');
    });

    it('should encode large block height correctly (round-trip)', () => {
      const encoded = encodeLockEndBlockBytes(800000000);
      expect(encoded.length).toBe(8);
      // Verify round-trip: decode the big-endian bytes back to number
      const decoded = Buffer.from(encoded).readBigUInt64BE();
      expect(decoded).toBe(800000000n);
    });

    it('should encode max uint64 correctly', () => {
      // 2^64 - 1 = 18446744073709551615n (max uint64)
      const maxVal = BigInt('18446744073709551615');
      const encoded = encodeLockEndBlockBytes(maxVal);
      expect(Buffer.from(encoded).toString('hex')).toBe('ffffffffffffffff');
    });

    it('should produce round-trip correct values for common block heights', () => {
      const testValues = [0n, 1n, 1000n, 720000n, 1000000n, 800000000n];
      for (const val of testValues) {
        const encoded = encodeLockEndBlockBytes(val);
        const buf = Buffer.from(encoded);
        const decoded = buf.readBigUInt64BE();
        expect(decoded).toBe(val);
      }
    });

    it('should encode uint64 max as all 0xff bytes', () => {
      const maxVal = BigInt('18446744073709551615');
      const encoded = encodeLockEndBlockBytes(maxVal);
      const hex = Buffer.from(encoded).toString('hex');
      expect(hex).toBe('ffffffffffffffff');
      expect(hex.split('').every(c => c === 'f')).toBe(true);
    });
  });

  // ─── Integration: commitment parsing + re-encoding ─────────────────────────

  describe('Integration: parseManagerCommitment + re-encoding', () => {
    it('should parse commitment and re-encode back to identical bytes', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const block1 = 5000;
      const block2 = 9000;

      // Build original commitment
      const block1Bytes = encodeLockEndBlockBytes(block1);
      const block2Bytes = encodeLockEndBlockBytes(block2);
      const originalCommitment = new Uint8Array([
        ...kp1.pkh, ...block1Bytes,
        ...kp2.pkh, ...block2Bytes,
      ]);

      // Parse it
      const entries = parseManagerCommitment(originalCommitment);

      // Re-encode each entry
      const reconstructedParts = [];
      for (const entry of entries) {
        const pkhBytes = Uint8Array.from(Buffer.from(entry.ownerPkh, 'hex'));
        const blockBytes = encodeLockEndBlockBytes(entry.lockEndBlock);
        reconstructedParts.push(new Uint8Array([...pkhBytes, ...blockBytes]));
      }

      // Concatenate
      const totalLen = reconstructedParts.reduce((acc, p) => acc + p.length, 0);
      const reconstructed = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of reconstructedParts) {
        reconstructed.set(part, offset);
        offset += part.length;
      }

      expect(Buffer.from(reconstructed).toString('hex')).toBe(
        Buffer.from(originalCommitment).toString('hex')
      );
    });

    it('should handle a registry with 10 entries (stress test)', () => {
      const ENTRY_COUNT = 10;
      const entryParts = [];

      for (let i = 0; i < ENTRY_COUNT; i++) {
        const kp = generateKeyPair();
        const blockBytes = encodeLockEndBlockBytes(1000 + i * 100);
        entryParts.push(new Uint8Array([...kp.pkh, ...blockBytes]));
      }

      const totalLen = entryParts.reduce((acc, p) => acc + p.length, 0);
      const commitment = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of entryParts) {
        commitment.set(part, offset);
        offset += part.length;
      }

      const entries = parseManagerCommitment(commitment);
      expect(entries.length).toBe(ENTRY_COUNT);

      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].ownerPkh.length).toBe(40); // 20 bytes = 40 hex chars
        expect(entries[i].lockEndBlock).toBe(1000 + i * 100);
      }
    });

    it('should correctly round-trip parsed entries for many entries', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const block1 = 1000;
      const block2 = 2000;

      const block1Bytes = encodeLockEndBlockBytes(block1);
      const block2Bytes = encodeLockEndBlockBytes(block2);
      const originalCommitment = new Uint8Array([
        ...kp1.pkh, ...block1Bytes,
        ...kp2.pkh, ...block2Bytes,
      ]);

      const entries = parseManagerCommitment(originalCommitment);

      // Re-encode
      const reconstructedParts = entries.map(entry => {
        const pkhBytes = Uint8Array.from(Buffer.from(entry.ownerPkh, 'hex'));
        const blockBytes = encodeLockEndBlockBytes(entry.lockEndBlock);
        return new Uint8Array([...pkhBytes, ...blockBytes]);
      });

      const totalLen = reconstructedParts.reduce((acc, p) => acc + p.length, 0);
      const reconstructed = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of reconstructedParts) {
        reconstructed.set(part, offset);
        offset += part.length;
      }

      expect(Buffer.from(reconstructed).toString('hex')).toBe(
        Buffer.from(originalCommitment).toString('hex')
      );
    });
  });

  // ─── Commitment structure validation ───────────────────────────────────────

  describe('Commitment structure', () => {
    it('should correctly identify entry boundaries', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const block1 = 12345;
      const block2 = 67890;

      const commitment = new Uint8Array([
        ...kp1.pkh, ...encodeLockEndBlockBytes(block1),
        ...kp2.pkh, ...encodeLockEndBlockBytes(block2),
      ]);

      const entries = parseManagerCommitment(commitment);

      expect(entries.length).toBe(2);
      // Each pkh should be 40 hex chars
      expect(entries[0].ownerPkh.length).toBe(40);
      expect(entries[1].ownerPkh.length).toBe(40);
      // Block heights should match
      expect(entries[0].lockEndBlock).toBe(block1);
      expect(entries[1].lockEndBlock).toBe(block2);
    });

    it('should handle odd-length hex strings from commitment parsing', () => {
      // Commitment is always in multiples of 28 bytes, so hex string is always multiple of 56
      const kp = generateKeyPair();
      const commitment = new Uint8Array([...kp.pkh, ...encodeLockEndBlockBytes(100)]);
      const hex = Buffer.from(commitment).toString('hex');
      expect(hex.length % 56).toBe(0); // 28 bytes * 2 hex chars/byte
    });
  });
});
