/**
 * Publish Validation（发布校验）
 *
 * 设计原则：
 *   1. 独立模块，不嵌入 PublishService —— PublishService 只负责状态跃迁；
 *   2. 纯函数，无副作用，输入 Bundle 输出 ValidationResult；
 *   3. 复用现有类型（Schema / Rule / PermissionConfig），不另造类型；
 *   4. 复用现有 ComponentMap（renderer/component-map.ts），不复制白名单；
 *   5. Error 与 Warning 语义分离：error 阻断发布，warning 仅提示。
 *
 * 校验范围（第一阶段）：
 *   - Schema Validation：字段唯一性、组件注册、layout 与 fields 一致性、布局层级合法性
 *   - Rule Validation：规则引用的字段存在性（条件 + 输出，递归 ConditionNode）
 *   - Permission Validation：权限配置引用的字段存在性
 */
import type { Schema, Rule, LayoutNode } from '../types'
import type { PermissionConfig, FormBundle } from '../../config-server/types'
import { componentMap } from '../renderer/component-map'

/* ─────────────────────── 统一结果模型 ─────────────────────── */

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  source?: {
    type: 'schema' | 'rule' | 'permission'
    id?: string
    field?: string
  }
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

/** 收集 error 数量 */
function hasError(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}

/* ─────────────────────── Schema Validation ─────────────────────── */

/**
 * Schema 结构校验：
 *   1. 字段名唯一性（DUPLICATE_FIELD_ID）
 *   2. 组件注册（UNKNOWN_COMPONENT）
 *   3. layout 引用的字段必须存在于 fields（LAYOUT_UNKNOWN_FIELD）
 *   4. layout 中字段不能重复出现（DUPLICATE_LAYOUT_FIELD）
 *   5. 布局层级合法性（Grid 不能直接含 Field/Container/Grid；Column 只能含 Field）
 */
export function validateSchema(schema: Schema): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const fieldNames = new Set<string>()

  // 1. 字段名唯一性
  for (const field of schema.fields) {
    if (fieldNames.has(field.name)) {
      issues.push({
        code: 'DUPLICATE_FIELD_ID',
        severity: 'error',
        message: `字段 ID "${field.name}" 重复`,
        source: { type: 'schema', field: field.name },
      })
    }
    fieldNames.add(field.name)
  }

  // 2. 组件注册检查（复用现有 ComponentMap）
  //    SubForm 是结构性组件（type='object' 且含 subForm），不需要注册到 ComponentMap
  for (const field of schema.fields) {
    if (field.component && !field.subForm && !componentMap[field.component]) {
      issues.push({
        code: 'UNKNOWN_COMPONENT',
        severity: 'error',
        message: `字段 "${field.name}" 引用了未注册的组件 "${field.component}"`,
        source: { type: 'schema', field: field.name },
      })
    }
  }

  // 3-5. layout 与 fields 一致性 + 层级合法性
  if (schema.layout?.length) {
    const layoutFields = new Set<string>()
    validateLayoutNodes(schema.layout, fieldNames, layoutFields, issues, 'root')
  }

  return issues
}

/** 递归校验 layout 节点 */
function validateLayoutNodes(
  nodes: LayoutNode[],
  fieldNames: Set<string>,
  layoutFields: Set<string>,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  for (const node of nodes) {
    const path = parentPath === 'root' ? node.kind : `${parentPath} > ${node.kind}`

    // 3. layout 引用的字段必须存在于 fields
    if (node.kind === 'field') {
      if (!fieldNames.has(node.field)) {
        issues.push({
          code: 'LAYOUT_UNKNOWN_FIELD',
          severity: 'error',
          message: `Layout 引用了不存在的字段 "${node.field}"`,
          source: { type: 'schema', field: node.field },
        })
      }
      // 4. layout 中字段不能重复出现
      if (layoutFields.has(node.field)) {
        issues.push({
          code: 'DUPLICATE_LAYOUT_FIELD',
          severity: 'error',
          message: `字段 "${node.field}" 在 Layout 中重复出现`,
          source: { type: 'schema', field: node.field },
        })
      }
      layoutFields.add(node.field)
    }

    // 5. 布局层级合法性
    if (node.kind === 'grid') {
      // Grid 不能直接含 Field/Container/Grid，只能含 Column
      for (const col of node.columns) {
        for (const child of col.children) {
          if (child.kind !== 'field') {
            issues.push({
              code: 'INVALID_LAYOUT_HIERARCHY',
              severity: 'error',
              message: `Grid 的 Column 只能包含 Field，不允许嵌套 ${child.kind}`,
              source: { type: 'schema' },
            })
          }
        }
      }
    }

    // 递归下钻
    if (node.kind === 'container') {
      validateLayoutNodes(node.children, fieldNames, layoutFields, issues, path)
    }
    // Grid 的 Column 已在上面处理，不再递归（Column 不是 LayoutNode）
  }
}

