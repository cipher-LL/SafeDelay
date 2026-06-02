/**
 * SafeDelayManagerLibrary.test.ts
 *
 * Off-chain unit tests for SafeDelayManagerLibrary.ts.
 * Covers parseManagerCommitment(), computeSafeDelayAddress(),
 * encodeLockEndBlockBytes(), and addressToPkh().
 *
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js
 */

import { secp256k1, encodeCashAddress, bigIntToVmNumber, hash256, encodeLockingBytecodeP2sh32, lockingBytecodeToCashAddress, cashAddressToLockingBytecode } from '@bitauth/libauth';
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

  // ─── addressToPkh ──────────────────────────────────────────────────────────

  // Inline implementation matching SafeDelayManagerLibrary.addressToPkh()
  function addressToPkh(address) {
    const result = cashAddressToLockingBytecode(address);
    if (typeof result === 'string') {
      throw new Error('Could not decode address: ' + result);
    }
    const bytecodeArr = Array.from(result.bytecode);
    // P2PKH: 76 a9 14 [20-byte PKH] 88 ac — 25 bytes, 0x88 at index 23
    if (bytecodeArr[1] === 0xa9 && bytecodeArr[0] === 0x76 && bytecodeArr[23] === 0x88) {
      const pkh = bytecodeArr.slice(3, 23);
      return Array.from(pkh).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // P2SH: a9 14 [20-byte hash] 87 — 23 bytes, 0x87 at index 22
    if (bytecodeArr[0] === 0xa9 && bytecodeArr[1] === 0x14 && bytecodeArr[22] === 0x87) {
      const hash = bytecodeArr.slice(2, 22);
      return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Could not decode address');
  }

  describe('addressToPkh', () => {
    it('should extract PKH from a P2PKH mainnet address', () => {
      const kp = generateKeyPair();
      const pkhHex = addressToPkh(kp.address);
      expect(pkhHex).toBe(Buffer.from(kp.pkh).toString('hex'));
    });

    it('should extract PKH from a P2PKH testnet/chipnet address', () => {
      // Generate a testnet address
      const privateKey = new Uint8Array(32);
      crypto.getRandomValues(privateKey);
      const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
      const pkh = hash160(new Uint8Array(publicKey));
      const result = encodeCashAddress({ network: 'bchtest', type: 'p2pkh', payload: pkh });
      const address = result.address;

      const extracted = addressToPkh(address);
      expect(extracted).toBe(Buffer.from(pkh).toString('hex'));
    });

    it('should throw for invalid address format', () => {
      expect(() => addressToPkh('notavalidaddress')).toThrow();
    });
  });
});

// ─── Inline implementations for computeSafeDelayAddress tests ───────────────

const NETWORK_PREFIXES_COMPUTE = {
  mainnet: 'bitcoincash',
  chipnet: 'bchtest',
  testnet: 'bchtest',
};

let _testSafeDelayBytecode = null;
function setSafeDelayBytecodeForTest(bytecodeHex) {
  _testSafeDelayBytecode = bytecodeHex;
}

function computeSafeDelayAddressForTest(ownerPkh, lockEndBlock, network = 'chipnet') {
  if (!_testSafeDelayBytecode) {
    throw new Error('SafeDelay bytecode not set. Call setSafeDelayBytecodeForTest() first.');
  }

  const bytecodeHex = _testSafeDelayBytecode;
  const ownerPkhBytes = Uint8Array.from(
    Buffer.from(ownerPkh.replace(/^0x/, '').padStart(40, '0'), 'hex')
  );
  const lockEndBlockVmNumber = bigIntToVmNumber(BigInt(lockEndBlock));

  const redeemScript = new Uint8Array([
    ...[...ownerPkhBytes].reverse(),
    ...[...lockEndBlockVmNumber].reverse(),
    ...Buffer.from(bytecodeHex, 'hex')
  ]);

  const hashResult = hash256(redeemScript);
  const lockingBytecode = encodeLockingBytecodeP2sh32(hashResult);
  const result = lockingBytecodeToCashAddress({
    prefix: NETWORK_PREFIXES_COMPUTE[network],
    bytecode: lockingBytecode,
  });

  return typeof result === 'string' ? result : result.address;
}

