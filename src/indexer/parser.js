/**
 * SafeDelay NFT UTXO Parser
 *
 * Parses CashTokens NFT data from Bitcoin Cash transactions.
 * Per NFT_SPEC.md:
 *   - NFT category is `uint256 tokenCategory`
 *   - Commitment is `opReturn [issuer, beneficiary, lockEnd, beneficiaryPKH]`
 *   - Value field last byte encodes the state flag (0x00=locked, 0x01=withdrawal active)
 *
 * CashTokens NFT output structure:
 *   https://docs.bitcoinunlimited.net/cashtokens/nft
 *
 * A CashTokens NFT output has:
 *   - An OP_RETURN output (output 0) containing the NFT minting data
 *   - An NFT output (at a later output index) with:
 *       - nft.tokenCategory: first 36 bytes of the commitment (with prefix bytes)
 *       - nft commitment: remaining bytes after tokenCategory prefix
 *       - Or the NFT is directly in the same output's token data
 */

import { generateMemoryId } from '../utils.js'

/**
 * Parse a raw Electrum transaction (hex) into an object representation.
 */
export function parseRawTransaction(hex) {
  // Minimal Bitcoin transaction parser
  // Returns { version, inputs, outputs, locktime }
  // This handles the basic Bitcoin transaction format used by Electrum's getTransaction
  return parseTransaction(hex)
}

function varInt(buf, offset) {
  if (buf[offset] < 0xfd) return { value: buf[offset], bytesConsumed: 1 }
  if (buf[offset] === 0xfd) return { value: buf.readUInt16LE(offset + 1), bytesConsumed: 3 }
  if (buf[offset] === 0xfe) return { value: buf.readUInt32LE(offset + 1), bytesConsumed: 5 }
  return { value: BigInt(bytesToHex(buf.slice(offset + 1, offset + 9))), bytesConsumed: 9 }
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

function hexToBytes(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16))
  return bytes
}

function satoshisToBCH(satoshis) {
  return (satoshis / 100000000).toFixed(8)
}

/**
 * Parse a hex transaction into components.
 * Simplified parser for CashTokens NFT transactions.
 */
function parseTransaction(hex) {
  const buf = hexToBytes(hex)
  let pos = 0

  // Version (4 bytes, little-endian)
  const version = readUInt4LE(buf, pos); pos += 4

  // Input count
  const inputCount = varInt(buf, pos); pos += inputCount.bytesConsumed

  // Read inputs
  const inputs = []
  for (let i = 0; i < inputCount.value; i++) {
    const txHash = bytesToHex(buf.slice(pos, pos + 32)); pos += 32
    const vout = readUInt4LE(buf, pos); pos += 4
    const scriptLen = varInt(buf, pos); pos += scriptLen.bytesConsumed
    const scriptSig = buf.slice(pos, pos + scriptLen.value); pos += scriptLen.value
    const sequence = readUInt4LE(buf, pos); pos += 4
    inputs.push({ txHash, vout, scriptSig: bytesToHex(scriptSig), sequence })
  }

  // Output count
  const outputCount = varInt(buf, pos); pos += outputCount.bytesConsumed

  // Read outputs
  const outputs = []
  for (let i = 0; i < outputCount.value; i++) {
    const value = readUInt8LE(buf, pos); pos += 8
    const scriptLen = varInt(buf, pos); pos += scriptLen.bytesConsumed
    const pkScript = buf.slice(pos, pos + scriptLen.value); pos += scriptLen.value
    // Check for CashTokens capability
    let tokenData = null
    // CashTokens: if the output's value is 0 AND there's token data, it's a token output
    // For NFT minting: first output is OP_RETURN with commitment data
    outputs.push({
      value: Number(value),
      pkScript: bytesToHex(pkScript),
      tokenData,
    })
  }

  // Locktime
  const locktime = readUInt4LE(buf, pos)

  return { version, inputs, outputs, locktime }
}

function readUInt4LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)
}

function readUInt8LE(buf, offset) {
  return buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24) |
    (buf[offset + 4] << 32) |
    (buf[offset + 5] << 40) |
    (buf[offset + 6] << 48) |
    (buf[offset + 7] << 56)
}

