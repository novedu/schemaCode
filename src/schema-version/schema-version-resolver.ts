import type { SchemaRegistry } from './schema-registry'
import type {
  BackendTaskPayload,
  VersionResolution,
  VersionResolveRequest,
} from './types'

/**
 * SchemaVersionResolver（版本解析器）
 *
 * 版本运行时的唯一决策点，规则只有三条：
 *
 *   1. 历史任务（mode='history'）：
 *      后端返回 version 时【必须】使用该版本，严格冻结；
 *      缺少 version 直接报错 —— 不允许悄悄升到最新。
 *
 *   2. 新建表单（mode='create'）：
 *      不看调用方是否传了 version，始终解析为 Registry 中的 latest。
 *
 *   3. 任何场景都不修改数据：v1 的数据打开时不会被补上 v2 字段。
 *
 * Resolver 不认识 RuleEngine / Renderer，只输出 Schema 实例，
 * 保持单向数据流：
 *
 *   Backend Version → Resolver/Registry → Schema Instance → Existing Pipeline
 */
export class SchemaVersionResolver {
  constructor(private readonly registry: SchemaRegistry) {}

  /** 按显式请求解析版本 */
  resolve(request: VersionResolveRequest): VersionResolution {
    if (request.mode === 'history') {
      if (!request.version) {
        throw new Error(
          `历史任务缺少 schemaVersion，已拒绝打开（formId="${request.formId}"）；`
          + '历史任务禁止隐式切换到最新 Schema',
        )
      }

      const schema = this.registry.getSchema(request.formId, request.version)
      return {
        formId: request.formId,
        version: request.version,
        schema,
        mode: 'history',
        pinned: true,
      }
    }

    // 新建：始终取最新；即使调用方误传了 version 也不采用，避免伪造绑定
    const version = this.registry.getLatestVersion(request.formId)
    const schema = this.registry.getSchema(request.formId, version)

    return {
      formId: request.formId,
      version,
      schema,
      mode: 'create',
      pinned: false,
    }
  }

  /**
   * 模拟"后端响应 → 运行时初始化"：
   *
   *   响应带 schemaVersion → 历史任务，版本冻结；
   *   响应不带             → 新建，解析最新。
   *
   * 同时把版本绑定写回 RuntimeContext 所需的 schema 字段（由调用方取用）。
   */
  bindBackendTask(payload: BackendTaskPayload): VersionResolution {
    if (payload.schemaVersion) {
      return this.resolve({
        formId: payload.formId,
        mode: 'history',
        version: payload.schemaVersion,
      })
    }

    return this.resolve({
      formId: payload.formId,
      mode: 'create',
    })
  }
}
