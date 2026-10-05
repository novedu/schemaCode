import type {
  Finding,
  MigrationValidationInput,
  MigrationPlan,
  MigrationValidatorModule,
  TransformId,
} from '../types'
import {
  getSourceField,
  resolveTargetPath,
} from '../schema-introspection'

/**
 * Field Mapping Validator
 *
 * 校验每条字段映射的"接线"是否成立：
 *   1. source 在源 Schema 中存在（不存在 → error，迁移无法执行）；
 *   2. target 路径在目标 Schema 中存在（不存在 → error）；
 *   3. transform 是已知转换（未知 → warning，需评审后再登记）。
 */

const KNOWN_TRANSFORMS: ReadonlySet<TransformId> = new Set([
  'identity',
  'numberToMoney',
  'stringToNumber',
])

export const fieldMappingValidator: MigrationValidatorModule = {
  name: 'field mapping',

  validate(plan: MigrationPlan, input: MigrationValidationInput): Finding[] {
    const findings: Finding[] = []

    for (const mapping of plan.fieldMappings) {
      const source = getSourceField(input.sourceSchema, mapping.source)
      if (!source) {
        findings.push({
          validator: 'field mapping',
          level: 'error',
          message: `source field ${mapping.source} not found`,
          field: mapping.source,
        })
      }

      const target = resolveTargetPath(input.targetSchema, mapping.target)
      if (!target) {
        findings.push({
          validator: 'field mapping',
          level: 'error',
          message: `target path ${mapping.target} not found`,
          field: mapping.target,
        })
      }

      if (!KNOWN_TRANSFORMS.has(mapping.transform as TransformId)) {
        findings.push({
          validator: 'field mapping',
          level: 'warning',
          message: `unknown transform "${mapping.transform}", review required`,
          field: mapping.target,
        })
      }
    }

    return findings
  },
}