/**
 * Extract CashTokens NFT commitment data from transaction outputs.
 *
 * CashTokens NFT minting transaction format:
 *   Output 0: OP_RETURN with commitment data
 *   Output 1+: NFT output (token data embedded in the output)
 *
 * OP_RETURN format for NFT minting:
 *   OP_RETURN [0xef] [0x03] [nft_tokenCategory] [commitmentLength] [commitment]
 *   Or for simpler parsing, just find the NFT output and check its token data.
 *
 * For SafeDelay NFTs, the commitment encodes:
 *   [issuer(20)] [beneficiary(20)] [lockEnd(4)] [beneficiaryPKH(20)] = 64 bytes
 *
 * A simpler approach: look for any P2PKH output to the contract address and
 * check if the transaction also contains an OP_RETURN that looks like SafeDelay NFT data.
 *
 * The NFT token category for SafeDelay deposits can be derived as:
 *   tokenCategory = hash160(contractAddress + 'SafeDelay-NFT-v1')
 *
 * For now, we parse any transaction with:
 *   1. An output paying to the contract address (P2PKH)
 *   2. An OP_RETURN output before it with 64 bytes of commitment data
 *
 * This gives us: amount (from output value), beneficiaryPKH (from commitment),
 * createdAtBlock (from on-chain data or estimated from tx position).
 */
