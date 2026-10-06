import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { defaultFieldState } from '../../src/engine/field-state'
import { ConfigStore } from '../config-store'
import { FormService } from '../form-service'
import { PublishService } from '../publish-service'
import type { FormBundle } from '../types'

function makeBundle(label: string): FormBundle {
  return {
    schema: {
      fields: [
        {
          name: 'amount',
          label,
          type: 'money',
          initialState: defaultFieldState({ required: true }),
        },
      ],
    },
    rules: [],
    permissions: { version: 1, roles: ['employee'], entries: [] },
  }
}

function createHarness(): {
  store: ConfigStore
  forms: FormService
  publish: PublishService
} {
  const store = new ConfigStore()
  const forms = new FormService(store)
  const publish = new PublishService(forms, store)
  return { store, forms, publish }
}

describe('FormService · updatedAt', () => {
  it('saveDraft 首次保存带有 updatedAt', () => {
    const { forms } = createHarness()
    const def = forms.saveDraft('purchase-order', 1, makeBundle('a'))
    assert.ok(def.updatedAt)
    assert.equal(Number.isNaN(Date.parse(def.updatedAt)), false)
  })

  it('覆盖 draft 时 updatedAt 不早于前一次', () => {
    const { forms } = createHarness()
    const first = forms.saveDraft('purchase-order', 1, makeBundle('a'))
    const second = forms.saveDraft('purchase-order', 1, makeBundle('b'))
    assert.ok(Date.parse(second.updatedAt) >= Date.parse(first.updatedAt))
  })

  it('publish 后 published 带有 updatedAt', () => {
    const { forms, publish } = createHarness()
    forms.saveDraft('purchase-order', 1, makeBundle('a'))
    const published = publish.publish('purchase-order', 1)
    assert.ok(published.updatedAt)
    assert.equal(published.status, 'published')
    assert.equal(Number.isNaN(Date.parse(published.updatedAt)), false)
  })
})

describe('FormService · listFormIds / listVersionDetails', () => {
  it('空仓储 listFormIds 返回 []', () => {
    const { forms } = createHarness()
    assert.deepEqual(forms.listFormIds(), [])
  })

  it('存在 purchase-order 时 listFormIds 包含它', () => {
    const { forms } = createHarness()
    forms.saveDraft('purchase-order', 1, makeBundle('a'))
    assert.deepEqual(forms.listFormIds(), ['purchase-order'])
  })

  it('listVersionDetails 返回 version / status / updatedAt', () => {
    const { forms, publish } = createHarness()
    forms.saveDraft('purchase-order', 1, makeBundle('v1'))
    publish.publish('purchase-order', 1)
    forms.saveDraftAuto('purchase-order', makeBundle('v2'))

    const details = forms.listVersionDetails('purchase-order')
    assert.equal(details.length, 2)
    assert.equal(details[0].version, 1)
    assert.equal(details[0].status, 'published')
    assert.ok(details[0].updatedAt)
    assert.equal(details[1].version, 2)
    assert.equal(details[1].status, 'draft')
  })
})

describe('FormService · listVersions 兼容性', () => {
  it('listVersions 仍为 number[] 升序', () => {
    const { forms, publish } = createHarness()
    forms.saveDraft('purchase-order', 2, makeBundle('b'))
    publish.publish('purchase-order', 2)
    forms.saveDraft('purchase-order', 1, makeBundle('a'))
    publish.publish('purchase-order', 1)
    assert.deepEqual(forms.listVersions('purchase-order'), [1, 2])
  })
})
