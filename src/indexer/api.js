/**
 * SafeDelay Indexer API
 *
 * High-level query API for the SafeDelay frontend.
 * Provides deposit enumeration, filtering, and state queries.
 *
 * Usage:
 *   import { createIndexerApi } from './indexer/api.js'
 *
 *   const api = await createIndexerApi(contractAddress)
 *   const deposits = await api.getDepositsForAddress('bitcoincash:...')
 *   const userDeposits = await api.getActiveDepositsByPkh('...')
 */

import { SafeDelayIndexer } from './indexer.js'
import { DepositStore } from './store.js'
import { addressToPkh } from '../utils.js'

let _indexerInstance = null
let _indexerApiInstance = null

/**
 * Initialize and return the singleton indexer API.
 * Call this once when the app starts (e.g., in App.jsx useEffect).
 */
export async function createIndexerApi(contractAddress, electrumEndpoint) {
  if (_indexerApiInstance) return _indexerApiInstance

  const indexer = new SafeDelayIndexer(contractAddress, electrumEndpoint)
  try {
    await indexer.start()
    _indexerInstance = indexer
    _indexerApiInstance = new SafeDelayIndexerApi(indexer)
    return _indexerApiInstance
  } catch (err) {
    console.warn('[SafeDelayIndexer] Failed to connect to Electrum — running in offline mode:', err.message)
    // Return an API instance that only reads from local store (IndexedDB)
    _indexerApiInstance = new SafeDelayIndexerApi(null)
    return _indexerApiInstance
  }
}

/**
 * Get the current indexer API instance (throws if not initialized).
 */
export function getIndexerApi() {
  if (!_indexerApiInstance) throw new Error('Indexer not initialized — call createIndexerApi first')
  return _indexerApiInstance
}

/**
 * Stop the indexer (cleanup on app unmount).
 */
export async function stopIndexer() {
  if (_indexerInstance) {
    await _indexerInstance.stop()
    _indexerInstance = null
    _indexerApiInstance = null
  }
}

/**
 * High-level SafeDelay deposit query API.
 * Wraps the indexer and local store to provide a clean interface for the frontend.
 */
export class SafeDelayIndexerApi {
  constructor(indexer) {
    this.indexer = indexer
    this.store = new DepositStore()
  }

  /**
   * Get all deposits for a wallet address (cashaddress or ETH-style).
   * Converts address to PKH internally.
   */
  async getDepositsForAddress(address) {
    const pkh = addressToPkh(address)
    if (!pkh) return []
    return this.getDepositsByPkh(pkh)
  }

  /**
   * Get all deposits for a user by their public key hash.
   */
  async getDepositsByPkh(pkh) {
    // Always try local store first (faster, works offline)
    const localDeposits = await this.store.getDepositsByUser(pkh)

    if (!this.indexer?.running) {
      return localDeposits
    }

    // Refresh from chain
    try {
      const chainDeposits = await this.indexer.getDepositsByUser(pkh)
      // Merge: prefer chain data, fill in from local
      const merged = {}
      for (const d of localDeposits) merged[d.id] = d
      for (const d of chainDeposits) merged[d.id] = { ...merged[d.id], ...d }
      return Object.values(merged)
    } catch (err) {
      console.warn('[SafeDelayIndexerApi] Chain query failed, returning local:', err)
      return localDeposits
    }
  }

  /**
   * Get all active (non-withdrawn) deposits for a user.
   */
  async getActiveDepositsByPkh(pkh) {
    const all = await this.getDepositsByPkh(pkh)
    return all.filter(d => d.status !== 'withdrawn')
  }

  /**
   * Get all active deposits for a wallet address.
   */
  async getActiveDepositsForAddress(address) {
    const pkh = addressToPkh(address)
    if (!pkh) return []
    return this.getActiveDepositsByPkh(pkh)
  }

  /**
   * Get all indexed deposits (for debugging/admin).
   */
  async getAllDeposits() {
    return this.store.getAllDeposits()
  }

  /**
   * Get current block height from the indexer.
   */
  async getBlockHeight() {
    if (!this.indexer?.running) return null
    return this.indexer.getBlockHeight()
  }

  /**
   * Manually trigger a re-sync from the blockchain.
   */
  async resync() {
    if (!this.indexer?.running) {
      throw new Error('Indexer not connected — cannot resync')
    }
    await this.indexer._sync()
  }

  /**
   * Check if the indexer is connected to the blockchain.
   */
  isConnected() {
    return this.indexer?.running ?? false
  }

  /**
   * Get a summary of indexed deposits for display.
   */
  async getSummary() {
    const all = await this.store.getAllDeposits()
    return {
      total: all.length,
      locked: all.filter(d => d.status === 'locked').length,
      waiting: all.filter(d => d.status === 'waiting').length,
      withdrawn: all.filter(d => d.status === 'withdrawn').length,
      connected: this.isConnected(),
    }
  }
}
