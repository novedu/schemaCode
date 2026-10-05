import type { MigrationPlan } from './types'

/**
 * MigrationRegistry（迁移计划注册中心）
 *
 * 管理迁移路径：formId + fromVersion + toVersion → MigrationPlan。
 *
 * 约束（与 SchemaRegistry 同样的 fail-fast 原则）：
 *   1. 同一路径只能注册一次 —— 重复注册通常是配置/部署冲突，
 *      静默覆盖会让"哪份计划生效"不可追溯；
 *   2. 查询不存在的路径直接抛错，并列出该表单已注册路径，
 *      不返回空计划或猜测替代路径。
 */
export class MigrationRegistry {
  private readonly paths = new Map<string, MigrationPlan>()

  /** 注册一条迁移路径；重复时抛出错误 */
  register(plan: MigrationPlan): void {
    const key = this.buildKey(plan.formId, plan.fromVersion, plan.toVersion)

    if (this.paths.has(key)) {
      throw new Error(
        `Migration 路径重复注册被拒绝: ${plan.formId} ${plan.fromVersion} → ${plan.toVersion}`,
      )
    }

    this.paths.set(key, plan)
  }

  /** 严格按路径取计划；不存在时抛出明确错误 */
  getMigration(formId: string, fromVersion: string, toVersion: string): MigrationPlan {
    const key = this.buildKey(formId, fromVersion, toVersion)
    const plan = this.paths.get(key)

    if (!plan) {
      const known = [...this.paths.values()]
        .filter((p) => p.formId === formId)
        .map((p) => `${p.fromVersion} → ${p.toVersion}`)
        .join('；') || '(无)'

      throw new Error(
        `Migration 路径不存在: ${formId} ${fromVersion} → ${toVersion}；`
        + `该表单已注册路径: ${known}`,
      )
    }

    return plan
  }

  /** 是否存在某路径（不需要抛错的探测场景） */
  hasPath(formId: string, fromVersion: string, toVersion: string): boolean {
    return this.paths.has(this.buildKey(formId, fromVersion, toVersion))
  }

  private buildKey(formId: string, fromVersion: string, toVersion: string): string {
    return `${formId}::${fromVersion}::${toVersion}`
  }
}
