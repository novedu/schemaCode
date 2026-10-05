import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { FormData, Rule, Schema } from '@runtime-core/types'
import { runRuleEngine } from '@runtime-core/engine/form-engine'
import {
  createGroup,
  createLeaf,
  createRuleDoc,
  type RuleDoc,
  upsertAction,
} from '../rule-model'
import {
  buildRule,
  buildRules,
  fromCoreRule,
  validateRuleDoc,
} from '../rule-builder'

/* ── 联调场景夹具 ── */

/** 客户类型 + 公司名称的 Schema（与 demo-app 加载的 schema.json 同构） */
const scenarioSchema: Schema = {
  fields: [
    {
      name: 'customerType',
      label: '客户类型',
      type: 'select',
      options: [
        { label: '个人', value: 'person' },
        { label: '公司', value: 'company' },
      ],
      initialState: {
        visible: true,
        required: true,
        disabled: false,
        readonly: false,
        editable: true,
        warnings: [],
      },
    },
    {
      name: 'companyName',
      label: '公司名称',
      type: 'text',
      initialState: {
        visible: true,
        required: false,
        disabled: false,
        readonly: false,
        editable: true,
        warnings: [],
      },
    },
  ],
}

/** 规则文档 1：个人客户 → 公司名称隐藏且不必填 */
function personRule(): RuleDoc {
  const doc = createRuleDoc('个人客户：公司名称隐藏，且不必填')
  doc.when = createGroup('and', [createLeaf('customerType', 'equals', 'person')])
  doc.then = upsertAction({}, 'companyName', { visible: false, required: false })
  return doc
}

/** 规则文档 2：公司客户 → 公司名称显示且必填 */
function companyRule(): RuleDoc {
  const doc = createRuleDoc('公司客户：公司名称显示，且必填')
  doc.when = createGroup('and', [createLeaf('customerType', 'equals', 'company')])
  doc.then = upsertAction({}, 'companyName', { visible: true, required: true })
  return doc
}

function dataWith(customerType: string): FormData {
  return { customerType } as unknown as FormData
}

describe('rule-builder · Rule JSON 结构一致性', () => {
  it('buildRule 产物就是核心 Rule 原生四字段', () => {
    const rule = buildRule(companyRule())

    assert.equal(typeof rule.name, 'string')
    assert.equal(rule.priority, 10)
    assert.equal(rule.when.kind, 'group')
    assert.deepEqual(rule.then, {
      companyName: { visible: true, required: true },
    })
  })

  it('经 JSON 序列化往返（模拟导出文件再加载）结构不变', () => {
    const rules = buildRules([personRule(), companyRule()])
    const reloaded = JSON.parse(JSON.stringify(rules)) as Rule[]

    assert.equal(reloaded.length, 2)
    assert.deepEqual(reloaded[1].then, rules[1].then)
  })
})

describe('rule-builder · demo-app 加载执行验证（核心 RuleEngine 直接执行产物）', () => {
  const rules: Rule[] = JSON.parse(
    JSON.stringify(buildRules([personRule(), companyRule()])),
  ) as Rule[]

  it('customerType=person：companyName 隐藏、不必填，仅个人规则命中', () => {
    const result = runRuleEngine(scenarioSchema, dataWith('person'), rules)

    assert.equal(result.fieldStates.companyName.visible, false)
    assert.equal(result.fieldStates.companyName.required, false)
    assert.deepEqual(result.firedRules, ['个人客户：公司名称隐藏，且不必填'])
  })

  it('customerType=company：companyName 显示、必填', () => {
    const result = runRuleEngine(scenarioSchema, dataWith('company'), rules)

    assert.equal(result.fieldStates.companyName.visible, true)
    assert.equal(result.fieldStates.companyName.required, true)
    assert.deepEqual(result.firedRules, ['公司客户：公司名称显示，且必填'])
  })

  it('切换 customerType 结论随之翻转（动态行为闭环）', () => {
    const first = runRuleEngine(scenarioSchema, dataWith('person'), rules)
    const then = runRuleEngine(scenarioSchema, dataWith('company'), rules)

    assert.notEqual(
      first.fieldStates.companyName.visible,
      then.fieldStates.companyName.visible,
    )
  })
})

describe('rule-builder · 导出前校验', () => {
  it('完整规则通过校验', () => {
    assert.equal(validateRuleDoc(companyRule()).valid, true)
  })

  it('字段为空 / 动作为空 / 空组 被拦截', () => {
    const noField = createRuleDoc()
    noField.then = upsertAction({}, 'companyName', { visible: true })

    const noAction = createRuleDoc()
    noAction.when = createGroup('and', [createLeaf('customerType', 'equals', 'x')])

    const emptyGroup = createRuleDoc()
    emptyGroup.when = createGroup('and', [createGroup('or')])
    emptyGroup.then = upsertAction({}, 'companyName', { visible: true })

    assert.equal(validateRuleDoc(noField).valid, false)
    assert.equal(validateRuleDoc(noAction).valid, false)
    assert.equal(validateRuleDoc(emptyGroup).valid, false)
  })
})

describe('rule-builder · 反向解析（导入规则继续设计）', () => {
  it('核心 Rule → RuleDoc：名称/优先级/条件/动作保持', () => {
    const original = companyRule()
    const rule = buildRule(original)
    const doc = fromCoreRule(rule)

    assert.equal(doc.name, original.name)
    assert.equal(doc.priority, 10)
    assert.equal(doc.when.kind, 'group')
    assert.deepEqual(doc.then.companyName, { visible: true, required: true })
  })
})
