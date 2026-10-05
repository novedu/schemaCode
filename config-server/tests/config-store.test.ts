import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { defaultFieldState } from '../../src/engine/field-state'
import { ConfigStore, PublishedDefinitionImmutableError } from '../config-store'
import type { FormDefinition, FormBundle } from '../types'

/** 构造最小可用 Bundle（内容是核心 Schema/Rule/Permission 原生形状） */
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

function makeDefinition(
  formId: string,
  version: number,
  status: 'draft' | 'published',
  label = '报销金额',
): FormDefinition {
  return { formId, version, status, ...makeBundle(label) }
}

describe('ConfigStore · 保存与读取', () => {
  it('save → get 往返一致', () => {
    const store = new ConfigStore()
    const def = makeDefinition('purchase-order', 1, 'draft')

    store.save(def)
    assert.deepEqual(store.get('purchase-order', 1), def)
    assert.equal(store.size(), 1)
  })

  it('不存在的配置返回 undefined（不抛模糊错误）', () => {
    const store = new ConfigStore()
    assert.equal(store.get('missing', 9), undefined)
  })
})

describe('ConfigStore · formId+version 唯一 / 重复保存', () => {
  it('draft 重复保存：覆盖更新，不产生第二条记录', () => {
    const store = new ConfigStore()
    store.save(makeDefinition('purchase-order', 1, 'draft', '旧标题'))
    store.save(makeDefinition('purchase-order', 1, 'draft', '新标题'))

    assert.equal(store.size(), 1)
    assert.equal(store.get('purchase-order', 1)?.schema.fields[0].label, '新标题')
  })

  it('published 记录不可覆盖：抛明确错误，记录保持原样', () => {
    const store = new ConfigStore()
    store.save(makeDefinition('purchase-order', 1, 'published'))

    assert.throws(
      () => store.save(makeDefinition('purchase-order', 1, 'published', '被篡改')),
      PublishedDefinitionImmutableError,
    )
    assert.equal(store.get('purchase-order', 1)?.schema.fields[0].label, '报销金额')
  })
})

describe('ConfigStore · Draft / Published 读取隔离', () => {
  it('getDraft 只返回 draft；getPublished 只返回 published', () => {
    const store = new ConfigStore()

    store.save(makeDefinition('f', 1, 'draft'))
    assert.ok(store.getDraft('f', 1))
    assert.equal(store.getPublished('f', 1), undefined)

    // 另一个 formId 放 published
    store.save(makeDefinition('g', 2, 'published'))
    assert.ok(store.getPublished('g', 2))
    assert.equal(store.getDraft('g', 2), undefined)
  })
})

describe('ConfigStore · 版本列举', () => {
  it('listVersions 只返回该 formId 的版本号，升序', () => {
    const store = new ConfigStore()
    store.save(makeDefinition('purchase-order', 3, 'draft'))
    store.save(makeDefinition('purchase-order', 1, 'published'))
    store.save(makeDefinition('purchase-order', 2, 'draft'))
    store.save(makeDefinition('other-form', 1, 'draft'))

    assert.deepEqual(store.listVersions('purchase-order'), [1, 2, 3])
    assert.deepEqual(store.listVersions('other-form'), [1])
    assert.deepEqual(store.listVersions('nobody'), [])
  })
})

describe('ConfigStore · 序列化边界', () => {
  it('返回对象被外部修改不影响仓储（模拟网络边界）', () => {
    const store = new ConfigStore()
    store.save(makeDefinition('purchase-order', 1, 'draft'))

    const out = store.get('purchase-order', 1)!
    out.schema.fields[0].label = '外部篡改'
    assert.equal(
      store.get('purchase-order', 1)?.schema.fields[0].label,
      '报销金额',
    )
  })
})
