import type {
  Finding,
  MigrationValidationInput,
  MigrationPlan,
  MigrationValidatorModule,
} from '../types'
import { getTargetFieldNames } from '../schema-introspection'

/**
 * Permission Validator
 *
 * 版本演进中【新增的顶层字段】必须有权限策略（谁能看/谁能改）。
 * 未在权限覆盖清单中登记的新字段 → manual：
 * 迁移可以描述，但上线前必须补齐权限配置，
 * 避免新字段以"默认可编辑"状态裸奔进生产。
 */
export const permissionValidator: MigrationValidatorModule = {
  name: 'permission',

  validate(plan: MigrationPlan, input: MigrationValidationInput): Finding[] {
    const sourceNames = new Set(input.sourceSchema.fields.map((f) => f.name))
    const covered = new Set(input.permissionConfiguredFields)

    const findings: Finding[] = []

    for (const name of getTargetFieldNames(input.targetSchema)) {
      // 老字段沿用已有权限策略，只检查新增字段
      if (sourceNames.has(name)) continue
      if (covered.has(name)) continue

      findings.push({
        validator: 'permission',
        level: 'manual',
        message: `field "${name}" has no permission policy, manual confirmation required`,
        field: name,
      })
    }

    return findings
  },
}
