import type {
  Finding,
  MigrationReport,
  MigrationValidationInput,
  MigrationPlan,
  MigrationValidatorModule,
} from './types'
import { buildMigrationReport } from './migration-report'
import { fieldMappingValidator } from './validators/field-mapping-validator'
import { typeValidator } from './validators/type-validator'
import { requiredValidator } from './validators/required-validator'
import { precisionValidator } from './validators/precision-validator'
import { permissionValidator } from './validators/permission-validator'

/**
 * Migration Validator（迁移校验编排器）
 *
 * 唯一职责：按固定顺序运行五类检查 → 收集 Findings → 产出报告。
 *
 *   field mapping → type → required → precision → permission
 *
 * 编排器本身不做任何业务判断（新增检查只需追加到模块表），
 * 也不会因为发现 error 就提前返回 —— 报告需要包含全部问题，
 * 让作者一次修完，而不是挤牙膏式逐个暴露。
 *
 * 重要：本编排器是只读的，输入的 plan / sampleData 均不会被修改，
 * 真正的数据转换留给下一阶段的 Migration Execution Engine。
 */
const VALIDATOR_MODULES: MigrationValidatorModule[] = [
  fieldMappingValidator,
  typeValidator,
  requiredValidator,
  precisionValidator,
  permissionValidator,
]

export function validateMigrationPlan(
  plan: MigrationPlan,
  input: MigrationValidationInput,
): MigrationReport {
  const findings: Finding[] = []

  for (const module of VALIDATOR_MODULES) {
    findings.push(...module.validate(plan, input))
  }

  return buildMigrationReport(
    plan,
    findings,
    VALIDATOR_MODULES.map((m) => m.name),
  )
}
