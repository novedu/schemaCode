import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { defaultFieldState } from '../../src/engine/field-state'
import type { Schema, Rule, ConditionNode } from '../../src/types'
import type { PermissionConfig, FormBundle } from '../types'
import {
  validateSchema,
  validateRules,
  validatePermissions,
} from '../../src/validation'
import { ConfigStore } from '../config-store'
import { FormService } from '../form-service'
import { PublishService, PublishValidationError } from '../publish-service'

/* ── 夹具 ── */

function fieldSchema(name: string, opts?: { component?: string }): Schema['fields'][number] {
  return {
    name,
    label: name,
    type: 'text',
    component: opts?.component,
    initialState: defaultFieldState(),
  }
}

function bundle(overrides?: Partial<FormBundle>): FormBundle {
  return {
    schema: { fields: [fieldSchema('customerName'), fieldSchema('amount')] },
    rules: [],
    permissions: { version: 1, roles: [], entries: [] },
    ...overrides,
  }
}

function condition(field: string): ConditionNode {
  return { kind: 'condition', field, operator: 'equals', value: 'x' }
}

/* ── Test 1：duplicate field id → error ── */

describe('Schema Validation · Test 1 Duplicate Field ID', () => {
  it('重复字段名报 DUPLICATE_FIELD_ID error', () => {
    const schema: Schema = {
      fields: [
        fieldSchema('amount'),
        fieldSchema('amount'),
      ],
    }
    const result = validateSchema(schema)
    const errors = result.filter((r) => r.severity === 'error')

    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'DUPLICATE_FIELD_ID')
    assert.ok(errors[0].message.includes('amount'))
  })
})

/* ── Test 2：unknown component → error ── */

describe('Schema Validation · Test 2 Unknown Component', () => {
  it('未注册组件报 UNKNOWN_COMPONENT error', () => {
    const schema: Schema = {
      fields: [fieldSchema('amount', { component: 'UnknownWidget' })],
    }
    const result = validateSchema(schema)
    const errors = result.filter((r) => r.severity === 'error')

    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'UNKNOWN_COMPONENT')
    assert.ok(errors[0].message.includes('UnknownWidget'))
  })
})

/* ── Test 3：valid schema → pass ── */

describe('Schema Validation · Test 3 Valid Schema', () => {
  it('合法 Schema 无 error', () => {
    const schema: Schema = {
      fields: [fieldSchema('amount')],
    }
    const result = validateSchema(schema)
    assert.equal(result.length, 0)
  })
})

/* ── Test 4：layout unknown field → error ── */

describe('Schema Validation · Test 4 Layout Unknown Field', () => {
  it('layout 引用了不存在的字段报 LAYOUT_UNKNOWN_FIELD', () => {
    const schema: Schema = {
      fields: [fieldSchema('amount')],
      layout: [
        { kind: 'field', field: 'nonExistent' } as any,
      ],
    }
    const result = validateSchema(schema)
    const errors = result.filter((r) => r.severity === 'error')

    assert.ok(errors.some((e) => e.code === 'LAYOUT_UNKNOWN_FIELD'))
  })
})

/* ── Test 5：duplicate layout field → error ── */

describe('Schema Validation · Test 5 Duplicate Layout Field', () => {
  it('layout 中字段重复出现报 DUPLICATE_LAYOUT_FIELD', () => {
    const schema: Schema = {
      fields: [fieldSchema('amount')],
      layout: [
        { kind: 'field', field: 'amount' },
        { kind: 'field', field: 'amount' },
      ],
    }
    const result = validateSchema(schema)
    const errors = result.filter((r) => r.severity === 'error')

    assert.ok(errors.some((e) => e.code === 'DUPLICATE_LAYOUT_FIELD'))
  })
})

/* ── Test 6：invalid Grid/Column hierarchy → error ── */

describe('Schema Validation · Test 6 Invalid Grid Hierarchy', () => {
  it('Grid Column 中嵌套非 Field 报 INVALID_LAYOUT_HIERARCHY', () => {
    const schema: Schema = {
      fields: [fieldSchema('amount')],
      layout: [
        {
          kind: 'grid',
          label: '栅格',
          columns: [
            {
              children: [
                { kind: 'container', label: '非法', children: [] } as any,
              ],
            },
          ],
        },
      ],
    }
    const result = validateSchema(schema)
    const errors = result.filter((r) => r.severity === 'error')

    assert.ok(errors.some((e) => e.code === 'INVALID_LAYOUT_HIERARCHY'))
  })
})

/* ── Test 7：valid rule references → pass ── */

describe('Rule Validation · Test 7 Valid Rule', () => {
  it('合法 Rule 无 error', () => {
    const schema: Schema = { fields: [fieldSchema('amount')] }
    const rules: Rule[] = [
      { name: 'R1', when: condition('amount'), then: { amount: { visible: true } } },
    ]
    const result = validateRules(schema, rules)
    assert.equal(result.length, 0)
  })
})

/* ── Test 8：unknown condition field → error ── */

describe('Rule Validation · Test 8 Unknown Condition Field', () => {
  it('条件引用了不存在字段报 RULE_UNKNOWN_INPUT_FIELD', () => {
    const schema: Schema = { fields: [fieldSchema('amount')] }
    const rules: Rule[] = [
      { name: 'R1', when: condition('nonExistent'), then: {} },
    ]
    const result = validateRules(schema, rules)
    const errors = result.filter((r) => r.severity === 'error')

    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'RULE_UNKNOWN_INPUT_FIELD')
  })
})

