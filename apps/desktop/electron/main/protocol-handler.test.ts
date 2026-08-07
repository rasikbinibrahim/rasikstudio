import { describe, expect, it, vi } from 'vitest'

const registeredSchemes: unknown[] = []
let requestHandler: ((request: Request) => Promise<Response>) | null = null
const fetchCalls: string[] = []

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn((schemes: unknown[]) => registeredSchemes.push(...schemes)),
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>) => {
      requestHandler = handler
    }),
  },
  net: {
    fetch: vi.fn(async (url: string) => {
      fetchCalls.push(url)
      if (url.includes('missing')) throw new Error('ENOENT')
      return new Response('ok', { status: 200 })
    }),
  },
}))

import {
  APP_PROTOCOL_SCHEME,
  installAppProtocolHandler,
  registerAppProtocolAsPrivileged,
} from './protocol-handler'

describe('protocol-handler', () => {
  it('registers the app scheme as a privileged, standard, secure scheme', () => {
    registerAppProtocolAsPrivileged()

    expect(registeredSchemes).toContainEqual(
      expect.objectContaining({
        scheme: APP_PROTOCOL_SCHEME,
        privileges: expect.objectContaining({ standard: true, secure: true, supportFetchAPI: true }),
      }),
    )
  })

  it('serves index.html for the app://renderer/ root', async () => {
    installAppProtocolHandler('/build/renderer')

    const response = await requestHandler!(new Request('app://renderer/'))

    expect(response.status).toBe(200)
    expect(fetchCalls.at(-1)).toContain('/build/renderer/index.html')
  })

  it('serves a nested asset path', async () => {
    installAppProtocolHandler('/build/renderer')

    await requestHandler!(new Request('app://renderer/assets/main.js'))

    expect(fetchCalls.at(-1)).toContain('/build/renderer/assets/main.js')
  })

  it('neutralizes a path-traversal attempt — WHATWG URL parsing already clamps ".." at the ' +
    'authority root for any URL with a host, so it resolves inside rendererDir rather than ' +
    'escaping it (the join()+startsWith(root) check in the handler is defence in depth on top ' +
    'of that, not the only thing standing between this request and /etc/passwd)', async () => {
    installAppProtocolHandler('/build/renderer')
    fetchCalls.length = 0

    const response = await requestHandler!(new Request('app://renderer/../../etc/passwd'))

    expect(response.status).toBe(200)
    expect(fetchCalls.at(-1)).toMatch(/^file:\/\/\/build\/renderer\//)
  })

  it('returns 404 for a request to an unrecognized host', async () => {
    installAppProtocolHandler('/build/renderer')

    const response = await requestHandler!(new Request('app://not-renderer/index.html'))

    expect(response.status).toBe(404)
  })

  it('returns 404 (not a thrown error) when the underlying file does not exist', async () => {
    installAppProtocolHandler('/build/renderer')

    const response = await requestHandler!(new Request('app://renderer/missing.js'))

    expect(response.status).toBe(404)
  })
})
