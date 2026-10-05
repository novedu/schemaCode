import type { FieldState, FormData, Rule, RuntimeContext, Schema } from '../types'
import { evaluateNode } from '../engine/condition-group'
import { buildDependencyGraph, type DependencyGraph } from '../dependency/dependency-graph'
import { isFieldStateChanged, mergeFieldState } from '../engine/field-state'
import { toContextFacts } from '../runtime/runtime-context'

/**
 * RuleScheduler（规则调度器）
 *
 * 把线性引擎：
 *
 *   for (rule of rules) { 求值; 合并 }
 *
 * 升级成数据驱动的增量调度（工作内存 → 模式匹配 → 传播 → 不动点）：
 *
 *   queue = changedFields
 *   while (queue 非空):
 *     field = queue.dequeue()          取出变化字段
 *     rules = graph.getRulesDependingOn(field)   沿反向索引找依赖规则
 *     按优先级依次执行这些规则
 *     for (输出字段 of 规则的 then):
 *       if (该字段状态真的变了)
 *         queue.enqueue(输出字段)       只有变化才继续传播
 *
 * 理论对应：
 *   - 反向索引来自 Dependency Graph，一次查询 O(1)，不全量扫描规则；
 *   - 只处理"受影响的规则"，即增量求值（incremental evaluation）；
 *   - 队列清空意味着再没有状态变化 —— 到达不动点（fixpoint），
 *     对无环（甚至含环但可收敛）的规则集，结论与线性全量引擎一致。
 */

/** 去重 FIFO 队列：Set 天然去重且保留插入顺序 */
class FifoQueue {
  private readonly items = new Set<string>()

  enqueue(field: string) {
    this.items.add(field)
  }

  dequeue(): string | undefined {
    const next = this.items.values().next()
    if (next.done) return undefined
    this.items.delete(next.value)
    return next.value
  }

  get size(): number {
    return this.items.size
  }
}

/** 单步调度轨迹：一个字段出队后发生了什么（用于教学/调试） */
export interface ScheduleTraceEntry {
  dequeued: string
  /** 该字段的依赖规则（候选） */
  candidateRules: string[]
  /** 真正触发的规则（按优先级顺序） */
  firedRules: string[]
  /** 状态实际发生变化的输出字段 */
  changedFields: string[]
  /** 本轮新入队的字段 */
  enqueuedFields: string[]
}

export interface SchedulerResult {
  fieldStates: Record<string, FieldState>
  /** 所有触发记录（跨轮次，同一规则可能重复出现） */
  firedRules: string[]
  trace: ScheduleTraceEntry[]
}

/** 防御性上限：理论上同一份数据下条件结论不变，状态必然收敛；超限视为配置错误 */
const MAX_STEPS = 1000

export class RuleScheduler {
  private readonly graph: DependencyGraph
  /** 持久化字段状态：增量调度时只处理变化，状态在多次 schedule 间累积 */
  private readonly fieldStates: Record<string, FieldState> = {}

  constructor(
    private readonly schema: Schema,
    private readonly rules: Rule[],
    graph?: DependencyGraph,
  ) {
    this.graph = graph ?? buildDependencyGraph(rules)
    for (const field of schema.fields) {
      this.fieldStates[field.name] = { ...field.initialState }
    }
  }

  /**
   * 执行一轮调度直到不动点。
   *
   * @param data           当前事实（调用期间视为不变）
   * @param changedFields  值/状态发生变化的字段；
   *                       省略时为"引导启动"：以全部输入字段做种子，
   *                       保证每条规则至少被求值一次
   * @param context        OA 运行时上下文（节点/角色/权限），可选；
   *                       传入后拍平为 ctx.* 事实参与条件匹配
   */
  schedule(data: FormData, changedFields?: string[], context?: RuntimeContext): SchedulerResult {
    const queue = new FifoQueue()
    const seeds = changedFields ?? this.graph.getAllInputFields()
    for (const field of seeds) queue.enqueue(field)

    const facts: Record<string, unknown> = {
      ...(data as unknown as Record<string, unknown>),
      ...(context ? toContextFacts(context) : {}),
    }
    const firedRules: string[] = []
    const trace: ScheduleTraceEntry[] = []

    let steps = 0
    while (queue.size > 0) {
      const field = queue.dequeue()
      if (field === undefined) break
      if (++steps > MAX_STEPS) {
        throw new Error('调度超过最大步数，疑似存在无法收敛的规则循环，请检查规则配置')
      }

      const candidates = this.getOrderedDependents(field)
      const entryFired: string[] = []
      const changed: string[] = []

      for (const rule of candidates) {
        if (!evaluateNode(rule.when, facts)) continue

        entryFired.push(rule.name)
        firedRules.push(rule.name)

        // 应用 patch（统一合并语义，warnings 拼接），并逐字段检测真实变化
        for (const outputField of Object.keys(rule.then)) {
          const before = this.fieldStates[outputField]
          if (!before) continue // 目标不在 Schema 中，忽略
          const after = mergeFieldState(before, rule.then[outputField])
          this.fieldStates[outputField] = after

          if (isFieldStateChanged(before, after) && !changed.includes(outputField)) {
            changed.push(outputField)
          }
        }
      }

      const enqueuedFields: string[] = []
      for (const outputField of changed) {
        queue.enqueue(outputField)
        enqueuedFields.push(outputField)
      }

      trace.push({
        dequeued: field,
        candidateRules: candidates.map((r) => r.name),
        firedRules: entryFired,
        changedFields: changed,
        enqueuedFields,
      })
    }

    return { fieldStates: this.fieldStates, firedRules, trace }
  }

  /** 取某字段的依赖规则，并按冲突消解语义排序：priority 升序、同序按声明顺序 */
  private getOrderedDependents(field: string): Rule[] {
    const names = new Set(this.graph.getRulesDependingOn(field))
    return this.rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => names.has(rule.name))
      .sort((a, b) => {
        const pa = a.rule.priority ?? 0
        const pb = b.rule.priority ?? 0
        return pa - pb || a.index - b.index
      })
      .map(({ rule }) => rule)
  }
}
