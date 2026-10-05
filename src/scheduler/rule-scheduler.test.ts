import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { FieldState, FormData, Rule, Schema } from '../types'
import { cond } from '../engine/condition-evaluator'
import { defaultFieldState } from '../engine/field-state'
import { runRuleEngine } from '../engine/form-engine'
import { schema } from '../schema'
import { rules } from '../rules'
import { RuleScheduler } from './rule-scheduler'

const datasets: { name: string; data: FormData }[] = [
  { name: 'person/空名称/资本0', data: { customerType: 'person', companyName: '', registeredCapital: 0, amount: 0, approveComment: '' } },
  { name: 'company/空名称/资本0', data: { customerType: 'company', companyName: '', registeredCapital: 0, amount: 0, approveComment: '' } },
  { name: 'company/有名称/资本500', data: { customerType: 'company', companyName: '某某科技有限公司', registeredCapital: 500, amount: 0, approveComment: '' } },
  { name: 'company/空名称/资本2000', data: { customerType: 'company', companyName: '', registeredCapital: 2000, amount: 0, approveComment: '' } },
]

describe('RuleScheduler · 引导启动（无 changedFields → 全部输入字段做种子）', () => {
  it('不动点结论与线性全量引擎一致（4 组数据）', () => {
    for (const { data } of datasets) {
      const scheduler = new RuleScheduler(schema, rules)
      const result = scheduler.schedule(data)
      const expected = runRuleEngine(schema, data, rules).fieldStates
      assert.deepEqual(result.fieldStates, expected)
    }
  })

  it('首条轨迹：出队 customerType，个人场景下 companyName 变化并入队', () => {
    const scheduler = new RuleScheduler(schema, rules)
    const result = scheduler.schedule(datasets[0].data)

    const first = result.trace[0]
    assert.equal(first.dequeued, 'customerType')
    assert.deepEqual(first.firedRules, [rules[0].name])
    assert.deepEqual(first.changedFields, ['companyName'])
    assert.deepEqual(first.enqueuedFields, ['companyName'])
  })

  it('跨层传播：company + 已填名称 → vipTag 经规则2变为可见', () => {
    const scheduler = new RuleScheduler(schema, rules)
    const result = scheduler.schedule(datasets[2].data)
    assert.equal(result.fieldStates.vipTag.visible, true)
    // 存在使 vipTag 变化的轨迹
    assert.ok(result.trace.some((t) => t.changedFields.includes('vipTag')))
  })

  it('队列最终清空（到达不动点）', () => {
    const scheduler = new RuleScheduler(schema, rules)
    const result = scheduler.schedule(datasets[3].data)
    // 轨迹处理完后没有遗留：最后仍能再次调度且无状态变化
    const again = scheduler.schedule(datasets[3].data, ['customerType'])
    assert.ok(again.trace.every((t) => t.changedFields.length === 0))
  })
})

describe('RuleScheduler · 增量调度（只传变化字段）', () => {
  it('person → company：只入队 customerType，变化沿图传播，最终状态正确', () => {
    const scheduler = new RuleScheduler(schema, rules)
    scheduler.schedule(datasets[0].data) // 先引导到 person 状态

    const result = scheduler.schedule(datasets[2].data, ['customerType'])
    assert.equal(result.fieldStates.companyName.visible, true)
    assert.equal(result.fieldStates.companyName.required, true)
    assert.equal(result.fieldStates.vipTag.visible, true)

    // 第一条轨迹就是 customerType；companyName 与 vipTag 是被传播出来的
    assert.equal(result.trace[0].dequeued, 'customerType')
    assert.ok(result.trace.some((t) => t.dequeued === 'companyName'))
    assert.ok(result.trace.some((t) => t.changedFields.includes('vipTag')))
  })

  it('变化未引起状态改变时：不传播、不入队', () => {
    const scheduler = new RuleScheduler(schema, rules)
    scheduler.schedule(datasets[2].data)

    const result = scheduler.schedule(datasets[2].data, ['registeredCapital'])
    assert.ok(result.trace.every((t) => t.enqueuedFields.length === 0))
  })

  it('未知字段：正常处理为空轨迹，不报错', () => {
    const scheduler = new RuleScheduler(schema, rules)
    const result = scheduler.schedule(datasets[0].data, ['notExist'])
    assert.equal(result.trace.length, 1)
    assert.deepEqual(result.trace[0].candidateRules, [])
  })
})

describe('RuleScheduler · 优先级 / 去重 / 收敛', () => {
  it('同一字段的多个依赖规则按 priority 升序触发，高优先级最终胜出', () => {
    const custom: Rule[] = [
      { name: 'low', priority: 1, when: cond('f', 'equals', 1), then: { x: { visible: true } } },
      { name: 'high', priority: 10, when: cond('f', 'equals', 1), then: { x: { visible: false } } },
    ]
    const scheduler = new RuleScheduler(schemaWith(['f', 'x']), custom)
    const result = scheduler.schedule({ f: 1 } as unknown as FormData, ['f'])
    assert.deepEqual(result.trace[0].firedRules, ['low', 'high'])
    assert.equal(result.fieldStates.x.visible, false)
  })

  it('输出字段只在首次真实变化时入队一次（队列去重）', () => {
    const scheduler = new RuleScheduler(schema, rules)
    const result = scheduler.schedule(datasets[0].data)
    const enqueued = result.trace.flatMap((t) => t.enqueuedFields)
    const counts = enqueued.reduce<Record<string, number>>((acc, f) => {
      acc[f] = (acc[f] ?? 0) + 1
      return acc
    }, {})
    assert.equal(counts.companyName, 1)
  })

  it('规则写入与现状相同的值：不产生变化、不入队', () => {
    const custom: Rule[] = [
      { name: 'r', when: cond('f', 'equals', 1), then: { x: { visible: true } } },
    ]
    const scheduler = new RuleScheduler(schemaWith(['f', 'x'], { x: { visible: true, required: false } }), custom)
    const result = scheduler.schedule({ f: 1 } as unknown as FormData, ['f'])
    assert.deepEqual(result.trace[0].changedFields, [])
    assert.deepEqual(result.trace[0].enqueuedFields, [])
  })

  it('含环但可收敛的规则图：调度正常终止', () => {
    // R1: f=1 → x 隐藏；R2: g=1 → f 隐藏；互相形成环，但每轮 patch 相同，迅速收敛
    const custom: Rule[] = [
      { name: 'R1', when: cond('f', 'equals', 1), then: { g: { visible: false } } },
      { name: 'R2', when: cond('g', 'equals', 1), then: { f: { visible: false } } },
    ]
    const scheduler = new RuleScheduler(
      schemaWith(['f', 'g'], {
        f: { visible: true, required: false },
        g: { visible: true, required: false },
      }),
      custom,
    )
    const result = scheduler.schedule({ f: 1, g: 1 } as unknown as FormData, ['f'])
    assert.equal(result.fieldStates.f.visible, false)
    assert.equal(result.fieldStates.g.visible, false)
  })
})

/* ── 测试辅助 ── */

/** 用最小字段集构造一张 Schema（状态经工厂补齐扩展后的默认键） */
function schemaWith(
  names: string[],
  overrides: Record<string, Partial<FieldState>> = {},
): Schema {
  return {
    fields: names.map((name) => ({
      name,
      label: name,
      type: 'text' as const,
      initialState: defaultFieldState(overrides[name]),
    })),
  }
}
