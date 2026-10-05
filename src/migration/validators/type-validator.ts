import type {
  Finding,
  MigrationValidationInput,
  MigrationPlan,
  MigrationValidatorModule,
} from '../types'
import {
  getSourceField,
  resolveTargetPath,
} from '../schema-introspection'

/**
 * Type Validator
 *
 * 检查字段类型演进是否可安全转换。转换矩阵集中声明：
 *
 *   允许：number ↔ money（money 数值内核）、string/text → number、
 *         各类型 → 同类型；
 *   禁止：object → number/string 等（结构化数据无法压成标量）。
 *
 * 设计原因：把"能不能转"从迁移计划里剥离 —— 计划只声明意图，
 * 是否安全由本检查依据矩阵独立裁决，矩阵演进不影响计划结构。
 */

/** 归一化类型族：text 视作 string；其余按语义归组 */
function typeFamily(type: string): 'number' | 'string' | 'boolean' | 'object' {
  if (type === 'number' || type === 'money') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'object') return 'object'
  // text / select / string 等
  return 'string'
}

/** 源类型族 → 允许的目标类型族（object 只能到 object） */
const CONVERTIBLE: Record<string, string[]> = {
  number: ['number', 'string'],
  string: ['string', 'number'],
  boolean: ['boolean', 'string'],
  object: ['object'],
}

function canConvert(sourceType: string, targetType: string): boolean {
  return CONVERTIBLE[typeFamily(sourceType)]?.includes(typeFamily(targetType)) ?? false
}

export const typeValidator: MigrationValidatorModule = {
  name: 'type',

  validate(plan: MigrationPlan, input: MigrationValidationInput): Finding[] {
    const findings: Finding[] = []

    for (const mapping of plan.fieldMappings) {
      const source = getSourceField(input.sourceSchema, mapping.source)
      const target = resolveTargetPath(input.targetSchema, mapping.target)

      // 字段/路径缺失由 Field Mapping Validator 负责，这里不重复报错
      if (!source || !target) continue

      if (!canConvert(source.type, target.type)) {
        findings.push({
          validator: 'type',
          level: 'error',
          message: `incompatible type change: ${mapping.source}(${source.type}) → ${mapping.target}(${target.type})`,
          field: mapping.target,
        })
      }
    }

    return findings
  },
}
