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
 * Precision Validator
 *
 * 精度收窄（如 4 位 → 2 位）可能导致末位数据被丢弃，
 * 属于"可迁移但有数据损失风险"，输出 warning 供人工确认，
 * 而不是阻止迁移，也不静默截断。
 */
export const precisionValidator: MigrationValidatorModule = {
  name: 'precision',

  validate(plan: MigrationPlan, input: MigrationValidationInput): Finding[] {
    const findings: Finding[] = []

    for (const mapping of plan.fieldMappings) {
      const source = getSourceField(input.sourceSchema, mapping.source)
      const target = resolveTargetPath(input.targetSchema, mapping.target)
      if (!source || !target) continue

      const sourcePrecision = source.precision
      const targetPrecision = target.precision

      if (
        typeof sourcePrecision === 'number'
        && typeof targetPrecision === 'number'
        && targetPrecision < sourcePrecision
      ) {
        findings.push({
          validator: 'precision',
          level: 'warning',
          message: `precision reduction detected: ${mapping.target} ${sourcePrecision} → ${targetPrecision}`,
          field: mapping.target,
        })
      }
    }

    return findings
  },
}
