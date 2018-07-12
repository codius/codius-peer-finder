import sampleSize from 'lodash.samplesize'
import axios from 'axios'
import createDebug from 'debug'

const debug = createDebug('PeerFinder')

const DEFAULT_BAD_PEER_TIMEOUT_HOURS = 24
const DEFAULT_PEERS_PER_QUERY = 10
const DEFAULT_INTERVAL = 15000
export const DEFAULT_EXCLUDE = [
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  'local.codius.org',
  'codius.example.com'
]
export const DEFAULT_BOOTSTRAP_PEERS = [
  'https://codius.justmoon.com',
  'https://codius.andros-connector.com',
  'https://codius.africa',
  'https://codius.risky.business',
  'https://codius.feraltc.com',
  'https://codius.tinypolarbear.com'
]

export interface PeerFinderOptions {
  publicUrl?: string
  bootstrapPeers?: string[]
  excludeHosts?: string[]
  peersPerQuery?: number
  interval?: number
  badPeerTimeoutHours?: number
  addPeerCallback?: (peer: string) => void
  removePeerCallback?: (peer: string) => void
}

export default class PeerFinder {
  // Settings
  private publicUrl?: string
  private peersPerQuery: number
  private interval: number
  private badPeerTimeoutHours: number

  // Callbacks
  private addPeerCallback: (peer: string) => void
  private removePeerCallback: (peer: string) => void

  // Data structures
  private peers: Set<string>
  private excludeHosts: Set<string>
  private badPeers: Map<string, Date> = new Map()

  constructor(options = {} as PeerFinderOptions) {
    this.publicUrl = options.publicUrl
    this.peersPerQuery = options.peersPerQuery || DEFAULT_PEERS_PER_QUERY
    this.interval = options.interval || DEFAULT_INTERVAL
    this.badPeerTimeoutHours =
      options.badPeerTimeoutHours || DEFAULT_BAD_PEER_TIMEOUT_HOURS

    const bootstrapPeers = options.bootstrapPeers || DEFAULT_BOOTSTRAP_PEERS
    let excludeHosts = options.excludeHosts || DEFAULT_EXCLUDE
    if (options.publicUrl) {
      excludeHosts = [new URL(options.publicUrl).hostname, ...excludeHosts]
    }

    this.addPeerCallback = options.addPeerCallback || function() {}
    this.removePeerCallback = options.removePeerCallback || function() {}

    this.peers = new Set(bootstrapPeers)
    this.excludeHosts = new Set(excludeHosts)
  }

  start() {
    this.run().catch(err => debug(err))
    setInterval(this.run.bind(this), this.interval)
  }

  async run() {
    debug('Running PeerFinder... current peer list size: %d', this.peers.size)
    for (const peer of sampleSize([...this.peers], this.peersPerQuery)) {
      try {
        const discoveredPeers = await this.discoverPeersFrom(peer)
        this.addPeers(discoveredPeers)
      } catch (err) {
        debug(
          'Peer %s errored with "%s". Marking as bad peer...',
          peer,
          err.code
        )
        this.removePeer(peer)
      }
    }
    debug('PeerFinder run finished... new peer list size: %d', this.peers.size)
  }

  getPeers() {
    return [...this.peers]
  }

  getBadPeerList() {
    return [...this.badPeers.keys()]
  }

  addPeers(peers: string[]) {
    for (const peer of peers) {
      if (!this.peers.has(peer) && this.addablePeer(peer)) {
        this.peers.add(peer)
        this.addPeerCallback(peer)
      }
    }
  }

  removePeer(peer: string) {
    const expireTime = new Date()
    expireTime.setHours(expireTime.getHours() + this.badPeerTimeoutHours)
    this.badPeers.set(peer, expireTime)
    this.peers.delete(peer)
    this.removePeerCallback(peer)
  }

  private async discoverPeersFrom(peer: string) {
    let response
    if (this.publicUrl) {
      response = await axios.post(`${peer}/peers/discover`, {
        peers: [this.publicUrl]
      })
    } else {
      response = await axios.get(`${peer}/peers`)
    }
    return response.data.peers
  }

  private addablePeer(peer: string) {
    const hostname = new URL(peer).hostname
    if (this.excludeHosts.has(hostname)) return false

    const expireTime = this.badPeers.get(peer)
    if (expireTime) {
      if (expireTime > new Date()) {
        return false
      }
      // Bad peer has expired
      this.badPeers.delete(peer)
    }
    return true
  }
}
