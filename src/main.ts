import { schema } from './schema'
import { rules } from './rules'
import { warningRules } from './rules/warning-rules'
import { RuleScheduler } from './scheduler/rule-scheduler'
import { validateForm } from './validation/validator'
import type { FormData } from './types'

/* ───────────────── 全量引导：queue 初始为全部输入字段 ───────────────── */

function runCase(title: string, data: FormData) {
  console.log('═'.repeat(64))
  console.log(title)
  console.log('─'.repeat(64))
  console.log('② FormData :', JSON.stringify(data))

  const scheduler = new RuleScheduler(schema, rules)
  const { fieldStates, trace } = scheduler.schedule(data)

  console.log('③ 调度轨迹 :')
  for (const step of trace) {
    const fired = step.firedRules.length > 0 ? `触发[${step.firedRules.join('，')}] ` : '无触发 '
    const changed = step.changedFields.length > 0
      ? `变化→${step.changedFields.join('、')} 入队[${step.enqueuedFields.join('，')}]`
      : '无状态变化'
    console.log(`   ↓ 出队 ${step.candidateRules.length === 0 ? '(无依赖)' : ''}${step.dequeued.padEnd(18)} ${fired}${changed}`)
  }

  console.log('④ 公司名称 :', JSON.stringify(fieldStates.companyName))
  console.log('   VIP 标识:', JSON.stringify(fieldStates.vipTag))

  const result = validateForm(schema, data, fieldStates)
  console.log('校验结果   :', result.valid
    ? '通过 ✅'
    : `不通过 ❌ -> ${result.errors.map((e) => e.message).join('、')}`)
  console.log()
}

runCase('情形一：person，公司名称留空，注册资本 0', {
  customerType: 'person',
  companyName: '',
  registeredCapital: 0,
  amount: 0,
  approveComment: '',
})

runCase('情形二：company，公司名称留空，注册资本 0', {
  customerType: 'company',
  companyName: '',
  registeredCapital: 0,
  amount: 0,
  approveComment: '',
})

runCase('情形三：company，已填写公司名称，注册资本 500', {
  customerType: 'company',
  companyName: '某某科技有限公司',
  registeredCapital: 500,
  amount: 0,
  approveComment: '',
})

runCase('情形四：company，公司名称留空，注册资本 2000', {
  customerType: 'company',
  companyName: '',
  registeredCapital: 2000,
  amount: 0,
  approveComment: '',
})

/* ───────────────── 增量调度：queue 初始只有变化字段 ───────────────── */

console.log('═'.repeat(64))
console.log('增量调度演示：用户把客户类型从 person 切换为 company')
console.log('─'.repeat(64))

const scheduler = new RuleScheduler(schema, rules)

const personData: FormData = { customerType: 'person', companyName: '', registeredCapital: 0, amount: 0, approveComment: '' }
const initial = scheduler.schedule(personData) // 先引导到 person 稳态
console.log('初始状态（person）: 公司名称', JSON.stringify(initial.fieldStates.companyName))

// 只告诉调度器：customerType 变了（而不是重跑全部规则）
const companyData: FormData = { customerType: 'company', companyName: '', registeredCapital: 0, amount: 0, approveComment: '' }
const { firedRules, trace } = scheduler.schedule(companyData, ['customerType'])

console.log('增量轨迹 :')
for (const step of trace) {
  const detail = step.changedFields.length > 0
    ? `变化→${step.changedFields.join('、')} 入队[${step.enqueuedFields.join('，')}]`
    : '无状态变化'
  console.log(`   ↓ 出队 ${step.dequeued.padEnd(18)} 触发[${step.firedRules.join('，') || '无'}] ${detail}`)
}
console.log('触发规则 :', firedRules.join(' → '))
console.log()

/* ═════════ OA 低代码 Runtime：RuntimeContext + ComponentMap ═════════ */

import { createRuntimeContext } from './runtime/runtime-context'
import { oaRules } from './rules/oa-rules'
import { renderForm } from './renderer/renderer'

