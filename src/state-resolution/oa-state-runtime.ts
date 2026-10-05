import type {
  FormData,
  Rule,
  RuntimeContext,
  Schema,
  StateSource,
} from '../types'
import { rules as businessRules } from '../rules'
import { warningRules } from '../rules/warning-rules'
import { provideSchemaState } from './schema-state-provider'
import { provideRuleState } from './rule-state-provider'
import { provideBpmState } from './bpm-state-provider'
import { providePermissionState } from './permission-state-provider'
import {
  resolveFieldStates,
  type ResolveOptions,
  type ResolveResult,
} from './field-state-resolver'

/**
 * OA State Runtime（字段状态决策链路编排）
 *
 * 单向数据流，链路中没有任何反向依赖：
 *
 *   Schema        → SchemaStateProvider    ┐
 *   RuleEngine*   → RuleStateProvider      │（*这里指业务规则的全量求值）
 *   RuntimeContext→ BpmStateProvider      ├→ State Resolution Engine
 *   权限上下文    → PermissionStateProvider┘        → Final FieldState → Renderer
 *
 * 规则来源只包含业务规则（显隐联动 + warning）；
 * BPM 与权限各有独立 Provider，不进 RuleStateProvider，
 * 保证同一限制不会被双重计入。
 */

/** 默认业务规则集：原始字段联动规则 + 金额预警规则 */
const DEFAULT_BUSINESS_RULES: Rule[] = [...businessRules, ...warningRules]

export function resolveOAFieldStates(
  schema: Schema,
  data: FormData,
  context: RuntimeContext,
  options: ResolveOptions = {},
  businessRulesForRun: Rule[] = DEFAULT_BUSINESS_RULES,
): ResolveResult {
  const sources: StateSource[] = [
    { name: 'schema', patches: provideSchemaState(schema) },
    {
      name: 'rule',
      patches: provideRuleState(businessRulesForRun, data, context),
    },
    { name: 'bpm', patches: provideBpmState(context) },
    { name: 'permission', patches: providePermissionState(context) },
  ]

  return resolveFieldStates(schema, sources, options)
}