/* ── Test 9：nested condition unknown field → error ── */

describe('Rule Validation · Test 9 Nested Condition Unknown Field', () => {
  it('嵌套条件树中引用了不存在字段报 RULE_UNKNOWN_INPUT_FIELD', () => {
    const schema: Schema = { fields: [fieldSchema('amount')] }
    const rules: Rule[] = [
      {
        name: 'R1',
        when: {
          kind: 'group',
          combinator: 'and',
          children: [
            condition('amount'),
            {
              kind: 'group',
              combinator: 'or',
              children: [
                condition('nonExistent'),
              ],
            },
          ],
        },
        then: {},
      },
    ]
    const result = validateRules(schema, rules)
    const errors = result.filter((r) => r.severity === 'error')

    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'RULE_UNKNOWN_INPUT_FIELD')
  })
})

/* ── Test 10：unknown output field → error ── */

describe('Rule Validation · Test 10 Unknown Output Field', () => {
  it('输出引用了不存在字段报 RULE_UNKNOWN_OUTPUT_FIELD', () => {
    const schema: Schema = { fields: [fieldSchema('amount')] }
    const rules: Rule[] = [
      { name: 'R1', when: condition('amount'), then: { nonExistent: { visible: true } } },
    ]
    const result = validateRules(schema, rules)
    const errors = result.filter((r) => r.severity === 'error')

    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'RULE_UNKNOWN_OUTPUT_FIELD')
  })
})

/* ── Test 11：valid permission → pass ── */

describe('Permission Validation · Test 11 Valid Permission', () => {
  it('合法 Permission 无 error', () => {
    const schema: Schema = { fields: [fieldSchema('amount')] }
    const perms: PermissionConfig = {
      version: 1,
      roles: ['employee'],
      entries: [{ field: 'amount', role: 'employee', patch: { editable: true } }],
    }
    const result = validatePermissions(schema, perms)
    assert.equal(result.length, 0)
  })
})

/* ── Test 12：unknown permission field → error ── */

describe('Permission Validation · Test 12 Unknown Permission Field', () => {
  it('权限引用了不存在字段报 PERMISSION_UNKNOWN_FIELD', () => {
    const schema: Schema = { fields: [fieldSchema('amount')] }
    const perms: PermissionConfig = {
      version: 1,
      roles: ['employee'],
      entries: [{ field: 'nonExistent', role: 'employee', patch: { editable: true } }],
    }
    const result = validatePermissions(schema, perms)
    const errors = result.filter((r) => r.severity === 'error')

    assert.equal(errors.length, 1)
    assert.equal(errors[0].code, 'PERMISSION_UNKNOWN_FIELD')
  })
})

/* ── Test 13：valid draft → publish success ── */

describe('PublishService · Test 13 Valid Draft → Publish Success', () => {
  it('合法配置可以发布', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publishService = new PublishService(forms, store)

    const b = bundle()
    forms.saveDraftAuto('po', b)

    const def = publishService.publish('po', 1)
    assert.equal(def.status, 'published')
  })
})

/* ── Test 14：invalid draft → publish rejected ── */

describe('PublishService · Test 14 Invalid Draft → Publish Rejected', () => {
  it('非法配置发布时抛 PublishValidationError', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publishService = new PublishService(forms, store)

    // 字段重复 → 校验失败
    const b = bundle({
      schema: { fields: [fieldSchema('amount'), fieldSchema('amount')] },
    })
    forms.saveDraftAuto('po', b)

    assert.throws(() => publishService.publish('po', 1), PublishValidationError)
  })
})

/* ── Test 15：failed publish keeps draft ── */

describe('PublishService · Test 15 Failed Publish Keeps Draft', () => {
  it('发布失败后 draft 保留', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publishService = new PublishService(forms, store)

    const b = bundle({
      schema: { fields: [fieldSchema('amount'), fieldSchema('amount')] },
    })
    forms.saveDraftAuto('po', b)

    try {
      publishService.publish('po', 1)
      assert.fail('应该抛 PublishValidationError')
    } catch (e) {
      assert.ok(e instanceof PublishValidationError)
    }

    // draft 仍然存在
    const draft = forms.getDraft('po', 1)
    assert.ok(draft)
    assert.equal(draft.status, 'draft')
  })
})

/* ── Test 16：failed publish does not modify published version ── */

describe('PublishService · Test 16 Failed Publish Does Not Modify Published', () => {
  it('v6 published + v7 draft 失败 → v6 仍 published', () => {
    const store = new ConfigStore()
    const forms = new FormService(store)
    const publishService = new PublishService(forms, store)

    // v1 先发布成功
    const b1 = bundle()
    forms.saveDraft('po', 1, b1)
    publishService.publish('po', 1)
    assert.equal(forms.getPublished('po', 1)?.status, 'published')

    // v2 draft 非法（字段重复）→ 发布失败
    const b2 = bundle({
      schema: { fields: [fieldSchema('amount'), fieldSchema('amount')] },
    })
    forms.saveDraft('po', 2, b2)

    try {
      publishService.publish('po', 2)
      assert.fail('应该抛 PublishValidationError')
    } catch (e) {
      assert.ok(e instanceof PublishValidationError)
    }

    // v1 仍 published
    assert.equal(forms.getPublished('po', 1)?.status, 'published')
    // v2 仍 draft
    assert.equal(forms.getDraft('po', 2)?.status, 'draft')
  })
})
