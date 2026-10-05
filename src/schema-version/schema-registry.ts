import type { Schema } from '../types'
import type {
  FormId,
  VersionedSchemaRecord,
  VersionId,
} from './types'

/**
 * SchemaRegistry（Schema 注册中心）
 *
 * 管理"表单 → 版本 → Schema"两级结构。
 * Registry 只负责存取与版本顺序，不做任何数据迁移、不修改 Schema。
 *
 * 关键约束（fail-fast，不静默处理）：
 *   1. formId + version 唯一，重复注册直接抛错 ——
 *      重复注册通常意味着部署配置冲突，静默覆盖会让环境行为不可预测；
 *   2. 读取未注册的表单/版本直接抛错 ——
 *      不能"猜一个最新版本"顶上，否则历史任务可能被错误升级。
 */

interface StoredEntry {
  schema: Schema
  registeredAt: number
  /** 同表内注册序号，版本号无法比较时作为顺序依据 */
  order: number
}

export class SchemaRegistry {
  private readonly forms = new Map<
    FormId,
    Map<VersionId, StoredEntry>
  >()
  private totalRegistrations = 0

  /** 注册一个版本；同一 formId + version 重复时抛出错误 */
  register(formId: FormId, version: VersionId, schema: Schema): void {
    let versions = this.forms.get(formId)
    if (!versions) {
      versions = new Map()
      this.forms.set(formId, versions)
    }

    if (versions.has(version)) {
      throw new Error(
        `Schema 重复注册被拒绝: formId="${formId}" version="${version}" 已存在`,
      )
    }

    versions.set(version, {
      schema,
      registeredAt: Date.now(),
      order: this.totalRegistrations++,
    })
  }

  /** 严格按 formId + version 取 Schema，任一不存在均抛出明确错误 */
  getSchema(formId: FormId, version: VersionId): Schema {
    const entry = this.getEntry(formId, version)
    return entry.schema
  }

  /**
   * 列出某表单的全部版本，按版本号升序（v1 → v2 …）。
   * 版本号不可按数字解析时退化为字典序，并以注册顺序兜底。
   */
  listVersions(formId: FormId): VersionId[] {
    const versions = this.forms.get(formId)
    if (!versions) {
      throw new Error(`表单未在 Registry 中注册: formId="${formId}"`)
    }

    return [...versions.entries()]
      .sort(([, a], [, b]) => a.order - b.order) // 先稳定在注册顺序
      .map(([version]) => version)
      .sort((va, vb) => compareVersions(va, vb))
  }

  /** 取最新（版本号最大）版本；表单不存在时抛错 */
  getLatestVersion(formId: FormId): VersionId {
    const versions = this.listVersions(formId)
    const latest = versions[versions.length - 1]
    if (latest === undefined) {
      throw new Error(`表单没有任何已注册版本: formId="${formId}"`)
    }
    return latest
  }

  /** 是否存在某表单 */
  hasForm(formId: FormId): boolean {
    return this.forms.has(formId)
  }

  /** 完整注册记录（调试/审计用） */
  getRecord(formId: FormId, version: VersionId): VersionedSchemaRecord {
    const entry = this.getEntry(formId, version)
    return { formId, version, schema: entry.schema, registeredAt: entry.registeredAt }
  }

  private getEntry(formId: FormId, version: VersionId): StoredEntry {
    const versions = this.forms.get(formId)
    if (!versions) {
      throw new Error(`表单未在 Registry 中注册: formId="${formId}"`)
    }

    const entry = versions.get(version)
    if (!entry) {
      const known = [...versions.keys()].join(', ') || '(空)'
      throw new Error(
        `Schema 版本不存在: formId="${formId}" version="${version}"；已注册版本: ${known}`,
      )
    }

    return entry
  }
}

/**
 * 版本比较：支持 "v1" / "1" 这类带数字后缀的版本号；
 * 数字部分缺失时退回字典序。
 */
export function compareVersions(a: VersionId, b: VersionId): number {
  const na = parseVersionNumber(a)
  const nb = parseVersionNumber(b)

  if (na !== null && nb !== null) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

function parseVersionNumber(version: VersionId): number | null {
  const match = /^\s*v?(\d+)\s*$/.exec(version)
  return match ? Number(match[1]) : null
}
