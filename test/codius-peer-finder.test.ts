import PeerFinder, { PeerFinderOptions } from '../src'

import moxios from 'moxios'
import tk from 'timekeeper'

describe('PeerFinder tests', () => {
  beforeEach(() => moxios.install())
  afterEach(() => {
    moxios.uninstall()
    tk.reset()
  })

  it('is instantiable', () => {
    expect(new PeerFinder()).toBeInstanceOf(PeerFinder)
  })

  it('sends out `peersPerQuery` number of requests per run', done => {
    const options: PeerFinderOptions = { peersPerQuery: 3 }
    const pf = new PeerFinder(options)
    pf.run()

    moxios.stubRequest(/.*\/peers$/, { status: 200 })
    moxios.wait((() => {
      expect(moxios.requests.count()).toBe(3)
      done()
    }))
  })

  it('starts with bootstrap hosts', () => {
    const bootstrapPeers = ['https://codius.testhost.com']
    const options: PeerFinderOptions = { bootstrapPeers }
    const pf = new PeerFinder(options)
    expect(pf.getPeers()).toEqual(bootstrapPeers)
  })

  it('does not add excluded hosts', () => {
    const bootstrapPeers = ['https://codius.testhost.com']
    const excludeHosts = ['codius.example.com']
    const options: PeerFinderOptions = {
      excludeHosts,
      bootstrapPeers
    }
    const pf = new PeerFinder(options)
    pf.addPeers(['https://codius.example.com'])
    expect(pf.getPeers()).toEqual(bootstrapPeers)
  })

  it('broadcasts the public url to peers if provided', done => {
    const publicUrl = 'https://codius.awesomehost.com'
    const options: PeerFinderOptions = {
      peersPerQuery: 1,
      publicUrl
    }
    const pf = new PeerFinder(options)
    pf.run()
    
    moxios.wait(() => {
      const request = moxios.requests.mostRecent()
      expect(request.config.method).toEqual('post')
      expect(request.config.data).toEqual(JSON.stringify({ 'peers': [ publicUrl ] }))
      done()
    })
  })

  it('does not add the public url to peers', () => {
    const publicUrl = 'https://codius.awesomehost.com'
    const options: PeerFinderOptions = {
      publicUrl
    }
    const pf = new PeerFinder(options)
    pf.addPeers([publicUrl])
    expect(pf.getPeers()).not.toContain(publicUrl)
  })

  it('adds hosts from queried peers', done => {
    const newHost = 'https://codius.newhost.com'
    const options: PeerFinderOptions = {
      peersPerQuery: 1,
    }
    const pf = new PeerFinder(options)
    pf.run()

    moxios.stubRequest(/.*\/peers$/, {
      status: 200,
      response: {
        'peers': [
          newHost
        ]
      }
    })
    moxios.wait(() => {
      expect(pf.getPeers()).toContain(newHost)
      done()
    })    
  })

  it('deduplicates found peers', done => {
    const bootstrapPeers = [
      'https://codius.testhost.com',
      'https://codius.othertesthost.com'
    ]
    const newHost = 'https://codius.newhost.com'
    const options: PeerFinderOptions = {
      bootstrapPeers,
      peersPerQuery: 2,
    }
    const pf = new PeerFinder(options)
    pf.run()

    moxios.stubRequest(/.*\/peers$/, {
      status: 200,
      response: {
        'peers': [
          newHost
        ]
      }
    })
    moxios.wait(() => {
      const foundPeers = pf.getPeers().filter(peer => !bootstrapPeers.includes(peer))
      expect(foundPeers).toEqual([newHost])
      done()
    })    
  })

  it('removes a peer if they 404', done => {
    const bootstrapPeers = ['https://codius.testhost.com']
    const options: PeerFinderOptions = {
      bootstrapPeers,
      peersPerQuery: 1,
    }
    const pf = new PeerFinder(options)
    pf.run()

    moxios.wait(() => {
      const request = moxios.requests.mostRecent()
      request.respondWith({
        status: 404
      }).then((() => {
        expect(pf.getPeers().length).toEqual(0)
        done()
      }))
    })
  })

  it('does not add a peer if they have been removed', () => {
    const badHost = 'https://codius.badhost.com'
    const pf = new PeerFinder()
    pf.removePeer(badHost)
    pf.addPeers([badHost])
    expect(pf.getPeers()).not.toContain(badHost)
  })

  it('requests new peers every interval when started', done => {
    const options: PeerFinderOptions = {
      peersPerQuery: 1,
      interval: 100
    }
    const pf = new PeerFinder(options)
    pf.start()

    moxios.stubRequest(/.*\/peers$/, {
      status: 200
    })
    moxios.wait(() => {
      expect(moxios.requests.count()).toBe(2)
      done()
    }, 110)    

  })

  it('allows bad peers to be re-added after they have expired', () => {
    const poorHost = 'https://codius.poorhost.com'
    const options: PeerFinderOptions = {
      badPeerTimeoutHours: 1
    }
    const pf = new PeerFinder(options)
    pf.removePeer(poorHost)

    const theFuture = new Date()
    theFuture.setHours(theFuture.getHours() + 2)
    tk.travel(theFuture)

    pf.addPeers([poorHost])
    expect(pf.getPeers()).toContain(poorHost)
  })
})