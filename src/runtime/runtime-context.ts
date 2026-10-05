import type { RuntimeContext } from '../types'

/**
 * RuntimeContext 适配层
 *
 * 后端上下文是嵌套结构（task / user / permissions），
 * 而条件树只能表达"字段 操作符 值"。本层把上下文拍平成条件事实：
 *
 *   ctx.task.node             string   当前 BPM 节点
 *   ctx.task.taskId           string
 *   ctx.permissions.editable  boolean  全局可编辑开关
 *   ctx.role.<roleName>       boolean 是否拥有该角色
 *   ctx.schemaVersion         string
 *
 * 拍平后规则作者不需要知道后端返回结构；后端字段变化时只改本适配层。
 */

/** 上下文字段名常量：规则与测试都引用常量，避免散落字符串 */
export const CTX = {
  node: 'ctx.task.node',
  taskId: 'ctx.task.taskId',
  editable: 'ctx.permissions.editable',
  schemaVersion: 'ctx.schemaVersion',
  /** 拼角色键：CTX.role('manager') → 'ctx.role.manager' */
  role: (name: string) => `ctx.role.${name}`,
} as const

export function toContextFacts(ctx: RuntimeContext): Record<string, unknown> {
  const facts: Record<string, unknown> = {
    [CTX.node]: ctx.task.node,
    [CTX.taskId]: ctx.task.taskId,
    [CTX.editable]: ctx.permissions.editable,
    [CTX.schemaVersion]: ctx.schemaVersion,
  }

  for (const role of ctx.user.roles) {
    facts[CTX.role(role)] = true
  }

  return facts
}

/** 工厂入参：各层都可省略，node 一旦给出即必填 */
export type RuntimeContextInput = {
  schemaVersion?: string
  task?: { taskId?: string; node: string }
  user?: Partial<RuntimeContext['user']>
  permissions?: Partial<RuntimeContext['permissions']>
}

/** 工厂：快速构造一份模拟后端下发的上下文（参数全可省） */
export function createRuntimeContext(partial: RuntimeContextInput = {}): RuntimeContext {
  return {
    schemaVersion: partial.schemaVersion ?? 'v1',
    task: {
      taskId: partial.task?.taskId ?? '10001',
      node: partial.task?.node ?? 'employee_fill',
    },
    user: {
      userId: partial.user?.userId,
      name: partial.user?.name,
      roles: partial.user?.roles ?? ['employee'],
    },
    permissions: {
      editable: partial.permissions?.editable ?? true,
    },
  }
}
