/**
 * TransformRegistry（转换函数注册中心）
 *
 * MigrationPlan 里只能保存字符串名（可序列化、可审计），
 * 真正的转换函数在此注册，执行时按名查找：
 *
 *   Plan.transform="numberToMoney" → Registry → 函数
 *
 * 加转换 = 加注册项，Plan 结构和 Executor 都不用改。
 */
export type TransformFunction = (value: unknown) => unknown

export class TransformRegistry {
  private readonly transforms = new Map<string, TransformFunction>()

  register(name: string, fn: TransformFunction): void {
    if (this.transforms.has(name)) {
      throw new Error(`transform "${name}" 已注册，拒绝重复注册`)
    }
    this.transforms.set(name, fn)
  }

  get(name: string): TransformFunction {
    const fn = this.transforms.get(name)
    if (!fn) {
      throw new Error(`transform "${name}" 未在 TransformRegistry 中注册`)
    }
    return fn
  }

  has(name: string): boolean {
    return this.transforms.has(name)
  }
}

/**
 * 内置转换：number → money 对象 { value }。
 * 币种不在这里加 —— 币种由 defaults 显式声明，
 * 转换函数只负责自己能确定的部分，避免隐式造业务数据。
 */
export function createDefaultTransformRegistry(): TransformRegistry {
  const registry = new TransformRegistry()

  registry.register('identity', (value) => value)

  registry.register('numberToMoney', (value) => {
    if (typeof value !== 'number') {
      throw new Error(`numberToMoney 期望 number，实际收到 ${typeof value}`)
    }
    return { value }
  })

  registry.register('stringToNumber', (value) => {
    const n = typeof value === 'string' ? Number(value) : Number.NaN
    if (Number.isNaN(n)) {
      throw new Error(`stringToNumber 转换失败: ${JSON.stringify(value)}`)
    }
    return n
  })

  return registry
}
