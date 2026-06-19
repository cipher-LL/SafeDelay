/**
 * Generate a memoryId for a SafeDelay deposit.
 * Per NFT_SPEC.md, memoryId is a hash of (userPkh + createdAtBlock + amount)
 * used as the canonical deposit identifier.
 */

/**
 * Derive the public key hash (PKH) from a wallet address.
 * For demo/simulation, derives a plausible hex PKH from the address string.
 */
export function addressToPkh(address) {
  if (!address) return null
  // EVM-style addresses: take last 40 hex chars (20 bytes) after '0x'
  if (address.startsWith('0x')) {
    return address.slice(2).toLowerCase()
  }
  // CashAddress: strip prefix and convert base58 to hex
  // For demo purposes, hash the address string to get a stable 20-byte PKH
  return pkhFromString(address)
}

/**
 * Simple deterministic hash to produce a 20-byte PKH-like value from a string.
 * Used for demo mode where we're working with simulated addresses.
 */
function pkhFromString(str) {
  let hash = 0
  const salt = 'safedelay-pkh-v1'
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit int
  }
  // Produce a hex string padded to 40 characters (20 bytes)
  const hex = Math.abs(hash).toString(16).padStart(8, '0').repeat(5).slice(0, 40)
  return hex
}

/**
 * Generate a memoryId for a deposit.
 * MemoryId = keccak256(pkh + createdAtBlock + amount)
 *
 * In production this would use proper keccak256.
 * For demo, we use a deterministic hash.
 */
export async function generateMemoryId(address, createdAtBlock, amountSatoshis) {
  const pkh = addressToPkh(address)
  if (!pkh) return null

  const data = pkh + Number(createdAtBlock).toString(16).padStart(8, '0') + Number(amountSatoshis).toString(16).padStart(16, '0')
  return hashToHex(data)
}

/**
 * Simple deterministic hash function for demo.
 * In production: use keccak256 from viem/cashscript.
 */
async function hashToHex(data) {
  // Use Web Crypto API for a reasonable demo hash
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Format a memoryId for display (shortened).
 */
export function formatMemoryId(memoryId) {
  if (!memoryId) return '—'
  if (memoryId.startsWith('0x')) {
    return memoryId.slice(0, 10) + '...' + memoryId.slice(-6)
  }
  return memoryId.slice(0, 10) + '...' + memoryId.slice(-6)
}