import type { ConfigStore } from './config-store'
import type { FormBundle, FormDefinition, FormVersionDetail } from './types'

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * FormService（表单配置生命周期服务 · 基础操作）
 *
 * 在 ConfigStore 之上解释"草稿"语义，提供设计时写入与运行时读取：
 *
 *   设计时：saveDraft / saveDraftAuto  → status='draft'
 *   运行时：getPublished / getLatestPublished —— 只返回 published
 *
 * Runtime 无法经本服务拿到 draft：getDraft 仅供设计器回读与发布流程
 * 使用；运行时入口只有 getPublished*。
 */
export class FormService {
  constructor(private readonly store: ConfigStore) {}

  /**
   * 保存指定版本的草稿。
   * 若该版本已 published，底层仓储会拒绝（发布版本不可覆盖）。
   */
  saveDraft(formId: string, version: number, bundle: FormBundle): FormDefinition {
    return this.store.save({
      formId,
      version,
      status: 'draft',
      updatedAt: nowIso(),
      ...bundle,
    })
  }

  /**
   * 自动选版本保存草稿（设计器主入口）：
   *
   *   - 当前最大版本号上是 draft → 覆盖它（继续编辑同一份草稿）；
   *   - 最大版本是 published / 无任何版本 → 创建下一个新版本草稿。
   *
   * 这样"已发布 v1 后继续修改"必然产生 v2，不会动 v1。
   */
  saveDraftAuto(formId: string, bundle: FormBundle): FormDefinition {
    const versions = this.listVersions(formId)
    const maxVersion = versions[versions.length - 1] ?? 0

    const latest = maxVersion === 0 ? undefined : this.store.get(formId, maxVersion)
    const targetVersion = latest?.status === 'draft' ? maxVersion : maxVersion + 1

    return this.saveDraft(formId, targetVersion, bundle)
  }

  /** 读取草稿（设计器回显 / 发布流程使用） */
  getDraft(formId: string, version: number): FormDefinition | undefined {
    return this.store.getDraft(formId, version)
  }

  /** 读取指定版本的已发布配置；Runtime 专用 */
  getPublished(formId: string, version: number): FormDefinition | undefined {
    return this.store.getPublished(formId, version)
  }

  /**
   * 读取最新已发布版本（版本号最大的 published）。
   * draft 不参与选择——即使 v3 是 draft，"最新发布"仍是 v2。
   */
  getLatestPublished(formId: string): FormDefinition | undefined {
    const versions = this.listVersions(formId)
    for (let i = versions.length - 1; i >= 0; i--) {
      const published = this.store.getPublished(formId, versions[i])
      if (published) return published
    }
    return undefined
  }

  /** 版本清单（升序） */
  listVersions(formId: string): number[] {
    return this.store.listVersions(formId)
  }

  /** 仓储中实际存在的 formId（升序） */
  listFormIds(): string[] {
    return this.store.listFormIds()
  }

  /** 各版本的 status / updatedAt（升序 version） */
  listVersionDetails(formId: string): FormVersionDetail[] {
    return this.store.listVersionDetails(formId)
  }
}
