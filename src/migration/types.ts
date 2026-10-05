import type { FormData, RuntimeContext, Schema } from '../types'

/**
 * Migration Engine · 基础类型（第一阶段：定义 + 校验，不执行迁移）
 *
 * 设计原则：
 *   - MigrationPlan 是纯描述，不含任何可执行代码、不触碰历史数据；
 *   - 各 Validator 只输出 Finding（发现项），由 Report Builder 汇总；
 *   - Migration 是离线旁路，不接入 Renderer / RuleEngine / Scheduler 主链路。
 */

/* ───────────────── 迁移计划 ───────────────── */

/** 内置数据转换标识（Execution Engine 将在下一阶段实现） */
export type TransformId = 'identity' | 'numberToMoney' | 'stringToNumber'

/** 单条字段映射：源字段路径 → 目标字段路径 + 转换方式 */
export interface FieldMapping {
  source: string
  target: string
  transform: TransformId | string
}

/** 目标字段的默认值（仅声明，执行阶段才会写入数据） */
export interface DefaultValue {
  /** 目标路径，如 amount.currency */
  field: string
  value: unknown
}

/** 迁移计划：从哪个版本迁到哪个版本，字段怎么映射，缺省值是什么 */
export interface MigrationPlan {
  formId: string
  fromVersion: string
  toVersion: string
  fieldMappings: FieldMapping[]
  defaults: DefaultValue[]
}

/* ───────────────── 校验发现项 ───────────────── */

/**
 * 发现项级别：
 *   error  —— 迁移不安全，禁止执行；
 *   warning—— 可以迁移但存在风险，需人工知晓；
 *   manual —— 无法自动处理，必须人工补充（如必填值、权限策略）。
 */
export type FindingLevel = 'error' | 'warning' | 'manual'

export interface Finding {
  validator: string
  level: FindingLevel
  message: string
  /** 关联的字段路径 */
  field?: string
}

/** Validator 统一接口：一个名字 + 一个纯函数式校验方法 */
export interface MigrationValidatorModule {
  name: string
  validate(plan: MigrationPlan, input: MigrationValidationInput): Finding[]
}

/** 校验输入：计划 + 两端 Schema + 样本数据 + 运行时上下文 + 权限覆盖情况 */
export interface MigrationValidationInput {
  sourceSchema: Schema
  targetSchema: Schema
  sampleData: FormData
  context: RuntimeContext
  /**
   * 已配置权限策略的字段（来自权限模块的覆盖清单）。
   * 新增字段若不在此清单中，Permission Validator 会要求人工确认。
   */
  permissionConfiguredFields: string[]
}

/* ───────────────── 迁移报告 ───────────────── */

export type CheckStatus = 'pass' | 'fail' | 'warning' | 'manual'

export interface ValidationCheck {
  name: string
  status: CheckStatus
  /** 该检查的说明（命中信息摘要） */
  detail?: string
}

/**
 * 报告总状态：
 *   有 error → error；否则有 warning → warning；
 *   否则有 manual → manual；全部通过 → success。
 */
export type MigrationStatus = 'success' | 'warning' | 'manual' | 'error'

/** 可审计的迁移报告：回答"迁了什么/为什么可以/风险在哪/谁要人工处理" */
export interface MigrationReport {
  formId: string
  fromVersion: string
  toVersion: string
  status: MigrationStatus
  checks: ValidationCheck[]
  errors: string[]
  warnings: string[]
  manualRequired: string[]
}
