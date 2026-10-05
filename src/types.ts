/**
 * 数据结构定义（与各理论层一一对应）
 *
 *   ① Schema        —— 字段元数据（声明"有哪些字段、长什么样"）
 *   ② FormData      —— 表单数据（唯一数据源 / single source of truth）
 *   ③ 条件体系      —— Operator → Condition → Condition Group（自底向上三层）
 *      Rule         —— 产生式规则（priority + when 条件树 → then 状态变更）
 *   ④ FieldState    —— 字段动态状态（派生状态）
 *
 * 注意：显隐只有 visible 一个布尔量，不引入 hidden。
 * 因为 hidden = !visible 是同一个事实的两种表达，
 * 两套表达并存时会出现 hidden:true 与 visible:true 同时成立的矛盾态。
 */

/** ① Schema：单个字段的静态描述 */
export interface FieldSchema {
  name: string
  label: string
  type: 'select' | 'text' | 'number' | 'money' | 'object'
  options?: { label: string; value: string }[]
  /** 渲染组件名（在 ComponentMap 中注册）；省略时由 Renderer 按 type 兜底 */
  component?: string
  /** 传给组件的静态配置（低代码设计器里填的属性） */
  props?: Record<string, unknown>
  /**
   * 对象字段的内部结构（type='object' 时使用）。
   * 供 Schema Version / Migration 等离线模块做嵌套路径校验；
   * 运行时主链路不读取它。增量可选，不影响既有 Schema。
   */
  shape?: Record<string, FieldShapeNode>
  /** 初始状态（引擎推理前的基线） */
  initialState: FieldState
  /**
   * SubForm 子表配置：type='object' 且本字段是重复数据结构时使用。
   * 子表字段的初始值是行数组（Row[]），每行有稳定 rowId。
   */
  subForm?: SubFormSchema
}

/** 对象字段的嵌套叶子描述（类型/必填/精度） */
export interface FieldShapeNode {
  type: 'select' | 'text' | 'number' | 'money' | 'object' | 'string' | 'boolean'
  required?: boolean
  precision?: number
}

/** ① Schema：整张表单的静态描述 */
export interface Schema {
  fields: FieldSchema[]
  /**
   * 可选布局树：字段的分组展示结构（Container 容器 + 字段引用）。
   *
   * 布局是纯展示信息：
   *   - fields 始终是字段的完整扁平清单（深度优先顺序），状态推理链路
   *     （Resolver/规则/权限/依赖图）只消费 fields，不读取 layout；
   *   - 省略 layout 时按 fields 顺序平铺渲染（与既有 Schema 完全兼容）；
   *   - 引用的字段名必须存在于 fields 中（由 Schema 生产方保证）。
   */
  layout?: LayoutNode[]
}

/** 布局叶子：引用 fields 中的字段名 */
export interface LayoutFieldNode {
  kind: 'field'
  field: string
}

/** 布局容器：分组展示子节点；可嵌套容器，不可引用自身/后代（防循环） */
export interface LayoutContainerNode {
  kind: 'container'
  label: string
  children: LayoutNode[]
}

/** 布局栅格列：Grid 的内部槽位，children 只能放字段叶子（非独立 LayoutNode） */
export interface LayoutColumn {
  children: LayoutFieldNode[]
}

/** 布局栅格：一行多列，等宽布局；columns 数量创建时定（2 列 / 3 列） */
export interface LayoutGridNode {
  kind: 'grid'
  label: string
  columns: LayoutColumn[]
}

/* ─────────────────────── SubForm（子表 / 明细表） ─────────────────────── */

/**
 * SubForm 列定义：复用 FieldSchema 的核心子集，不另造一套字段模型。
 * 与 Grid Column 的本质区别：Grid 是布局，SubForm 是重复数据。
 */
export interface SubFormColumn {
  /** 列字段名（Row 数据的键） */
  field: string
  /** 列显示名 */
  label: string
  /** 列字段类型 */
  type: 'text' | 'number' | 'money' | 'select'
  /** 渲染组件名（复用 ComponentMap） */
  component?: string
  /** 组件静态属性 */
  props?: Record<string, unknown>
  /** Select 类组件的选项 */
  options?: { label: string; value: string }[]
  /** 是否必填 */
  required?: boolean
}

/**
 * SubForm 结构：重复数据集合。
 * 每行有稳定 rowId，行内字段值独立于其他行。
 */
export interface SubFormSchema {
  /** 子表字段名（FormData 中该字段的键） */
  name: string
  /** 子表显示名 */
  label: string
  /** 列定义 */
  columns: SubFormColumn[]
  /** 计算字段定义（受限操作，非任意表达式） */
  computedFields?: import('./subform/subform-core').SubFormComputedField[]
  /** 聚合定义（第一阶段只支持 SUM） */
  aggregates?: import('./subform/subform-core').SubFormAggregate[]
}

/**
 * SubForm 行：一行数据 + 稳定身份。
 * rowId 不随数组索引变化，删除行后其他行 rowId 保持不变。
 */