/* ─────────────────────── Rule Validation ─────────────────────── */

/**
 * Rule 校验：
 *   - 条件树（when）中引用的字段必须存在（RULE_UNKNOWN_INPUT_FIELD，递归）
 *   - 输出（then）中引用的字段必须存在（RULE_UNKNOWN_OUTPUT_FIELD）
 */
export function validateRules(schema: Schema, rules: Rule[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const fieldNames = new Set(schema.fields.map((f) => f.name))

  for (const rule of rules) {
    // 递归检查条件树
    validateConditionNode(rule.when, fieldNames, rule.name, issues)

    // 检查输出字段
    for (const fieldName of Object.keys(rule.then)) {
      if (!fieldNames.has(fieldName)) {
        issues.push({
          code: 'RULE_UNKNOWN_OUTPUT_FIELD',
          severity: 'error',
          message: `Rule "${rule.name}" 的输出引用了不存在的字段 "${fieldName}"`,
          source: { type: 'rule', id: rule.name, field: fieldName },
        })
      }
    }
  }

  return issues
}

/** 递归遍历 ConditionNode，提取所有 field 引用 */
function validateConditionNode(
  node: import('../types').ConditionNode,
  fieldNames: Set<string>,
  ruleName: string,
  issues: ValidationIssue[],
): void {
  if (node.kind === 'condition') {
    if (!fieldNames.has(node.field)) {
      issues.push({
        code: 'RULE_UNKNOWN_INPUT_FIELD',
        severity: 'error',
        message: `Rule "${ruleName}" 的条件引用了不存在的字段 "${node.field}"`,
        source: { type: 'rule', id: ruleName, field: node.field },
      })
    }
    return
  }

  // ConditionGroup：递归 children
  for (const child of node.children) {
    validateConditionNode(child, fieldNames, ruleName, issues)
  }
}

/* ─────────────────────── Permission Validation ─────────────────────── */

/**
 * Permission 校验：
 *   - 权限配置中引用的字段必须存在（PERMISSION_UNKNOWN_FIELD）
 */
export function validatePermissions(schema: Schema, permissions: PermissionConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const fieldNames = new Set(schema.fields.map((f) => f.name))

  for (const entry of permissions.entries) {
    if (!fieldNames.has(entry.field)) {
      issues.push({
        code: 'PERMISSION_UNKNOWN_FIELD',
        severity: 'error',
        message: `Permission 配置引用了不存在的字段 "${entry.field}"`,
        source: { type: 'permission', field: entry.field },
      })
    }
  }

  return issues
}

/* ─────────────────────── 统一入口 ─────────────────────── */

/**
 * 校验完整 FormBundle（Schema + Rules + Permissions）
 *
 * 返回 ValidationResult：
 *   - valid = !hasError(issues)
 *   - issues 按校验顺序合并（schema → rule → permission）
 */
export function validateFormBundle(bundle: FormBundle): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateSchema(bundle.schema),
    ...validateRules(bundle.schema, bundle.rules),
    ...validatePermissions(bundle.schema, bundle.permissions),
  ]

  return {
    valid: !hasError(issues),
    issues,
  }
}
