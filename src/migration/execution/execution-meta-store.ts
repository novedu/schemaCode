import type { MigrationExecutionMeta } from './types'

/**
 * ExecutionMetaStore（幂等元数据存储，进程内内存实现）
 *
 * 记录一条迁移路径是否已成功执行，防止重复转换。
 * 只有全部成功才标记 executed=true；partial/failed 保持 false，
 * 允许修复后重试 —— 这也为未来的事务/回滚语义留好位置。
 */
export class ExecutionMetaStore {
  private readonly metas = new Map<string, MigrationExecutionMeta>()

  get(migrationId: string): MigrationExecutionMeta | undefined {
    return this.metas.get(migrationId)
  }

  getOrInit(
    migrationId: string,
    sourceVersion: string,
    targetVersion: string,
  ): MigrationExecutionMeta {
    let meta = this.metas.get(migrationId)
    if (!meta) {
      meta = {
        migrationId,
        sourceVersion,
        targetVersion,
        executed: false,
      }
      this.metas.set(migrationId, meta)
    }
    return meta
  }

  markExecuted(migrationId: string): void {
    const meta = this.metas.get(migrationId)
    if (meta) {
      meta.executed = true
      meta.executedAt = Date.now()
    }
  }
}
