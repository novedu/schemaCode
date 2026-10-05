/**
 * DataPath（点路径读写工具）
 *
 * 执行策略要往 "amount.value"、"amount.currency" 这类路径写值，
 * 读写规则集中一处，避免三个策略各自实现导致语义分叉。
 *
 * 只支持普通对象（执行器保证输入已深克隆），不处理数组路径。
 */
export function getPath(
  data: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = data

  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }

  return current
}

/** 按路径写值，沿途自动补空对象 */
export function setPath(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.')
  let current: Record<string, unknown> = data

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const next = current[key]
    if (next === null || typeof next !== 'object') {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  current[keys[keys.length - 1]] = value
}

/** 取父路径："amount.value" → "amount"；无点时返回 undefined */
export function parentPath(path: string): string | undefined {
  const index = path.lastIndexOf('.')
  return index === -1 ? undefined : path.slice(0, index)
}

/** 深克隆（数据为表单 JSON，结构化克隆足够，不引入额外依赖） */
export function deepClone<T>(value: T): T {
  return structuredClone(value)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
