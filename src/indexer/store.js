/**
 * SafeDelay IndexedDB Store
 *
 * Persistent storage for indexed SafeDelay deposit NFTs.
 * Uses IndexedDB to store deposits locally in the browser.
 *
 * Schema:
 *   deposits: {
 *     id (keyPath)       — unique deposit identifier (txid:vout)
 *     txid               — transaction hash
 *     vout               — output index
 *     amount             — deposit amount in BCH (string for precision)
 *     amountSatoshis     — deposit amount in satoshis
 *     beneficiaryPkh     — beneficiary public key hash
 *     beneficiaryPKH     — alias for beneficiaryPkh
 *     lockEnd            — block number when withdrawal becomes possible
 *     flag               — state flag (0x00=locked, 0x01=waiting, etc.)
 *     status             — 'locked' | 'waiting' | 'withdrawn'
 *     createdAtBlock     — block height when deposit was created
 *     memoryId           — canonical deposit identifier (bytes)
 *     tokenCategory      — CashTokens NFT category
 *     indexedAt          — timestamp when we first saw this deposit
 *     updatedAt          — last update timestamp
 *   }
 *
 * Indexes:
 *   - by-beneficiary: beneficiaryPkh
 *   - by-status: status
 *   - by-createdAt: createdAtBlock
 */

const DB_NAME = 'SafeDelayIndexer'
const DB_VERSION = 1
const STORE_NAME = 'deposits'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('by-beneficiary', 'beneficiaryPkh', { unique: false })
        store.createIndex('by-status', 'status', { unique: false })
        store.createIndex('by-createdAt', 'createdAtBlock', { unique: false })
        store.createIndex('by-memoryId', 'memoryId', { unique: false })
      }
    }

    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = (event) => reject(event.target.error)
  })
}

export class DepositStore {
  constructor() {
    this._db = null
    this._ready = openDB()
  }

  async _withStore(mode, callback) {
    const db = await this._ready
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    return callback(store)
  }

  async _requestPromisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /** Insert or update a deposit */
  async upsertDeposit(deposit) {
    const db = await this._ready
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const id = `${deposit.txid}:${deposit.vout}`
    const existing = await this._requestPromisify(store.get(id))

    const now = Date.now()
    const record = {
      ...existing,
      ...deposit,
      id,
      beneficiaryPkh: deposit.beneficiaryPkh || deposit.beneficiaryPKH || existing?.beneficiaryPkh,
      beneficiaryPKH: deposit.beneficiaryPkh || deposit.beneficiaryPKH || existing?.beneficiaryPKH,
      indexedAt: existing?.indexedAt || now,
      updatedAt: now,
    }

    await this._requestPromisify(store.put(record))
    return record
  }

  /** Get a single deposit by txid:vout */
  async getDeposit(txid, vout) {
    return this._withStore('readonly', store =>
      this._requestPromisify(store.get(`${txid}:${vout}`))
    )
  }

  /** Get all deposits for a specific beneficiary PKH */
  async getDepositsByUser(beneficiaryPkh) {
    return this._withStore('readonly', store => {
      const index = store.index('by-beneficiary')
      return this._requestPromisify(index.getAll(beneficiaryPkh))
    })
  }

  /** Get all deposits with a specific status */
  async getDepositsByStatus(status) {
    return this._withStore('readonly', store => {
      const index = store.index('by-status')
      return this._requestPromisify(index.getAll(status))
    })
  }

  /** Get all active (non-withdrawn) deposits for a user */
  async getActiveDepositsByUser(beneficiaryPkh) {
    const all = await this.getDepositsByUser(beneficiaryPkh)
    return all.filter(d => d.status !== 'withdrawn')
  }

  /** Get all deposits */
  async getAllDeposits() {
    return this._withStore('readonly', store =>
      this._requestPromisify(store.getAll())
    )
  }

  /** Update deposit status (e.g., after startWithdraw or withdraw) */
  async updateDepositStatus(txid, vout, status, extra = {}) {
    const deposit = await this.getDeposit(txid, vout)
    if (!deposit) return null
    return this.upsertDeposit({ ...deposit, ...extra, status })
  }

  /** Mark a deposit as withdrawn */
  async markWithdrawn(txid, vout) {
    return this.updateDepositStatus(txid, vout, 'withdrawn')
  }

  /** Mark a deposit as waiting (startWithdraw called) */
  async markWaiting(txid, vout) {
    return this.updateDepositStatus(txid, vout, 'waiting')
  }

  /** Clear all deposits (for testing/reset) */
  async clearAll() {
    return this._withStore('readwrite', store =>
      this._requestPromisify(store.clear())
    )
  }

  /** Get count of all deposits */
  async count() {
    return this._withStore('readonly', store =>
      this._requestPromisify(store.count())
    )
  }

  /** Export all deposits as JSON */
  async exportJSON() {
    const deposits = await this.getAllDeposits()
    return JSON.stringify(deposits, null, 2)
  }
}
