import type { FieldMapping } from '../../types'
import { getPath, setPath } from '../data-path'
import type { StrategyContext } from './strategy-types'

/**
 * Field Copy 策略
 *
 * 同构字段的直接搬运：name="Tom" → name="Tom"。
 * 不做任何转换，值原样写入目标路径并记录日志。
 */
export function executeFieldCopy(
  mapping: FieldMapping,
  ctx: StrategyContext,
): void {
  const value = getPath(ctx.source as unknown as Record<string, unknown>, mapping.source)
  const before = getPath(ctx.working, mapping.target)

  setPath(ctx.working, mapping.target, value)

  ctx.log({
    action: 'copy',
    sourceField: mapping.source,
    targetField: mapping.target,
    before,
    after: value,
  })
}