export interface SubFormRow {
  /** 行唯一标识（如 row-1, row-2） */
  rowId: string
  /** 行数据：字段名 → 值 */
  values: Record<string, unknown>
}

/** SubForm 初始值 = 空行数组 */
export const SUBFORM_INITIAL_ROWS: SubFormRow[] = []

/** 布局树节点（可判别联合，仅表达展示结构，不携带字段元数据） */
export type LayoutNode = LayoutFieldNode | LayoutContainerNode | LayoutGridNode

/** ② FormData：纯数据，不掺杂任何 UI 逻辑 */
export interface FormData {
  customerType: 'person' | 'company'
  companyName: string
  registeredCapital: number
  /** OA 报销金额 */
  amount: number
  /** 审批意见（经理填写） */
  approveComment: string
}

/**
 * ④ FieldState：字段的动态状态，由规则引擎计算得出。
 *
 *   visible  —— 是否渲染
 *   required —— 是否必填
 *   disabled —— 控件禁用（灰掉、不参与提交）
 *   readonly —— 只读（值可见不可改，仍随表单提交）
 *   editable —— 权限层的"可编辑"总开关（与 BPM 节点语义正交）
 *   warnings —— 非阻断性提示（多条规则可以同时给出提示，合并时拼接）
 */
export interface FieldState {
  visible: boolean
  required: boolean
  disabled: boolean
  readonly: boolean
  editable: boolean
  warnings: string[]
}

/* ─────────────────────────── ③ 条件体系（三层） ─────────────────────────── */

/** 第 1 层 Operator：支持的操作符种类 */
export type OperatorName = 'equals' | 'greaterThan' | 'notEmpty'

/**
 * 第 2 层 Condition：条件叶子
 * 表达"某个字段 经过某个操作符 与某个值比较"，例如：
 *   { field: 'customerType', operator: 'equals', value: 'company' }
 */
export interface Condition {
  kind: 'condition'
  field: string
  operator: OperatorName
  value?: unknown
}

/**
 * 第 3 层 Condition Group：条件组
 * 组内所有子节点用同一个连接符（and/or）连接；
 * 混合 and/or 时通过"嵌套子组"表达，等价于括号：A AND (B OR C)。
 */
export interface ConditionGroup {
  kind: 'group'
  combinator: 'and' | 'or'
  children: ConditionNode[]
}

/** 条件 AST 节点（可判别联合，支持无限递归嵌套） */
export type ConditionNode = Condition | ConditionGroup

/** Rule：一条产生式规则（产生式系统里的 production） */
export interface Rule {
  name: string
  /**
   * 规则优先级，默认 0。
   * 多条规则同时命中且动作冲突时：priority 大者胜出；
   * priority 相同时：声明顺序靠后者胜出（引擎做稳定排序）。
   * 建议对可能修改同一字段的规则显式写 priority，不要依赖顺序的"潜规则"。
   */
  priority?: number
  /** 左部：一棵条件树（全部声明式、可序列化） */
  when: ConditionNode
  /** 右部：条件成立时，对字段状态打补丁（patch） */
  then: Record<string, Partial<FieldState>>
}

/* ───────────── State Resolution（字段状态决策）基础类型 ───────────── */

/**
 * 字段状态补丁：只含需要声明的键，未出现的键表示"本来源不表态"。
 * 不同来源（Schema/规则/BPM/权限）都只产出补丁，不直接写最终状态。
 */
export type FieldStatePatch = Partial<FieldState>

/** 一张"字段 → 该字段状态补丁"的补丁表（Provider 的统一输出形态） */
export type StatePatchMap = Record<string, FieldStatePatch>

/** 状态来源标识；优先级关系在 Resolver 中显式固定 */
export type StateSourceName = 'schema' | 'rule' | 'bpm' | 'permission'

/** 一个状态来源：名称 + 它产出的补丁表 */
export interface StateSource {
  name: StateSourceName
  patches: StatePatchMap
}

/* ─────────────────── RuntimeContext（OA 运行时上下文） ─────────────────── */

/**
 * 模拟后端为一次表单运行下发的上下文：
 * Schema 版本 + 流程任务 + 当前用户 + 权限。
 * 规则引擎不直接读这个嵌套对象，而是经 RuntimeContext 适配层
 * 拍平成条件事实（ctx.xxx），保持条件树与具体后端结构解耦。
 */
export interface RuntimeContext {
  schemaVersion: string
  /**
   * Schema 版本绑定（由 Schema Version Runtime 填充）：
   * 当前实例运行在哪张表单的哪个版本上。
   * 版本只负责"选择运行环境"，规则/渲染层不读取它做分支判断。
   */
  schema?: {
    formId: string
    version: string
  }
  task: {
    taskId: string
    /** BPM 节点标识，如 employee_fill / manager_approve */
    node: string
  }
  user: {
    userId?: string
    name?: string
    roles: string[]
  }
  permissions: {
    /** 全局可编辑开关（只读流程实例时为 false） */
    editable: boolean
  }
}
