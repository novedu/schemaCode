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

describe('FormService · 保存草稿', () => {
  it('saveDraft：Bundle 被装配成 status=draft 的 FormDefinition', () => {
    const { forms } = createHarness()
    const def = forms.saveDraft('purchase-order', 1, makeBundle('报销金额'))

    assert.equal(def.formId, 'purchase-order')
    assert.equal(def.version, 1)
    assert.equal(def.status, 'draft')
  })

  it('草稿可反复保存覆盖；Runtime 的 getPublished 拿不到草稿', () => {
    const { forms } = createHarness()
    forms.saveDraft('purchase-order', 1, makeBundle('旧'))
    forms.saveDraft('purchase-order', 1, makeBundle('新'))

    assert.equal(forms.getDraft('purchase-order', 1)?.schema.fields[0].label, '新')
    assert.equal(forms.getPublished('purchase-order', 1), undefined)
  })
})

describe('FormService · saveDraftAuto 自动版本', () => {
  it('空表单首次保存 → v1；再次保存仍覆盖 v1 草稿', () => {
    const { forms } = createHarness()

    const first = forms.saveDraftAuto('purchase-order', makeBundle('a'))
    assert.equal(first.version, 1)

    const second = forms.saveDraftAuto('purchase-order', makeBundle('b'))
    assert.equal(second.version, 1)
    assert.deepEqual(forms.listVersions('purchase-order'), [1])
  })

  it('v1 发布后再保存 → 自动产生 v2，不动 v1', () => {
    const { forms, publish } = createHarness()

    forms.saveDraftAuto('purchase-order', makeBundle('v1 内容'))
    publish.publish('purchase-order', 1)

    const v2 = forms.saveDraftAuto('purchase-order', makeBundle('v2 内容'))
    assert.equal(v2.version, 2)

    assert.equal(
      forms.getPublished('purchase-order', 1)?.schema.fields[0].label,
      'v1 内容',
    )
    assert.equal(forms.getDraft('purchase-order', 2)?.schema.fields[0].label, 'v2 内容')
  })
})

describe('FormService · Runtime 读取', () => {
  it('getLatestPublished 忽略 draft，选择版本号最大的 published', () => {
    const { forms, publish } = createHarness()

    assert.equal(forms.getLatestPublished('purchase-order'), undefined)

    forms.saveDraft('purchase-order', 1, makeBundle('v1'))
    publish.publish('purchase-order', 1)
    forms.saveDraft('purchase-order', 2, makeBundle('v2 草稿'))

    // v2 还是 draft：最新发布仍是 v1
    assert.equal(forms.getLatestPublished('purchase-order')?.version, 1)

    publish.publish('purchase-order', 2)
    assert.equal(forms.getLatestPublished('purchase-order')?.version, 2)
  })
})