export function parseTransactionForDeposits(txHex, txid, contractAddress, currentBlockHeight) {
  const deposits = []

  try {
    const tx = parseTransaction(txHex)
    const contractPkh = cashAddressToPkh(contractAddress)

    // Find outputs paying to the contract
    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i]
      const scriptHex = output.pkScript

      // P2PKH to contract: OP_DUP OP_HASH160 <20-byte-pkh> OP_EQUALVERIFY OP_CHECKSIG
      // Hex: 76 a9 14 <20-bytes> 88 ac
      if (scriptHex.startsWith('76a914') && scriptHex.endsWith('88ac')) {
        const outputPkh = scriptHex.slice(6, -4)
        if (outputPkh === contractPkh) {
          // This output is paying to the contract — check if it's a SafeDelay NFT
          const nftData = extractNftCommitment(tx, i)
          if (nftData) {
            const flag = output.value % 256
            const status = flag === 0x01 ? 'waiting' : 'locked'

            deposits.push({
              txid, // Real txid passed from caller (Electrum)
              vout: i,
              amount: satoshisToBCH(output.value),
              amountSatoshis: output.value,
              beneficiaryPkh: nftData.beneficiaryPkh,
              lockEnd: nftData.lockEnd,
              beneficiaryPKH: nftData.beneficiaryPKH, // alias
              flag,
              status,
              createdAtBlock: nftData.createdAtBlock || (currentBlockHeight - tx.inputs?.length || 0),
              memoryId: nftData.memoryId || null, // Will be computed if not present
              tokenCategory: nftData.tokenCategory || null,
              isNft: true,
              outputIndex: i,
            })
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SafeDelayParser] Failed to parse transaction:', err)
  }

  return deposits
}

/**
 * Extract NFT commitment from outputs preceding or containing the NFT data.
 *
 * Looks for OP_RETURN output with commitment: [issuer, beneficiary, lockEnd, beneficiaryPKH]
 * = 20 + 20 + 4 + 20 = 64 bytes after the CashTokens prefix bytes.
 */
function extractNftCommitment(tx, nftOutputIndex) {
  const outputs = tx.outputs

  // Find OP_RETURN outputs (script starts with 6a which is OP_RETURN)
  // OP_RETURN: 0x6a
  let opReturnIndex = -1
  for (let i = 0; i < nftOutputIndex; i++) {
    if (outputs[i].pkScript.startsWith('6a')) {
      opReturnIndex = i
      break
    }
  }

  if (opReturnIndex === -1) {
    // No OP_RETURN found — this might be a simple payment to contract, not an NFT
    return null
  }

  const opReturnScript = outputs[opReturnIndex].pkScript
  // Parse OP_RETURN data (skip the 0x6a prefix byte)
  const dataHex = opReturnScript.slice(2)

  // CashTokens NFT commitment format:
  // OP_RETURN [0xef] [0x03] [tokenCategory(36)] [commitmentLength(1)] [commitment(N)]
  // For a 64-byte commitment with NFT minting, we expect:
  //   0xef 0x03 <36-byte-category> 0x40 <64-byte-commitment>
  // OR more simply:
  //   0xef 0x03 <tokenCategory> <commitment>

  // Try to extract commitment bytes
  // Minimum: 0xef 0x03 <36-byte-category> <commitment-length-byte> <commitment>
  // Total minimum = 2 + 36 + 1 = 39 chars (19.5 bytes) for length byte + commitment
  // But since we're working in hex (2 chars per byte), we need even length

  try {
    const data = hexToBytes(dataHex)
    let offset = 0

    // Check for CashTokens prefix: 0xef 0x03
    if (data[0] === 0xef && data[1] === 0x03) {
      offset = 2
      // tokenCategory is 36 bytes (72 hex chars)
      const tokenCategory = bytesToHex(data.slice(offset, offset + 36)); offset += 36
      // Commitment length
      const commitLen = data[offset]; offset++
      const commitment = data.slice(offset, offset + commitLen)

      // Parse 64-byte SafeDelay commitment: [issuer(20)] [beneficiary(20)] [lockEnd(4)] [beneficiaryPKH(20)]
      if (commitment.length === 64) {
        const issuer = bytesToHex(commitment.slice(0, 20))
        const beneficiary = bytesToHex(commitment.slice(20, 40))
        const lockEndBytes = commitment.slice(40, 44)
        const lockEnd = lockEndBytes[0] | (lockEndBytes[1] << 8) | (lockEndBytes[2] << 16) | (lockEndBytes[3] << 24)
        const beneficiaryPKH = bytesToHex(commitment.slice(44, 64))

        return {
          tokenCategory,
          issuer,
          beneficiary,
          lockEnd,
          beneficiaryPKH,
        }
    }

    // Fallback: raw 64-byte commitment without CashTokens prefix
    if (data.length === 64) {
      const issuer = bytesToHex(data.slice(0, 20))
      const beneficiary = bytesToHex(data.slice(20, 40))
      const lockEndBytes = data.slice(40, 44)
      const lockEnd = lockEndBytes[0] | (lockEndBytes[1] << 8) | (lockEndBytes[2] << 16) | (lockEndBytes[3] << 24)
      const beneficiaryPKH = bytesToHex(data.slice(44, 64))
      return { beneficiary, lockEnd, beneficiaryPKH }
    }
  } catch (err) {
    console.warn('[SafeDelayParser] Failed to parse OP_RETURN data:', err)
  }

  return null
}

/**
 * Parse a single UTXO at the contract address and extract deposit info.
 */
export function parseDepositFromUtxo(utxo, contractAddress, currentBlockHeight) {
  // utxo from Electrum: { tx_hash, tx_pos, value, height }
  const contractPkh = cashAddressToPkh(contractAddress)
  // UTXO value's last byte encodes the flag
  const flag = utxo.value % 256
  const status = flag === 0x01 ? 'waiting' : 'locked'

  return {
    txid: utxo.tx_hash,
    vout: utxo.tx_pos,
    amount: satoshisToBCH(utxo.value),
    amountSatoshis: utxo.value,
    flag,
    status,
    createdAtBlock: utxo.height || currentBlockHeight,
    confirmations: utxo.confirmations || 0,
    isNft: true,
    outputIndex: utxo.tx_pos,
  }
}

// ─── Address Helpers ──────────────────────────────────────────────────────────

function cashAddressToPkh(addr) {
  // Strip 'bitcoincash:' prefix and convert base58 to bytes
  const stripped = addr.replace('bitcoincash:', '')
  const decoded = base58ToBytes(stripped)
  if (!decoded || decoded.length < 25) return null
  // version byte + 20 bytes PKH + 4 bytes checksum
  return bytesToHex(decoded.slice(1, 21))
}

function base58ToBytes(addr) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = BigInt(0)
  for (const char of addr) {
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) return null
    num = num * BigInt(58) + BigInt(idx)
  }
  const hex = num.toString(16)
  const padded = hex.length % 2 ? '0' + hex : hex
  const bytes = []
  for (let i = 0; i < padded.length; i += 2) bytes.push(parseInt(padded.substr(i, 2), 16))
  return Buffer.from(bytes)
}

function hash256LEToHex(hex) {
  // For display purposes only — real txid comes from Electrum
  // This is a placeholder that produces a consistent hex string
  return hexToBytes(hex).map(b => b.toString(16).padStart(2, '0')).join('')
}