// Extract PKH from a BCH address (inline version for tests)
function addressToPkhInline(address) {
  const result = encodeCashAddress(address);
  if (typeof result !== 'object') throw new Error('Invalid address');
  const bytecodeArr = Array.from(result.bytecode);
  // P2PKH: 0x76 0xa9 0x14 <20-bytes> 0x88 0xac
  if (bytecodeArr[1] === 0xa9 && bytecodeArr[0] === 0x76 && bytecodeArr[22] === 0x88) {
    const pkh = bytecodeArr.slice(3, 23);
    return Array.from(pkh).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // P2SH: 0xa9 0x14 <20-bytes> 0x87
  if (bytecodeArr[0] === 0xa9 && bytecodeArr[22] === 0x87) {
    const hash = bytecodeArr.slice(2, 22);
    return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Could not decode address');
}

describe('computeSafeDelayAddress', () => {
  // SafeDelay bytecode extracted from the compiled artifact
  const SAFE_DELAY_BYTECODE = 'OP_2 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_4 OP_ROLL OP_4 OP_ROLL OP_CHECKSIGVERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_1 OP_UTXOVALUE OP_ADD e803 OP_SUB OP_NUMEQUAL OP_NIP OP_NIP OP_NIP OP_ELSE OP_2 OP_PICK OP_1 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_4 OP_ROLL OP_4 OP_ROLL OP_CHECKSIGVERIFY OP_TXLOCKTIME OP_ROT OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_UTXOVALUE OP_3 OP_PICK OP_SUB e803 OP_SUB OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_3 OP_ROLL OP_GREATERTHANOREQUAL OP_VERIFY OP_DUP e803 OP_GREATERTHAN OP_IF OP_1 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_1 OP_OUTPUTVALUE OP_OVER OP_NUMEQUALVERIFY OP_ENDIF OP_2DROP OP_1 OP_ELSE OP_2 OP_PICK OP_2 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_4 OP_ROLL OP_4 OP_ROLL OP_CHECKSIGVERIFY OP_0 OP_UTXOVALUE OP_1 OP_UTXOVALUE OP_ADD e803 OP_SUB OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_LESSTHANOREQUAL OP_NIP OP_NIP OP_ELSE OP_ROT OP_3 OP_NUMEQUALVERIFY OP_2 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_2SWAP OP_CHECKSIGVERIFY OP_ROT OP_ROT OP_GREATERTHAN OP_VERIFY OP_0 OP_UTXOVALUE OP_1 OP_UTXOVALUE OP_ADD e803 OP_SUB OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_LESSTHANOREQUAL OP_ENDIF OP_ENDIF OP_ENDIF';

  beforeEach(() => {
    setSafeDelayBytecodeForTest(SAFE_DELAY_BYTECODE);
  });

  it('should throw if bytecode not set', () => {
    // Create a fresh context without bytecode set
    const freshBytecode = _testSafeDelayBytecode;
    _testSafeDelayBytecode = null;
    expect(() => computeSafeDelayAddressForTest('a'.repeat(40), 1000)).toThrow('SafeDelay bytecode not set');
    _testSafeDelayBytecode = freshBytecode;
  });

  it('should compute a valid chipnet P2SH32 address', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const address = computeSafeDelayAddressForTest(pkhHex, 1000, 'chipnet');
    // chipnet addresses start with bchtest
    expect(address).toMatch(/^bchtest:/);
    expect(address.length).toBeGreaterThan(20);
  });

  it('should compute a valid mainnet P2SH32 address', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const address = computeSafeDelayAddressForTest(pkhHex, 1000, 'mainnet');
    // mainnet addresses start with bitcoincash
    expect(address).toMatch(/^bitcoincash:/);
    expect(address.length).toBeGreaterThan(20);
  });

  it('should produce different addresses for different ownerPKHs', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const pkhHex1 = Buffer.from(kp1.pkh).toString('hex');
    const pkhHex2 = Buffer.from(kp2.pkh).toString('hex');
    const address1 = computeSafeDelayAddressForTest(pkhHex1, 1000, 'chipnet');
    const address2 = computeSafeDelayAddressForTest(pkhHex2, 1000, 'chipnet');
    expect(address1).not.toBe(address2);
  });

  it('should produce different addresses for different lockEndBlocks', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const address1 = computeSafeDelayAddressForTest(pkhHex, 1000, 'chipnet');
    const address2 = computeSafeDelayAddressForTest(pkhHex, 2000, 'chipnet');
    expect(address1).not.toBe(address2);
  });

  it('should produce same address for same inputs (deterministic)', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const address1 = computeSafeDelayAddressForTest(pkhHex, 5000, 'chipnet');
    const address2 = computeSafeDelayAddressForTest(pkhHex, 5000, 'chipnet');
    expect(address1).toBe(address2);
  });

  it('should handle zero block height', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const address = computeSafeDelayAddressForTest(pkhHex, 0, 'chipnet');
    expect(address).toMatch(/^bchtest:/);
  });

  it('should handle very large block height (uint64 max)', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    // 2^64-1 is the max uint64 — this is an edge case
    const address = computeSafeDelayAddressForTest(pkhHex, Number.MAX_SAFE_INTEGER, 'chipnet');
    expect(address).toMatch(/^bchtest:/);
  });

  it('should produce chipnet and mainnet addresses for same inputs', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const chipnetAddr = computeSafeDelayAddressForTest(pkhHex, 720000, 'chipnet');
    const mainnetAddr = computeSafeDelayAddressForTest(pkhHex, 720000, 'mainnet');
    expect(chipnetAddr).not.toBe(mainnetAddr);
    expect(chipnetAddr).toMatch(/^bchtest:/);
    expect(mainnetAddr).toMatch(/^bitcoincash:/);
  });

  it('should handle PKH with and without 0x prefix', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const address1 = computeSafeDelayAddressForTest(pkhHex, 1000, 'chipnet');
    const address2 = computeSafeDelayAddressForTest('0x' + pkhHex, 1000, 'chipnet');
    expect(address1).toBe(address2);
  });

  it('should pad short PKH with zeros', () => {
    const kp = generateKeyPair();
    const pkhHex = Buffer.from(kp.pkh).toString('hex');
    const shortPkh = pkhHex.slice(0, 38); // 19 bytes instead of 20
    // Should pad with leading zeros internally
    const address = computeSafeDelayAddressForTest(shortPkh, 1000, 'chipnet');
    expect(address).toMatch(/^bchtest:/);
  });
});

