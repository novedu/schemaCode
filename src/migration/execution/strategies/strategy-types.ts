import type { FormData } from '../../../types'
import type { OperationLogEntry } from '../types'

/**
 * 策略执行上下文：
 *   source  —— 只读的源数据；
 *   working —— 正在构建的目标数据（内存对象）；
 *   log     —— 追加操作日志。
 */
export interface StrategyContext {
  source: FormData
  working: Record<string, unknown>
  log(entry: Omit<OperationLogEntry, 'timestamp'>): void
}
