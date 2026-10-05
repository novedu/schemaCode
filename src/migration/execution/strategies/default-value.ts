import type { DefaultValue } from '../../types'
import { getPath, setPath } from '../data-path'
import type { StrategyContext } from './strategy-types'

/**
 * Default Value 策略
 *
 * 目标版本新增字段时，按 Plan 声明写入默认值。
 * 默认值来自人工评审过的 Plan（如 currency="CNY"），
 * 执行器不自行猜测任何业务数据。
 */
export function executeDefaultValue(
  defaultValue: DefaultValue,
  ctx: StrategyContext,
): void {
  const before = getPath(ctx.working, defaultValue.field)

  setPath(ctx.working, defaultValue.field, defaultValue.value)

  ctx.log({
    action: 'default',
    targetField: defaultValue.field,
    before,
    after: defaultValue.value,
  })
}
