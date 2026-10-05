import type { FormDefinition } from './types'

/**
 * ConfigStore（内存配置仓储）
 *
 * 模拟企业配置中心的最底层存取：Map<key, FormDefinition>。
 * 本类只负责存取，不知道：
 *   - 草稿/发布生命周期语义（由 FormService / PublishService 解释）
 *   - Schema/Rule/Permission 的业务含义
 *   - Runtime 执行
 *
 * key 形如：purchase-order@v1 / purchase-order@v2。
 *
 * 不可变纪律（与真实配置中心一致）：
 *   - formId + version 唯一；
 *   - 已 published 的记录不可被 save 覆盖（抛错）；
 *   - draft 可重复保存（覆盖式更新工作副本）；
 *   - 写入/读出做结构化克隆，仓储与调用方之间没有共享引用——
 *     模拟真实 API 的序列化边界。
 */

/** 构造存储 key */
export function definitionKey(formId: string, version: number): string {
  return `${formId}@v${version}`
}

/** published 记录被尝试覆盖时抛出 */
export class PublishedDefinitionImmutableError extends Error {
  constructor(formId: string, version: number) {
    super(
      `${formId}@v${version} 已发布，发布版本不可覆盖；请保存为新版本草稿`,
    )
    this.name = 'PublishedDefinitionImmutableError'
  }
}

export class ConfigStore {
  private readonly definitions = new Map<string, FormDefinition>()

  /**
   * 保存定义：
   *   无记录           → 插入；
 *   已有 draft        → 覆盖（草稿可反复保存）；
 *   已有 published    → 拒绝（必须走新版本）。
   */
  save(definition: FormDefinition): FormDefinition {
    const key = definitionKey(definition.formId, definition.version)
    const existing = this.definitions.get(key)

    if (existing && existing.status === 'published') {
      throw new PublishedDefinitionImmutableError(definition.formId, definition.version)
    }

    const stored = structuredClone(definition)
    this.definitions.set(key, stored)
    return structuredClone(stored)
  }

  /** 精确读取（不限状态）；不存在返回 undefined */
  get(formId: string, version: number): FormDefinition | undefined {
    const value = this.definitions.get(definitionKey(formId, version))
    return value ? structuredClone(value) : undefined
  }

  /** 只读取 draft；不存在或已发布均返回 undefined */
  getDraft(formId: string, version: number): FormDefinition | undefined {
    const value = this.get(formId, version)
    return value?.status === 'draft' ? value : undefined
  }

  /** 只读取 published；Runtime 经此方法拿不到 draft */
  getPublished(formId: string, version: number): FormDefinition | undefined {
    const value = this.get(formId, version)
    return value?.status === 'published' ? value : undefined
  }

  /** 某表单的全部版本号（升序） */
  listVersions(formId: string): number[] {
    const prefix = `${formId}@v`
    const versions: number[] = []

    for (const key of this.definitions.keys()) {
      if (!key.startsWith(prefix)) continue
      const versionText = key.slice(prefix.length)
      const version = Number(versionText)
      if (Number.isInteger(version)) versions.push(version)
    }

    return versions.sort((a, b) => a - b)
  }

  /** 当前记录条数（测试/调试用） */
  size(): number {
    return this.definitions.size
  }
}
