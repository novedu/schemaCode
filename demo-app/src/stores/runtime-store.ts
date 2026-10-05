import { reactive, computed } from 'vue'
import type {
  FieldState,
  FormData,
  RuntimeContext,
  Schema,
} from '@runtime-core/types'
import type { FieldDecisionTrace } from '@runtime-core/state-resolution/field-state-resolver'
import { purchaseSchema, purchaseRules } from '@/mock/schema'
import { initialPurchaseData } from '@/mock/form-data'
import { bpmNodePresets, createNodeContext } from '@/mock/runtime-context'
import {
  computeFormRuntime,
  type DependencyGraphApi,
  type RuleTraceEntry,
} from '@/adapters/runtime-engine'

/**
 * 全局 Runtime Store
 *
 * 单一数据源：当前 Schema / FormData / RuntimeContext，
 * 以及由核心引擎推导出的 FieldState / 依赖图 / 规则轨迹。
 *
 * 任何交互（改字段、切节点）都走 recompute()，
 * 页面从不自己维护字段状态。
 */

/** 应用侧节点策略扩展：finance_approve 节点，核心 BPM 表之外的应用策略 */
const appNodePolicies = {
  finance_approve: {
    amount: { readonly: true, editable: false },
  },
} as const

interface RuntimeStoreState {
  schema: Schema
  data: FormData
  context: RuntimeContext
  fieldStates: Record<string, FieldState>
  traces: FieldDecisionTrace[]
  graph: DependencyGraphApi | null
  ruleTrace: RuleTraceEntry[]
  nodeLabel: string
  debugVisible: boolean
  debugTab: string
}

const state = reactive<RuntimeStoreState>({
  schema: purchaseSchema,
  data: structuredClone(initialPurchaseData),
  context: createNodeContext(bpmNodePresets[1]), // 默认经理审批视角
  fieldStates: {},
  traces: [],
  graph: null,
  ruleTrace: [],
  nodeLabel: bpmNodePresets[1].label,
  debugVisible: false,
  debugTab: 'data',
})

/** 用核心引擎重算全部派生状态 */
function recompute(): void {
  const result = computeFormRuntime(
    state.schema,
    state.data,
    state.context,
    purchaseRules,
    { appNodePatches: appNodePolicies[state.context.task.node as keyof typeof appNodePolicies] },
  )
  state.fieldStates = result.fieldStates
  state.traces = result.traces
  state.graph = result.graph
  state.ruleTrace = result.ruleTrace
}

/* ── 动作 ── */

function updateField(field: string, value: unknown): void {
  (state.data as unknown as Record<string, unknown>)[field] = value
  recompute()
}

function switchNode(nodeId: string): void {
  const preset = bpmNodePresets.find((p) => p.node === nodeId)
  if (!preset) return
  state.context = createNodeContext(preset)
  state.nodeLabel = preset.label
  recompute()
}

function resetData(): void {
  state.data = structuredClone(initialPurchaseData)
  recompute()
}

function toggleDebug(visible?: boolean): void {
  state.debugVisible = visible ?? !state.debugVisible
}

/* 初始化 */
recompute()

export function useRuntimeStore() {
  return {
    state,
    recompute,
    updateField,
    switchNode,
    resetData,
    toggleDebug,
    currentNode: computed(() => state.context.task.node),
  }
}
