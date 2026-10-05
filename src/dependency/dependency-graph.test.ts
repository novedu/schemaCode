import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { Rule } from '../types'
import { cond } from '../engine/condition-evaluator'
import { and, or } from '../engine/condition-group'
import { rules } from '../rules'
import {
  buildDependencyGraph,
  extractOutputFields,
  extractReferencedFields,
} from './dependency-graph'

describe('extractReferencedFields（递归输入字段提取）', () => {
  it('叶子条件：只引用一个字段', () => {
    assert.deepEqual(
      extractReferencedFields(cond('customerType', 'equals', 'person')),
      ['customerType'],
    )
  })

  it('嵌套 AND / OR：递归收集所有子树字段', () => {
    // customerType = company AND (registeredCapital > 1000 OR companyName 非空)
    const tree = and(
      cond('customerType', 'equals', 'company'),
      or(
        cond('registeredCapital', 'greaterThan', 1000),
        cond('companyName', 'notEmpty'),
      ),
    )
    assert.deepEqual(extractReferencedFields(tree), [
      'customerType',
      'registeredCapital',
      'companyName',
    ])
  })

  it('同一条规则中重复引用同一字段：去重且保持首次出现顺序', () => {
    const tree = or(
      cond('a', 'equals', 1),
      and(cond('a', 'notEmpty'), cond('b', 'equals', 2)),
    )
    assert.deepEqual(extractReferencedFields(tree), ['a', 'b'])
  })

  it('深层嵌套：and/or 混用超过两层也能提取', () => {
    const tree = and(
      cond('a', 'equals', 1),
      or(
        cond('b', 'equals', 2),
        and(cond('c', 'notEmpty'), or(cond('a', 'notEmpty'), cond('d', 'notEmpty'))),
      ),
    )
    assert.deepEqual(extractReferencedFields(tree), ['a', 'b', 'c', 'd'])
  })
})

describe('extractOutputFields（输出字段提取）', () => {
  it('then 只有一个目标字段', () => {
    const r: Rule = {
      name: 'R',
      when: cond('a', 'equals', 1),
      then: { companyName: { visible: false } },
    }
    assert.deepEqual(extractOutputFields(r), ['companyName'])
  })

  it('then 有多个目标字段：全部取出', () => {
    const r: Rule = {
      name: 'R',
      when: cond('a', 'equals', 1),
      then: {
        companyName: { visible: true, required: true },
        vipTag: { visible: true },
      },
    }
    assert.deepEqual(extractOutputFields(r), ['companyName', 'vipTag'])
  })
})

describe('DependencyGraph · 输入边（字段 → 读取它的规则）', () => {
  const graph = buildDependencyGraph(rules)

  it('customerType 被三条业务规则读取', () => {
    assert.deepEqual(graph.getRulesDependingOn('customerType').sort(), [
      rules[0].name,
      rules[1].name,
      rules[2].name,
    ].sort())
  })

  it('registeredCapital 只被 VIP 规则读取', () => {
    assert.deepEqual(graph.getRulesDependingOn('registeredCapital'), [
      rules[2].name,
    ])
  })

  it('companyName 作为输入只被 VIP 规则读取（规则0/1只写不读）', () => {
    assert.deepEqual(graph.getRulesDependingOn('companyName'), [
      rules[2].name,
    ])
  })

  it('vipTag 只被写入、从未被读取：不在输入索引中，但在输出索引中', () => {
    assert.deepEqual(graph.getRulesDependingOn('vipTag'), [])
    assert.ok(!graph.getAllInputFields().includes('vipTag'))
    assert.deepEqual(graph.getRulesProducingField('vipTag'), [rules[2].name])
    assert.ok(graph.getAllOutputFields().includes('vipTag'))
  })

  it('查询不存在的字段：返回空集合', () => {
    assert.deepEqual(graph.getRulesDependingOn('notExist'), [])
  })

  it('规则 → 输入字段', () => {
    assert.deepEqual(graph.getInputFieldsOfRule(rules[2].name).sort(), [
      'companyName',
      'customerType',
      'registeredCapital',
    ])
    assert.deepEqual(graph.getInputFieldsOfRule('不存在的规则'), [])
  })

  it('dependsOn：判断单条读取关系', () => {
    assert.ok(graph.dependsOn('registeredCapital', rules[2].name))
    assert.ok(!graph.dependsOn('registeredCapital', rules[0].name))
    assert.ok(!graph.dependsOn('notExist', rules[0].name))
  })

  it('自定义规则：重复字段不产生重复输入索引', () => {
    const custom: Rule[] = [
      {
        name: 'R1',
        when: or(cond('x', 'equals', 1), cond('x', 'notEmpty')),
        then: { y: { visible: true } },
      },
      {
        name: 'R2',
        when: cond('x', 'equals', 2),
        then: { z: { required: true } },
      },
    ]
    const g = buildDependencyGraph(custom)
    assert.deepEqual(g.getRulesDependingOn('x').sort(), ['R1', 'R2'])
    assert.deepEqual(g.getInputFieldsOfRule('R1'), ['x'])
  })
})

describe('DependencyGraph · 输出边（Rule → 输出字段）', () => {
  const graph = buildDependencyGraph(rules)

  it('规则0/1 写入 companyName；规则2 写入 vipTag', () => {
    assert.deepEqual(graph.getOutputFieldsOfRule(rules[0].name), ['companyName'])
    assert.deepEqual(graph.getOutputFieldsOfRule(rules[1].name), ['companyName'])
    assert.deepEqual(graph.getOutputFieldsOfRule(rules[2].name), ['vipTag'])
  })

  it('输出字段 → 写入它的规则：companyName 有两个生产者', () => {
    assert.deepEqual(graph.getRulesProducingField('companyName').sort(), [
      rules[0].name,
      rules[1].name,
    ])
  })

  it('vipTag 只有 VIP 规则一个生产者', () => {
    assert.deepEqual(graph.getRulesProducingField('vipTag'), [rules[2].name])
  })

  it('全部输出字段', () => {
    assert.deepEqual(graph.getAllOutputFields().sort(), ['companyName', 'vipTag'])
  })

  it('查询不存在的规则/字段：返回空集合', () => {
    assert.deepEqual(graph.getOutputFieldsOfRule('不存在的规则'), [])
    assert.deepEqual(graph.getRulesProducingField('notExist'), [])
  })

  it('同一字段可在不同规则中分别作为输入和输出：两套索引独立', () => {
    // companyName：规则0/1 写入它（输出），规则2 读取它（输入）
    assert.deepEqual(graph.getRulesProducingField('companyName').sort(), [
      rules[0].name,
      rules[1].name,
    ])
    assert.deepEqual(graph.getRulesDependingOn('companyName'), [rules[2].name])
  })

  it('同一规则内：一个字段可同时是输入与输出（自引用）', () => {
    const custom: Rule[] = [
      {
        name: 'self',
        when: cond('x', 'notEmpty'),
        then: { x: { required: true } },
      },
    ]
    const g = buildDependencyGraph(custom)
    assert.deepEqual(g.getInputFieldsOfRule('self'), ['x'])
    assert.deepEqual(g.getOutputFieldsOfRule('self'), ['x'])
    assert.deepEqual(g.getRulesDependingOn('x'), ['self'])
    assert.deepEqual(g.getRulesProducingField('x'), ['self'])
  })
})
