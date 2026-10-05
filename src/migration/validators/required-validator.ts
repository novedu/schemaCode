import type {
  Finding,
  MigrationValidationInput,
  MigrationPlan,
  MigrationValidatorModule,
} from '../types'
import { enumerateTargetLeaves } from '../schema-introspection'

/**
 * Required Validator
 *
 * 目标 Schema 中每个必填叶子都必须有数据来源：
 *   要么被某条 fieldMapping 指向，要么在 defaults 中显式给值。
 * 两者都没有 → manual：必须人工补充，绝不自动编造业务值。
 */
export const requiredValidator: MigrationValidatorModule = {
  name: 'required',

  validate(plan: MigrationPlan, input: MigrationValidationInput): Finding[] {
    const mappedTargets = new Set(plan.fieldMappings.map((m) => m.target))
    const defaultTargets = new Set(plan.defaults.map((d) => d.field))

    const findings: Finding[] = []

    for (const leaf of enumerateTargetLeaves(input.targetSchema)) {
      if (!leaf.required) continue
      if (mappedTargets.has(leaf.path) || defaultTargets.has(leaf.path)) continue

      findings.push({
        validator: 'required',
        level: 'manual',
        message: `${leaf.path} requires manual value`,
        field: leaf.path,
      })
    }

    return findings
  },
}
