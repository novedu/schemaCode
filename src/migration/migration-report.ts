import type {
  CheckStatus,
  Finding,
  MigrationPlan,
  MigrationReport,
  MigrationStatus,
  ValidationCheck,
} from './types'

/**
 * Migration Report Builder
 *
 * 把各 Validator 的 Finding 汇总成可审计报告。
 * 报告是纯数据，可打印、可持久化、可在审批流中传递。
 *
 * 报告必须回答四个问题：
 *   迁了什么 —— 计划标识 + 逐项 check；
 *   为什么可以 —— status=pass 的检查；
 *   风险在哪 —— warnings / errors；
 *   谁要人工处理 —— manualRequired。
 */

/** 按 validator 名字分组 Findings，生成一项 Check */
function groupChecks(findings: Finding[], validatorOrder: string[]): ValidationCheck[] {
  return validatorOrder.map((name) => {
    const group = findings.filter((f) => f.validator === name)

    return {
      name,
      status: deriveStatus(group),
      detail: group.length > 0 ? group.map((f) => f.message).join('；') : undefined,
    }
  })
}

/**
 * 单检查状态：
 *   有 error → fail；否则有 manual → manual；
 *   否则有 warning → warning；无发现 → pass。
 */
function deriveStatus(group: Finding[]): CheckStatus {
  if (group.some((f) => f.level === 'error')) return 'fail'
  if (group.some((f) => f.level === 'manual')) return 'manual'
  if (group.some((f) => f.level === 'warning')) return 'warning'
  return 'pass'
}

/** 报告总状态（优先级 error > warning > manual > success） */
function deriveOverallStatus(findings: Finding[]): MigrationStatus {
  if (findings.some((f) => f.level === 'error')) return 'error'
  if (findings.some((f) => f.level === 'warning')) return 'warning'
  if (findings.some((f) => f.level === 'manual')) return 'manual'
  return 'success'
}

export function buildMigrationReport(
  plan: MigrationPlan,
  findings: Finding[],
  validatorOrder: string[],
): MigrationReport {
  return {
    formId: plan.formId,
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    status: deriveOverallStatus(findings),
    checks: groupChecks(findings, validatorOrder),
    errors: findings.filter((f) => f.level === 'error').map((f) => f.message),
    warnings: findings.filter((f) => f.level === 'warning').map((f) => f.message),
    manualRequired: findings.filter((f) => f.level === 'manual').map((f) => f.message),
  }
}
