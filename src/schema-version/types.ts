import type { FormData, Schema } from '../types'

/**
 * Schema Version Runtime 类型定义
 *
 * 设计原则：版本只负责"选择运行环境"。
 * 版本号不出现在 Renderer / RuleEngine 的任何分支判断中，
 * 也不会触发历史数据迁移 —— 本模块输出一个确定的 Schema 实例后，
 * 后续完全复用已有 Runtime Pipeline。
 */

export type FormId = string
export type VersionId = string

/** 一条版本注册记录 */
export interface VersionedSchemaRecord {
  formId: FormId
  version: VersionId
  schema: Schema
  /** 注册时间（调试用） */
  registeredAt: number
}

/** 版本解析场景 */
export type VersionResolveMode = 'history' | 'create'

/** 版本解析请求 */
export interface VersionResolveRequest {
  formId: FormId
  mode: VersionResolveMode
  /**
   * 历史任务必填：后端持久化的版本，严格冻结；
   * 新建场景忽略本字段，始终解析为 latest。
   */
  version?: VersionId
}

/** 版本解析结果（进入已有 Pipeline 前的最终绑定） */
export interface VersionResolution {
  formId: FormId
  version: VersionId
  schema: Schema
  mode: VersionResolveMode
  /**
   * true  —— 版本由后端显式指定并冻结（历史任务）；
   * false —— 版本由 Registry 解析为当前最新（新建）。
   */
  pinned: boolean
}

/**
 * 模拟后端任务响应。
 * 历史任务带 schemaVersion；新建请求不带（由运行时解析最新）。
 */
export interface BackendTaskPayload {
  taskId: string
  formId: FormId
  schemaVersion?: VersionId
  data?: Partial<FormData>
}
