/**
 * SafeDelay Off-Chain NFT UTXO Indexer
 *
 * Indexes SafeDelay deposit NFTs from the Bitcoin Cash blockchain via Electrum API.
 * Parses CashTokens NFT outputs to extract deposit metadata, stores them in IndexedDB,
 * and exposes a query API for the frontend.
 *
 * Per NFT_SPEC.md:
 *   - NFTs are sent to the SafeDelay contract address (P2PKH to contractPkh)
 *   - Value field last byte encodes the state flag (0x00=locked, 0x01=withdrawal active)
 *   - Deposit metadata (amount, depositor, lock expiry) is derived from the UTXO itself
 */

import { parseDepositFromUtxo, parseTransactionForDeposits } from './parser.js'
import { DepositStore } from './store.js'

// ─── Electrum Client ─────────────────────────────────────────────────────────

const DEFAULT_ELECTRUM_ENDPOINTS = [
  'ssl://electrum.imaginary.cash:50002',
  'ssl://bch.imaginary.cash:50002',
]

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000

/**
 * Lightweight Electrum client using the Bitcoin ABC protocol.
 * https://docs.bitcoinabc.org/rpc/
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Per-call request timeout
 * - Method subscription support
 */
export class ElectrumClient {
  constructor(endpoint = DEFAULT_ELECTRUM_ENDPOINTS[0]) {
    this.endpoint = endpoint
    this.socket = null
    this.ready = false
    this._id = 0
    this._pending = new Map()
    this._subscribers = new Map()
    this._reconnectDelay = RECONNECT_BASE_DELAY_MS
    this._reconnectTimer = null
    this._intentionalClose = false
    this._onStatusChange = null // (ready: boolean) => void
  }

  /** Set a callback for connection status changes (for UI indicators) */
  setStatusCallback(cb) {
    this._onStatusChange = cb
  }

  async connect() {
    this._intentionalClose = false
    return new Promise((resolve, reject) => {
      const [protocol, hostPort] = this.endpoint.split('://')
      const [host, port] = hostPort.split(':')
      const isSSL = protocol === 'ssl'

      this.socket = new WebSocket(`${isSSL ? 'wss' : 'ws'}://${host}:${port}`)

      let settled = false
      const cleanup = () => {
        if (!settled) {
          settled = true
          clearTimeout(timeoutTimer)
        }
      }
      const timeoutTimer = setTimeout(() => {
        cleanup()
        this.socket?.close()
        reject(new Error('Electrum connection timeout'))
      }, 10000)

      this.socket.addEventListener('open', () => {
        cleanup()
        this.ready = true
        this._reconnectDelay = RECONNECT_BASE_DELAY_MS
        this._onStatusChange?.(true)
        resolve()
      })

      this.socket.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id !== undefined && this._pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this._pending.get(msg.id)
          this._pending.delete(msg.id)
          if (msg.error) rej(new Error(msg.error.message || msg.error))
          else res(msg.result)
        } else if (msg.method && this._subscribers.has(msg.method)) {
          this._subscribers.get(msg.method).forEach(cb => cb(msg.params))
        }
      })

      this.socket.addEventListener('error', (err) => {
        cleanup()
        if (!this._intentionalClose) {
          this.ready = false
          this._onStatusChange?.(false)
          this._scheduleReconnect()
        }
        if (!settled) {
          settled = true
          reject(err)
        }
      })

      this.socket.addEventListener('close', () => {
        cleanup()
        this.ready = false
        this._onStatusChange?.(false)
        if (!this._intentionalClose) {
          this._scheduleReconnect()
        }
      })
    })
  }

  /** Schedule a reconnection attempt with exponential backoff */
  _scheduleReconnect() {
    if (this._reconnectTimer !== null) return
    console.warn(`[ElectrumClient] Connection lost. Reconnecting in ${this._reconnectDelay}ms...`)
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null
      try {
        await this.connect()
        console.log('[ElectrumClient] Reconnected successfully.')
      } catch {
        // Backoff handled by next schedule
      }
    }, this._reconnectDelay)
    // Exponential backoff: double each attempt, cap at max
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX_DELAY_MS)
  }

  /** Close the connection intentionally (suppresses reconnection) */
  async close() {
    this._intentionalClose = true
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this.socket?.close()
  }

  async _call(method, params = []) {
    if (!this.ready) throw new Error('Not connected')
    return new Promise((resolve, reject) => {
      const id = ++this._id
      this._pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id)
          reject(new Error(`RPC timeout: ${method}`))
        }
      }, 30000)
    })
  }

  /** Subscribe to scripthash updates (new UTXOs / spends) */
  async scripthash_subscribe(scripthash) {
    await this._call('blockchain.scripthash.subscribe', [scripthash])
  }

  async scripthash_unsubscribe(scripthash) {
    await this._call('blockchain.scripthash.unsubscribe', [scripthash])
  }

  /** Get all UTXOs at a scripthash */
  async getUTXOs(scripthash) {
    return this._call('blockchain.scripthash.listunspent', [scripthash])
  }

  /** Get full transaction history for a scripthash */
  async getHistory(scripthash) {
    return this._call('blockchain.scripthash.get_history', [scripthash])
  }

  /** Get a full transaction by hash */
  async getTransaction(txHash) {
    return this._call('blockchain.transaction.get', [txHash, true])
  }

  /** Get current block height */
  async getBlockHeight() {
    return this._call('blockchain.headers.subscribe', [], 2)
  }

  /** Convert a cashaddress to a scripthash for Electrum */
  addressToScripthash(address) {
    // Strip prefix, decode base58, compute hash160, reverse for Electrum endianness
    const decoded = base58ToBytes(address)
    if (!decoded) return null
    const hash160 = decoded.slice(1, -4) // skip version byte and checksum
    return hexToReverseHex(hash160.toString('hex'))
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToReverseHex(hex) {
  return hex.match(/.{2}/g).reverse().join('')
}

function base58ToBytes(addr) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = BigInt(0)
  for (const char of addr) {
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) return null
    num = num * BigInt(58) + BigInt(idx)
  }
  const hex = num.toString(16).padStart(2, '0')
  // Pad to whole bytes
  const bytes = hexToBytes(hex.length % 2 ? '0' + hex : hex)
  return Buffer.from(bytes)
}