function runOACase(
  title: string,
  ctx: ReturnType<typeof createRuntimeContext>,
  data: FormData,
) {
  console.log('═'.repeat(64))
  console.log(title)
  console.log('─'.repeat(64))
  console.log('上下文   :', `节点=${ctx.task.node}`, `角色=[${ctx.user.roles.join(',')}]`, `editable=${ctx.permissions.editable}`)
  console.log('金额     :', data.amount)

  // RuntimeContext 作为规则输入，调度器增量推理
  const oaScheduler = new RuleScheduler(schema, oaRules)
  const { fieldStates, firedRules: fired } = oaScheduler.schedule(data, undefined, ctx)
  console.log('命中规则 :', fired.join('；') || '(无)')
  console.log('amount   :',
    `editable=${fieldStates.amount.editable}`,
    `readonly=${fieldStates.amount.readonly}`,
    `disabled=${fieldStates.amount.disabled}`,
    `required=${fieldStates.amount.required}`)
  if (fieldStates.amount.warnings.length > 0) {
    console.log('warnings :', fieldStates.amount.warnings.join('；'))
  }
  console.log('审批意见 :', `visible=${fieldStates.approveComment.visible}`, `required=${fieldStates.approveComment.required}`)

  // Renderer：FieldState + 数据 → Vue VNode
  const nodes = renderForm(schema, data, fieldStates)
  console.log('渲染输出 :', nodes.map((n) => {
    const name = (n.vnode.type as { name?: string }).name
    const readonly = n.vnode.props?.readonly ? ' readonly' : ''
    const disabled = n.vnode.props?.disabled ? ' disabled' : ''
    return `<${name}${readonly}${disabled}/>`
  }).join(' '))

  const result = validateForm(schema, data, fieldStates)
  console.log('校验结果 :', result.valid ? '通过 ✅' : `不通过 ❌ -> ${result.errors.map((e) => e.message).join('、')}`)
  console.log()
}

const oaBase = { customerType: 'person' as const, companyName: '', registeredCapital: 0, approveComment: '' }

// 场景 1+3：员工填写，金额 6800（可编辑 + warning）
runOACase(
  'OA 场景一：员工填写节点，金额 6800',
  createRuntimeContext({ task: { node: 'employee_fill' }, user: { roles: ['employee'] } }),
  { ...oaBase, amount: 6800 },
)

// 场景 2+4：经理审批，金额 6800（只读 + warning + 审批意见必填）
runOACase(
  'OA 场景二：经理审批节点，金额 6800',
  createRuntimeContext({ task: { node: 'manager_approve' }, user: { roles: ['manager'] } }),
  { ...oaBase, amount: 6800 },
)

// 场景 4：后端下发只读实例，员工节点金额禁用
runOACase(
  'OA 场景三：只读实例（permissions.editable=false）',
  createRuntimeContext({
    task: { node: 'employee_fill' },
    user: { roles: ['employee'] },
    permissions: { editable: false },
  }),
  { ...oaBase, amount: 1200 },
)

/* ═══════ State Resolution Engine：四来源 → 决策 → 最终 FieldState ═══════ */

import { resolveOAFieldStates } from './state-resolution/oa-state-runtime'

function runResolutionCase(
  title: string,
  ctx: ReturnType<typeof createRuntimeContext>,
  data: FormData,
) {
  console.log('═'.repeat(64))
  console.log(title)
  console.log('─'.repeat(64))
  console.log('上下文 :', `节点=${ctx.task.node}`, `角色=[${ctx.user.roles.join(',')}]`, `editable=${ctx.permissions.editable}`)
  console.log('金额   :', data.amount)

  const { fieldStates, traces } = resolveOAFieldStates(schema, data, ctx, { trace: true })

  console.log('amount 最终状态:',
    `editable=${fieldStates.amount.editable}`,
    `readonly=${fieldStates.amount.readonly}`,
    `disabled=${fieldStates.amount.disabled}`)
  if (fieldStates.amount.warnings.length > 0) {
    console.log('warnings :', fieldStates.amount.warnings.join('；'))
  }

  // 决策来源：每个键最终由谁拍板
  const amountTrace = traces.find((t) => t.field === 'amount')
  if (amountTrace) {
    const pairs = Object.entries(amountTrace.decidedBy)
      .map(([key, by]) => `${key}←${by}`)
      .join('，')
    console.log('决策来源:', pairs)
  }
  console.log()
}

// 演示一：员工填写节点
runResolutionCase(
  'State Resolution 演示一：员工填写节点',
  createRuntimeContext({ task: { node: 'employee_fill' }, user: { roles: ['employee'] } }),
  { ...oaBase, amount: 3000 },
)

