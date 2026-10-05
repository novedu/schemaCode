import type { RuntimeContext } from '@runtime-core/types'
import { createRuntimeContext } from '@runtime-core/runtime/runtime-context'

/**
 * BPM 节点预设（模拟 OA 审批流的三个处理节点）
 *
 * 上下文全部用核心工厂创建，节点只改变 task.node ——
 * FieldState 由 State Resolution Engine 重新推导，页面不自己记状态。
 */
export interface NodePreset {
  node: string
  label: string
  roles: string[]
  description: string
}

export const bpmNodePresets: NodePreset[] = [
  {
    node: 'employee_fill',
    label: '员工填写',
    roles: ['employee'],
    description: '申请人填写采购单，金额可编辑',
  },
  {
    node: 'manager_approve',
    label: '部门经理审批',
    roles: ['manager'],
    description: '经理审核，金额只读，大额需附发票',
  },
  {
    node: 'finance_approve',
    label: '财务审批',
    roles: ['finance'],
    description: '财务复核，金额只读',
  },
]

export function createNodeContext(preset: NodePreset): RuntimeContext {
  return createRuntimeContext({
    schemaVersion: 'v1',
    task: { taskId: 'PURCHASE-2026-1004', node: preset.node },
    user: { userId: 'u-1001', name: '张三', roles: preset.roles },
    permissions: { editable: true },
  })
}