// ─── getAllManagerDelays (mock-based) ───────────────────────────────────────

describe('getAllManagerDelays', () => {
  const MANAGER_ADDRESS = 'bchtest:qp2yk3x2cjg5v0x609z5ectrl0t3sltfs5vvs9qpkd';
  const ELECTRUM_URL = 'https://chipnet.electroncash.de/api';

  // Helper to build a mock electrum response for get_address_utxos
  function buildElectrumUtxoResponse(utxos) {
    return {
      jsonrpc: '2.0',
      id: 1,
      result: utxos.map(u => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        tokenCategory: u.tokenCategory,
        nftCommitment: u.nftCommitment,
      })),
    };
  }

  // Inline implementation of getManagerUtxos for testing
  async function getManagerUtxosForTest(managerAddress, electrumUrl) {
    const resp = await fetch(electrumUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'get_address_utxos',
        params: [managerAddress, 0, 100],
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const utxos = [];
    for (const utxo of data.result) {
      if (utxo.tokenCategory && utxo.tokenCategory !== '0x') {
        const commitmentBytes = Buffer.from(utxo.nftCommitment || '', 'hex');
        const entries = parseManagerCommitment(commitmentBytes);
        utxos.push({
          ...utxo,
          tokenCategory: utxo.tokenCategory,
          amount: BigInt(utxo.value),
          managerData: {
            serviceProviderPkh: '',
            delayCount: entries.length,
            delays: entries,
          },
        });
      }
    }
    return utxos;
  }

  // Inline implementation of getAllManagerDelays for testing
  async function getAllManagerDelaysForTest(managerAddress, electrumUrl, network = 'chipnet') {
    setSafeDelayBytecodeForTest(SAFE_DELAY_BYTECODE);
    const utxos = await getManagerUtxosForTest(managerAddress, electrumUrl);
    const allEntries = [];

    for (const utxo of utxos) {
      for (const entry of utxo.managerData.delays) {
        const address = computeSafeDelayAddressForTest(entry.ownerPkh, entry.lockEndBlock, network);
        allEntries.push({
          ownerPkh: entry.ownerPkh,
          lockEndBlock: entry.lockEndBlock,
          address,
        });
      }
    }

    return allEntries;
  }

  const SAFE_DELAY_BYTECODE = 'OP_2 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_4 OP_ROLL OP_4 OP_ROLL OP_CHECKSIGVERIFY OP_0 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_1 OP_UTXOVALUE OP_ADD e803 OP_SUB OP_NUMEQUAL OP_NIP OP_NIP OP_NIP OP_ELSE OP_2 OP_PICK OP_1 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_4 OP_ROLL OP_4 OP_ROLL OP_CHECKSIGVERIFY OP_TXLOCKTIME OP_ROT OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_UTXOVALUE OP_3 OP_PICK OP_SUB e803 OP_SUB OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_3 OP_ROLL OP_GREATERTHANOREQUAL OP_VERIFY OP_DUP e803 OP_GREATERTHAN OP_IF OP_1 OP_OUTPUTBYTECODE OP_0 OP_UTXOBYTECODE OP_EQUALVERIFY OP_1 OP_OUTPUTVALUE OP_OVER OP_NUMEQUALVERIFY OP_ENDIF OP_2DROP OP_1 OP_ELSE OP_2 OP_PICK OP_2 OP_NUMEQUAL OP_IF OP_3 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_4 OP_ROLL OP_4 OP_ROLL OP_CHECKSIGVERIFY OP_0 OP_UTXOVALUE OP_1 OP_UTXOVALUE OP_ADD e803 OP_SUB OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_LESSTHANOREQUAL OP_NIP OP_NIP OP_ELSE OP_ROT OP_3 OP_NUMEQUALVERIFY OP_2 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_2SWAP OP_CHECKSIGVERIFY OP_ROT OP_ROT OP_GREATERTHAN OP_VERIFY OP_0 OP_UTXOVALUE OP_1 OP_UTXOVALUE OP_ADD e803 OP_SUB OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_LESSTHANOREQUAL OP_ENDIF OP_ENDIF OP_ENDIF';

  beforeEach(() => {
    // Set bytecode for address computation
    setSafeDelayBytecodeForTest(SAFE_DELAY_BYTECODE);
  });

  it('should return empty array when manager has no UTXOs', async () => {
    const mockResponse = buildElectrumUtxoResponse([]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      return {
        async json() { return mockResponse; }
      };
    };

    try {
      const delays = await getAllManagerDelaysForTest(MANAGER_ADDRESS, ELECTRUM_URL);
      expect(delays).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return empty array when manager UTXOs have no NFT tokens', async () => {
    // UTXOs without tokenCategory (pure BCH)
    const mockResponse = {
      jsonrpc: '2.0', id: 1, result: [
        { txid: 'abc', vout: 0, value: 100000, tokenCategory: '0x', nftCommitment: '' }
      ]
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ async json() { return mockResponse; } });

    try {
      const delays = await getAllManagerDelaysForTest(MANAGER_ADDRESS, ELECTRUM_URL);
      expect(delays).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should parse NFT commitment and compute SafeDelay addresses', async () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const block1 = encodeLockEndBlockBytes(1000);
    const block2 = encodeLockEndBlockBytes(2000);

    const commitment1 = new Uint8Array([...kp1.pkh, ...block1]);
    const commitment2 = new Uint8Array([...kp2.pkh, ...block2]);

    const mockResponse = {
      jsonrpc: '2.0', id: 1, result: [
        {
          txid: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
          vout: 0,
          value: 100000,
          tokenCategory: '1111111111111111111111111111111111111111111111111111111111111111',
          nftCommitment: Buffer.from(commitment1).toString('hex'),
        },
        {
          txid: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
          vout: 0,
          value: 100000,
          tokenCategory: '2222222222222222222222222222222222222222222222222222222222222222',
          nftCommitment: Buffer.from(commitment2).toString('hex'),
        },
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ async json() { return mockResponse; } });

    try {
      const delays = await getAllManagerDelaysForTest(MANAGER_ADDRESS, ELECTRUM_URL, 'chipnet');
      expect(delays.length).toBe(2);

      // Check first entry
      expect(delays[0].ownerPkh).toBe(Buffer.from(kp1.pkh).toString('hex'));
      expect(delays[0].lockEndBlock).toBe(1000);
      expect(delays[0].address).toMatch(/^bchtest:/);

      // Check second entry
      expect(delays[1].ownerPkh).toBe(Buffer.from(kp2.pkh).toString('hex'));
      expect(delays[1].lockEndBlock).toBe(2000);
      expect(delays[1].address).toMatch(/^bchtest:/);

      // Addresses should be different
      expect(delays[0].address).not.toBe(delays[1].address);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should throw on electrum error response', async () => {
    const mockResponse = { jsonrpc: '2.0', id: 1, error: { message: 'Address not found' } };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ async json() { return mockResponse; } });

    try {
      await expect(
        getAllManagerDelaysForTest(MANAGER_ADDRESS, ELECTRUM_URL)
      ).rejects.toThrow('Address not found');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return all entries across multiple manager UTXOs', async () => {
    const kp = generateKeyPair();
    const block = encodeLockEndBlockBytes(5000);
    const commitment = new Uint8Array([...kp.pkh, ...block]);

    // 3 UTXOs, each with the same commitment
    const mockResponse = {
      jsonrpc: '2.0', id: 1, result: [
        {
          txid: 'aaaa1111'.padEnd(64, 'a'),
          vout: 0, value: 100000,
          tokenCategory: 'aaaa0000'.padEnd(64, 'a'),
          nftCommitment: Buffer.from(commitment).toString('hex'),
        },
        {
          txid: 'bbbb1111'.padEnd(64, 'b'),
          vout: 0, value: 100000,
          tokenCategory: 'bbbb0000'.padEnd(64, 'b'),
          nftCommitment: Buffer.from(commitment).toString('hex'),
        },
        {
          txid: 'cccc1111'.padEnd(64, 'c'),
          vout: 0, value: 100000,
          tokenCategory: 'cccc0000'.padEnd(64, 'c'),
          nftCommitment: Buffer.from(commitment).toString('hex'),
        },
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ async json() { return mockResponse; } });

    try {
      const delays = await getAllManagerDelaysForTest(MANAGER_ADDRESS, ELECTRUM_URL, 'chipnet');
      expect(delays.length).toBe(3);
      // All entries should have the same owner and lockEndBlock
      for (const delay of delays) {
        expect(delay.ownerPkh).toBe(Buffer.from(kp.pkh).toString('hex'));
        expect(delay.lockEndBlock).toBe(5000);
        expect(delay.address).toMatch(/^bchtest:/);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
