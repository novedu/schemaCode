import type { FieldStatePatch, Rule, Schema } from '../src/types'

/**
 * Config Gateway 类型契约
 *
 * 本文件只描述"配置交换层"的传输/存储形状，不包含任何运行时逻辑。
 * 关键纪律：
 *
 *   - schema / rules 直接引用 Runtime Core 的原生类型（../src/types），
 *     网关绝不另造一套与核心不兼容的格式；
 *   - Runtime Core 不 import 本文件（单向依赖：网关 → 核心）；
 *   - 未来替换为真实配置中心时，只需新增一个实现 ConfigGateway
 *     接口的 HTTP 客户端，消费方（demo-app / designer-app）零改动。
 */

/* ─────────────────────── 权限配置（结构与应用侧契约一致） ─────────────────────── */

/**
 * 声明式权限表：结构与 demo-app / designer-app 已在用的
 * PermissionConfig 逐字段一致（TS 结构类型，同构即互通）。
 */
export interface PermissionConfig {
  version: number
  roles: string[]
  entries: {
    field: string
    role: string
    patch: FieldStatePatch
  }[]
}

/* ─────────────────────── Bundle / Definition ─────────────────────── */

/**
 * FormBundle：三个 Designer 经 Export Bundle 汇出的配置载荷。
 * 三个设计器互不依赖，只与 Bundle 打交道，不直接操作网关。
 */
export interface FormBundle {
  schema: Schema
  rules: Rule[]
  permissions: PermissionConfig
}

/** 配置生命周期状态 */
export type DefinitionStatus = 'draft' | 'published'

/**
 * FormDefinition：配置中心中的一条版本化记录。
 *
 *   purchase-order@v1  ←  key 由 formId + version 构成
 */
export interface FormDefinition extends FormBundle {
  formId: string
  version: number
  status: DefinitionStatus
  /** ISO-8601；草稿保存 / 发布时各自更新，不跨状态共享引用 */
  updatedAt: string
}

/** 版本清单元数据（含 draft / published 状态，供配置管理页展示） */
export interface FormVersionDetail {
  version: number
  status: DefinitionStatus
  updatedAt: string
}

/* ─────────────────────── 网关接口（面向未来真实 API） ─────────────────────── */

/**
 * 配置网关统一接口。
 *
 * 当前实现：进程内内存版本（LocalConfigGateway，方法可同步可异步）。
 * 未来实现：HttpConfigGateway（fetch 真实配置中心）。
 * 消费方只依赖本接口，因此传输方式可整体替换。
 *
 * 注意 Runtime 侧只有 load* 方法，且只能拿到 published ——
 * draft 对 Runtime 不可见，这是接口形状层面的保证。
 */
export interface ConfigGateway {
  /* 设计时 */
  saveDraft(formId: string, version: number, bundle: FormBundle): FormDefinition
  publish(formId: string, version: number): FormDefinition

  /* 运行时（仅 published） */
  loadFormDefinition(formId: string, version: number): FormDefinition
  loadLatestPublishedFormDefinition(formId: string): FormDefinition
  listVersions(formId: string): number[]
  listFormIds(): string[]
  listVersionDetails(formId: string): FormVersionDetail[]
}

/** 查询不到目标配置时抛出的错误（消费方可显式识别 404 语义） */
export class DefinitionNotFoundError extends Error {
  readonly formId: string
  readonly version?: number

  constructor(formId: string, version?: number) {
    super(
      version === undefined
        ? `表单 ${formId} 没有已发布版本`
        : `表单 ${formId}@v${version} 不存在或尚未发布`,
    )
    this.name = 'DefinitionNotFoundError'
    this.formId = formId
    this.version = version
  }
}
