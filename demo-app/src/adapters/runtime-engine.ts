import type {
  FieldState,
  FormData,
  Rule,
  RuntimeContext,
  Schema,
  StatePatchMap,
} from '@runtime-core/types'
import {
  resolveFieldStates,
  type FieldDecisionTrace,
} from '@runtime-core/state-resolution/field-state-resolver'
import { provideSchemaState } from '@runtime-core/state-resolution/schema-state-provider'
import { provideRuleState } from '@runtime-core/state-resolution/rule-state-provider'
import { provideBpmState } from '@runtime-core/state-resolution/bpm-state-provider'
import { providePermissionState } from '@runtime-core/state-resolution/permission-state-provider'
import { evaluateNode } from '@runtime-core/engine/condition-group'
import { toContextFacts } from '@runtime-core/runtime/runtime-context'
import { buildDependencyGraph } from '@runtime-core/dependency/dependency-graph'

/**
 * DependencyGraph 的公共查询面（应用侧只依赖这组方法）。
 *
 * 不直接用核心类做 store 字段类型：Vue 的 reactive 会把类实例
 * 展开为结构类型，与带私有字段的类身份不兼容。公共接口
 * 由核心类结构性满足，两者皆可赋值。
 */
export interface DependencyGraphApi {
  getRulesDependingOn(field: string): string[]
  getInputFieldsOfRule(ruleName: string): string[]
  getAllInputFields(): string[]
  getOutputFieldsOfRule(ruleName: string): string[]
  getRulesProducingField(field: string): string[]
  getAllOutputFields(): string[]
  dependsOn(field: string, ruleName: string): boolean
}

/**
 * Runtime Engine Facade（应用侧运行时门面）
 *
 * Demo App 不自己拼规则、不自己合并状态，所有字段状态由这个门面
 * 驱动 Runtime Core 的真实能力得到：
 *
 *   SchemaStateProvider + RuleStateProvider + BpmStateProvider
 *   + PermissionStateProvider → StateResolver（Permission>BPM>Rule>Schema）
 *
 * 额外产出：
 *   - DependencyGraph：由核心依赖图模块构建；
 *   - RuleTrace：用核心条件求值器 evaluateNode 逐条判定规则是否命中，
 *     不是重新实现引擎，只是复用其叶子求值做可视化。
 */

export interface RuleTraceEntry {
  name: string
  fired: boolean
}

export interface RuntimeComputation {
  fieldStates: Record<string, FieldState>
  traces: FieldDecisionTrace[]
  graph: DependencyGraphApi
  ruleTrace: RuleTraceEntry[]
}

export function computeFormRuntime(
  schema: Schema,
  data: FormData,
  context: RuntimeContext,
  rules: Rule[],
  options: {
    /** 应用侧节点策略扩展（如 finance_approve），合并进 BPM 来源，不改变优先级 */
    appNodePatches?: StatePatchMap
  } = {},
): RuntimeComputation {
  /* ① 四个来源（应用扩展只并入 bpm 来源，同一层级同一优先级） */
  const bpmPatches = mergePatchMaps(provideBpmState(context), options.appNodePatches ?? {})

  const sources = [
    { name: 'schema' as const, patches: provideSchemaState(schema) },
    { name: 'rule' as const, patches: provideRuleState(rules, data, context) },
    { name: 'bpm' as const, patches: bpmPatches },
    { name: 'permission' as const, patches: providePermissionState(context) },
  ]

  /* ② 核心 State Resolution Engine 裁决 */
  const { fieldStates, traces } = resolveFieldStates(schema, sources, { trace: true })

  /* ③ 核心 DependencyGraph */
  const graph = buildDependencyGraph(rules)

  /* ④ 规则命中轨迹（复用核心 evaluateNode） */
  const facts: Record<string, unknown> = {
    ...(data as unknown as Record<string, unknown>),
    ...toContextFacts(context),
  }
  const ruleTrace: RuleTraceEntry[] = rules.map((rule) => ({
    name: rule.name,
    fired: evaluateNode(rule.when, facts),
  }))

  return { fieldStates, traces, graph, ruleTrace }
}

/** 合并两张补丁表：普通键后者覆盖，warnings 拼接去重 */
function mergePatchMaps(a: StatePatchMap, b: StatePatchMap): StatePatchMap {
  const result: StatePatchMap = { ...a }

  for (const [field, patch] of Object.entries(b)) {
    const existing = result[field] ?? {}
    result[field] = { ...existing, ...patch }
    if (existing.warnings || patch.warnings) {
      result[field].warnings = [...new Set([...(existing.warnings ?? []), ...(patch.warnings ?? [])])]
    }
  }

  return result
}
