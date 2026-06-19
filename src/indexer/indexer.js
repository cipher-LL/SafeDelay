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

/**
 * Lightweight Electrum client using the Bitcoin ABC protocol.
 * https://docs.bitcoinabc.org/rpc/
 */
export class ElectrumClient {
  constructor(endpoint = DEFAULT_ELECTRUM_ENDPOINTS[0]) {
    this.endpoint = endpoint
    this.socket = null
    this.ready = false
    this._id = 0
    this._pending = new Map()
    this._subscribers = new Map()
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const [protocol, hostPort] = this.endpoint.split('://')
      const [host, port] = hostPort.split(':')
      const isSSL = protocol === 'ssl'

      this.socket = new WebSocket(`${isSSL ? 'wss' : 'ws'}://${host}:${port}`)

      this.socket.addEventListener('open', () => {
        this.ready = true
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

      this.socket.addEventListener('error', reject)
      this.socket.addEventListener(' close', () => {
        this.ready = false
      })

      // Timeout for connection
      setTimeout(() => reject(new Error('Electrum connection timeout')), 10000)
    })
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
    await this.electrum.scripthash_unsubscribe(this.scripthash)
    this.electrum.socket?.close()
  }

  /** Called when the contract's scripthash changes (new UTXO or spend) */
  async _onScripthashUpdate([scripthash]) {
    if (scripthash !== this.scripthash) return
    console.debug('[SafeDelayIndexer] Scripthash update, re-syncing...')
    await this._sync()
  }

  /** Full re-sync of all UTXOs at the contract address */
  async _sync() {
    try {
      const utxos = await this.electrum.getUTXOs(this.scripthash)
      const txHashes = [...new Set(utxos.map(u => u.tx_hash))]

      for (const txHash of txHashes) {
        const tx = await this.electrum.getTransaction(txHash)
        const deposits = parseTransactionForDeposits(tx, this.contractAddress, this._blockHeight)
        for (const deposit of deposits) {
          await this.store.upsertDeposit(deposit)
        }
      }
    } catch (err) {
      console.error('[SafeDelayIndexer] Sync error:', err)
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
