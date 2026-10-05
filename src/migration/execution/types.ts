import type { FormData } from '../../types'

/**
 * Migration Execution Simulator · 类型定义
 *
 * 设计原则：
 *   - 只操作内存对象（输入数据的深克隆），不接数据库；
 *   - 不修改历史数据，不进入 Renderer/RuleEngine/Scheduler 主链路；
 *   - MigrationPlan 中仍然只存 transform 名称，函数由 Registry 管理。
 */

export type OperationAction = 'copy' | 'default' | 'transform'

/** 操作日志：每一次字段变化都必须留痕（审计 / Debug / 未来回滚的依据） */
export interface OperationLogEntry {
  timestamp: number
  action: OperationAction
  /** copy/transform 的源路径；default 时为 undefined */
  sourceField?: string
  /** 写入的目标路径 */
  targetField: string
  /** 变化前的值（目标路径上的旧值，首次写入为 undefined） */
  before: unknown
  /** 变化后叶子上的实际值 */
  after: unknown
}

/** 单条失败记录（批量场景带记录下标） */
export interface FailureEntry {
  index: number
  reason: string
  field?: string
}

/** 执行总状态 */
export type ExecutionStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'alreadyExecuted'

/** 批量场景中单条记录的结果 */
export interface BatchItemResult {
  index: number
  status: 'success' | 'failed'
  data: FormData
  operations: OperationLogEntry[]
  failures: FailureEntry[]
}

/**
 * 执行报告：可审计、可在审批流中传递。
 */
export interface ExecutionReport {
  migrationId: string
  formId: string
  sourceVersion: string
  targetVersion: string
  status: ExecutionStatus
  /** 是否试运行（默认 true：只产出预览与日志，无持久化动作） */
  dryRun: boolean
  /** 单条执行时的迁移结果数据（批量时为 undefined，见 items） */
  migratedData?: FormData
  /** 单条执行时的操作日志（批量时日志在各 item 内） */
  operations?: OperationLogEntry[]
  /** 批量执行时逐条结果 */
  items?: BatchItemResult[]
  /** 从校验阶段继承的风险提示（如精度收窄） */
  warnings: string[]
  failures: FailureEntry[]
}

/**
 * 幂等元数据：一条迁移路径在本进程内是否已成功执行过。
 */
export interface MigrationExecutionMeta {
  migrationId: string
  sourceVersion: string
  targetVersion: string
  executed: boolean
  /** 最近一次执行时间（未执行时为 undefined） */
  executedAt?: number
}

export interface ExecutionOptions {
  /** 默认 true：dry run，只给预览 */
  dryRun?: boolean
}