// 演示二：经理审批节点
runResolutionCase(
  'State Resolution 演示二：经理审批节点',
  createRuntimeContext({ task: { node: 'manager_approve' }, user: { roles: ['manager'] } }),
  { ...oaBase, amount: 3000 },
)

// 演示三：金额超过 5000，warnings 与只读叠加
runResolutionCase(
  'State Resolution 演示三：经理节点 + 金额 6000（warning 与只读共存）',
  createRuntimeContext({ task: { node: 'manager_approve' }, user: { roles: ['manager'] } }),
  { ...oaBase, amount: 6000 },
)

/* ═════════ Schema Version Runtime：多版本并存 ═════════ */

import { SchemaRegistry } from './schema-version/schema-registry'
import { SchemaVersionResolver } from './schema-version/schema-version-resolver'
import { orderFormV1, orderFormV2 } from './schema-version/order-form-schemas'
import { provideSchemaState } from './state-resolution/schema-state-provider'
import { provideRuleState } from './state-resolution/rule-state-provider'
import { provideBpmState } from './state-resolution/bpm-state-provider'
import { providePermissionState } from './state-resolution/permission-state-provider'
import { resolveFieldStates } from './state-resolution/field-state-resolver'

/**
 * 版本运行时完整链路（与测试中的集成路径一致）：
 *
 *   后端响应 → VersionResolver/Registry 选出 Schema
 *          → 四 Provider + StateResolver 决策
 *          → Renderer 产出 VNode
 *
 * 全链路没有任何版本分支判断。
 */
function runVersionCase(
  title: string,
  backend: { taskId: string; formId: string; schemaVersion?: string },
  amount: number,
) {
  const registry = new SchemaRegistry()
  // 模拟发布时序：v1 先发布（历史任务在此期间创建），v2 后发布
  registry.register('orderForm', 'v1', orderFormV1)
  registry.register('orderForm', 'v2', orderFormV2)

  const resolver = new SchemaVersionResolver(registry)
  const resolution = resolver.bindBackendTask(backend)

  console.log('═'.repeat(64))
  console.log(title)
  console.log('─'.repeat(64))
  console.log('后端版本 :', backend.schemaVersion ?? '(未指定 → 新建解析最新)')
  console.log('实际绑定 :', `${resolution.formId}@${resolution.version}`, resolution.pinned ? '(历史冻结)' : '(latest)')

  const data: FormData = {
    customerType: 'person',
    companyName: '',
    registeredCapital: 0,
    amount,
    approveComment: '',
  }
  const ctx = createRuntimeContext({
    task: { taskId: backend.taskId, node: 'employee_fill' },
    user: { roles: ['employee'] },
  })

  const { fieldStates } = resolveFieldStates(resolution.schema, [
    { name: 'schema', patches: provideSchemaState(resolution.schema) },
    { name: 'rule', patches: provideRuleState(warningRulesForMain(), data, ctx) },
    { name: 'bpm', patches: provideBpmState(ctx) },
    { name: 'permission', patches: providePermissionState(ctx) },
  ])

  const nodes = renderForm(resolution.schema, data, fieldStates)
  console.log('页面字段 :', nodes.map((n) => {
    const name = (n.vnode.type as { name?: string }).name
    return `${n.field}<${name}>`
  }).join('  '))
  if (fieldStates.amount.warnings.length > 0) {
    console.log('warnings :', fieldStates.amount.warnings.join('；'))
  }
  console.log()
}

/** warning 规则（惰性引用，保持 main 顶部结构不变） */
function warningRulesForMain() {
  return warningRules
}

// 场景 1：历史任务（2026-01 创建，冻结在 v1）→ 页面只有 amount
runVersionCase(
  'Schema Version 场景一：旧任务，后端返回 v1',
  { taskId: '10001', formId: 'orderForm', schemaVersion: 'v1' },
  6000,
)

// 场景 2：新任务（2026-02 之后创建，后端返回 v2）→ amount + currency
runVersionCase(
  'Schema Version 场景二：新任务，后端返回 v2',
  { taskId: '20001', formId: 'orderForm', schemaVersion: 'v2' },
  6000,
)

// 场景 3：新建时后端不带版本 → 自动绑定 latest=v2
runVersionCase(
  'Schema Version 场景三：新建无版本 → 自动 latest',
  { taskId: '20002', formId: 'orderForm' },
  3000,
)

