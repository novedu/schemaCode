import type { FieldMapping } from '../../types'
import type { TransformRegistry } from '../transform-registry'
import {
  getPath,
  isPlainObject,
  parentPath,
  setPath,
} from '../data-path'
import type { StrategyContext } from './strategy-types'

/**
 * Transform 策略
 *
 * 按 Plan 中的 transform 名称从 Registry 取函数并执行。
 *
 * 写入规则（为了同时满足 "numberToMoney 返回 {value}" 与
 * "日志记录 amount.value before6000 after6000" 两种表述）：
 *
 *   - 转换结果是普通对象时，把它合并到 target 的【父路径】 ——
 *     例如 target="amount.value"、结果 {value:6000} →
 *     working.amount 与 {value:6000} 合并，叶子 amount.value=6000；
 *   - 转换结果是标量时，直接写入 target 叶子。
 *
 * 转换函数抛错由 Executor 统一捕获，记入 failures 并继续后续数据。
 */
export function executeTransform(
  mapping: FieldMapping,
  registry: TransformRegistry,
  ctx: StrategyContext,
): void {
  const transform = registry.get(mapping.transform)

  const raw = getPath(
    ctx.source as unknown as Record<string, unknown>,
    mapping.source,
  )
  const result = transform(raw)

  let writePath: string
  if (isPlainObject(result)) {
    const parent = parentPath(mapping.target)
    if (!parent) {
      throw new Error(
        `transform "${mapping.transform}" 返回对象，但 target "${mapping.target}" 没有父路径可合并`,
      )
    }
    const existing = getPath(ctx.working, parent)
    setPath(ctx.working, parent, {
      ...(isPlainObject(existing) ? existing : {}),
      ...result,
    })
    writePath = parent
  } else {
    setPath(ctx.working, mapping.target, result)
    writePath = mapping.target
  }

  const after = getPath(ctx.working, mapping.target)

  ctx.log({
    action: 'transform',
    sourceField: mapping.source,
    targetField: mapping.target,
    before: raw,
    after,
  })
}
