import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { runtimeConfigClient } from '../../demo-app/src/adapters/config-gateway-client'

const originalFetch = globalThis.fetch

describe('runtimeConfigClient · Gateway 路径', () => {
  const calls: string[] = []

  beforeEach(() => {
    calls.length = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('listForms 请求 GET /__config/forms', async () => {
    await runtimeConfigClient.listForms()
    assert.equal(calls.length, 1)
    assert.ok(calls[0].endsWith('/__config/forms'))
  })

  it('listVersionDetails 请求 version-details', async () => {
    await runtimeConfigClient.listVersionDetails('purchase-order')
    assert.equal(calls.length, 1)
    assert.ok(
      calls[0].includes('/__config/forms/purchase-order/version-details'),
    )
  })

})

describe('runtimeConfigClient · loadFormDefinition 路径', () => {
  it('指定 version 时使用 /versions/:v/published', async () => {
    let requested = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested = String(input)
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    await runtimeConfigClient.loadFormDefinition('purchase-order', 2)
    assert.ok(requested.includes('/versions/2/published'))
    assert.ok(!requested.includes('/published/latest'))

    globalThis.fetch = originalFetch
  })
})