/* ═════════ Migration Engine：离线迁移校验（不执行、不改数据） ═════════ */

import { MigrationRegistry } from './migration/migration-registry'
import { validateMigrationPlan } from './migration/migration-validator'
import {
  migrationOrderV1,
  migrationOrderV2,
  migrationSampleData,
  orderMigrationPlan,
} from './migration/demo/order-migration-schemas'

console.log('═'.repeat(64))
console.log('Migration 演示：orderForm v1 → v2 安全校验')
console.log('─'.repeat(64))

// ① 注册迁移路径（同一路径重复注册会 fail fast）
const migrationRegistry = new MigrationRegistry()
migrationRegistry.register(orderMigrationPlan)
const registeredPlan = migrationRegistry.getMigration('orderForm', 'v1', 'v2')

console.log('历史样本数据（校验前）:', JSON.stringify({ amount: migrationSampleData.amount }))
console.log('字段映射 :')
for (const mapping of registeredPlan.fieldMappings) {
  console.log(`   ${mapping.source}`)
  console.log('     ↓'.padStart(8), `[${mapping.transform}]`)
  console.log(`   ${mapping.target}`)
}
console.log('默认值   :')
for (const d of registeredPlan.defaults) {
  console.log(`   ${d.field} = ${JSON.stringify(d.value)}`)
}

// ② 运行五类检查，产出可审计报告
const migrationReport = validateMigrationPlan(orderMigrationPlan, {
  sourceSchema: migrationOrderV1,
  targetSchema: migrationOrderV2,
  sampleData: migrationSampleData,
  context: createRuntimeContext({
    task: { taskId: '10001', node: 'employee_fill' },
    user: { roles: ['employee'] },
  }),
  permissionConfiguredFields: [],
})

console.log('检查结果 :')
for (const check of migrationReport.checks) {
  const icon = check.status === 'pass' ? 'PASS'
    : check.status === 'warning' ? 'WARN'
    : check.status === 'manual' ? 'MANUAL'
    : 'FAIL'
  const detail = check.detail ? ` — ${check.detail}` : ''
  console.log(`   [${icon.padEnd(6)}] ${check.name}${detail}`)
}

console.log('最终状态 :', migrationReport.status.toUpperCase())
if (migrationReport.warnings.length > 0) {
  console.log('风险提示 :', migrationReport.warnings.join('；'))
}
if (migrationReport.manualRequired.length > 0) {
  console.log('人工处理 :', migrationReport.manualRequired.join('；'))
}

// ③ 关键断言演示：Migration 是旁路，历史数据原样保留
console.log('历史样本数据（校验后）:', JSON.stringify({ amount: migrationSampleData.amount }),
  '(未修改)')
console.log()

/* ═════════ Migration Execution Simulator：内存模拟执行 ═════════ */

import { MigrationExecutor } from './migration/execution/migration-executor'

console.log('═'.repeat(64))
console.log('Migration Execution 演示：经人工批准后，内存模拟执行 v1 → v2')
console.log('─'.repeat(64))

const executor = new MigrationExecutor()

// 执行器只在内存克隆上工作；dryRun 显式传 false（默认是 true）
const executionReport = executor.execute(
  registeredPlan,
  migrationReport, // 上一阶段产出的校验报告（warning 不阻塞）
  migrationSampleData,
  { dryRun: false },
)

console.log('执行状态 :', executionReport.status.toUpperCase(), '| dryRun =', executionReport.dryRun)
console.log('迁移结果 :', JSON.stringify(executionReport.migratedData))
console.log('操作日志 :')
for (const op of executionReport.operations ?? []) {
  const route = op.sourceField ? `${op.sourceField} → ${op.targetField}` : op.targetField
  console.log(
    `   [${op.action.padEnd(9)}] ${route}`,
    `before=${JSON.stringify(op.before)}`,
    `after=${JSON.stringify(op.after)}`,
  )
}

// 幂等演示：同一迁移路径重复执行被拒绝
const repeated = executor.execute(registeredPlan, migrationReport, migrationSampleData, { dryRun: false })
console.log('重复执行 :', repeated.status, '(同一 migrationId 不重复转换)')

console.log('源数据   :', JSON.stringify({ amount: migrationSampleData.amount }), '(历史数据始终未改)')
console.log()