function hexToBytes(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16))
  }
  return bytes
}

// ─── SafeDelay Indexer ────────────────────────────────────────────────────────

/**
 * Main indexer class for SafeDelay deposits.
 *
 * Usage:
 *   const indexer = new SafeDelayIndexer(contractAddress, electrumEndpoint)
 *   indexer.onSyncError((err) => console.error('Sync failed:', err))
 *   await indexer.start()
 *   const deposits = indexer.getDepositsByUser(userPkh)
 */
export class SafeDelayIndexer {
  constructor(contractAddress, electrumEndpoint) {
    this.contractAddress = contractAddress
    this.electrum = new ElectrumClient(electrumEndpoint)
    this.store = new DepositStore()
    this.scripthash = this.electrum.addressToScripthash(contractAddress)
    this.running = false
    this._blockHeight = 0

    // Sync status — exposed so the UI can show "Syncing…", "Error", or "Ready"
    this.syncStatus = 'idle'   // 'idle' | 'syncing' | 'error'
    this.lastSyncError = null   // null | Error
    this._syncErrorCallbacks = []

    // Wire Electrum connection status into syncStatus
    this.electrum.setStatusCallback((ready) => {
      if (!ready && this.running) {
        this.syncStatus = 'error'
        this.lastSyncError = new Error('Lost connection to Electrum server')
        this._emitSyncError()
      }
    })
  }

  /**
   * Register a callback for sync errors.
   * @param {(err: Error) => void} cb
   */
  onSyncError(cb) {
    this._syncErrorCallbacks.push(cb)
  }

  /** Remove a previously registered sync error callback */
  offSyncError(cb) {
    this._syncErrorCallbacks = this._syncErrorCallbacks.filter(c => c !== cb)
  }

  _emitSyncError() {
    const err = this.lastSyncError
    this._syncErrorCallbacks.forEach(cb => {
      try { cb(err) } catch {}
    })
  }

  async start() {
    await this.electrum.connect()
    // Get current block height
    const header = await this.electrum.getBlockHeight()
    this._blockHeight = header.height
    this.running = true

    // Subscribe to contract scripthash for real-time updates
    await this.electrum.scripthash_subscribe(this.scripthash)
    this.electrum._subscribers.get('blockchain.scripthash.subscribe') ||
      this.electrum._subscribers.set('blockchain.scripthash.subscribe', [])
    this.electrum._subscribers.get('blockchain.scripthash.subscribe').push(
      (params) => this._onScripthashUpdate(params)
    )

    // Initial full sync
    await this._sync()
  }

  async stop() {
    this.running = false
    this.syncStatus = 'idle'
    await this.electrum.scripthash_unsubscribe(this.scripthash)
    await this.electrum.close()
  }

  /** Called when the contract's scripthash changes (new UTXO or spend) */
  async _onScripthashUpdate([scripthash]) {
    if (scripthash !== this.scripthash) return
    console.debug('[SafeDelayIndexer] Scripthash update, re-syncing...')
    await this._sync()
  }

  /** Full re-sync of all UTXOs at the contract address */
  async _sync() {
    this.syncStatus = 'syncing'
    this.lastSyncError = null
    try {
      const utxos = await this.electrum.getUTXOs(this.scripthash)
      const txHashes = [...new Set(utxos.map(u => u.tx_hash))]

      for (const txHash of txHashes) {
        const tx = await this.electrum.getTransaction(txHash)
        const deposits = parseTransactionForDeposits(tx.hex, txHash, this.contractAddress, this._blockHeight)
        for (const deposit of deposits) {
          await this.store.upsertDeposit(deposit)
        }
      }
      this.syncStatus = 'idle'
    } catch (err) {
      console.error('[SafeDelayIndexer] Sync error:', err)
      this.syncStatus = 'error'
      this.lastSyncError = err
      this._emitSyncError()
    }
  }

  /** Get all deposits for a specific user PKH */
  async getDepositsByUser(userPkh) {
    return this.store.getDepositsByUser(userPkh)
  }

  /** Get all deposits */
  async getAllDeposits() {
    return this.store.getAllDeposits()
  }

  /** Get current block height */
  async getBlockHeight() {
    return this._blockHeight
  }
}
