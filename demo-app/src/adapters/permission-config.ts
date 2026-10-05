import type { FieldStatePatch, StatePatchMap } from '@runtime-core/types'

/**
 * Permission Config 适配器（应用侧装配，非权限运行时实现）
 *
 * designer-app 产出的 permission.json 是声明式权限表：
 *
 *   { version, roles, entries: [{ field, role, patch }] }
 *
 * 本文件只做一件事：按"当前用户的角色集合"从条目表里挑选补丁、
 * 浅合并成 StatePatchMap。它不知道最终 FieldState 长什么样、
 * 不做 readonly→editable 的语义规范化、也不决定优先级——
 * 这一切仍由核心 FieldStateResolver 在合并 permission 来源时完成。
 *
 * 因此这里没有、也不允许出现按角色写死字段行为的 if(role)；
 * 角色与字段的关系全部存在 JSON 配置里，配置人员可视化维护。
 */

/** permission.json 文件契约（与设计器产物一致） */
export interface PermissionConfig {
  version: number
  roles: string[]
  entries: {
    field: string
    role: string
    patch: FieldStatePatch
  }[]
}

/**
 * 配置 + 当前角色 → 补丁表。
 *
 * 一个用户同时拥有多个角色时，命中条目按声明顺序合并，
 * 同字段同键后者覆盖（权限层内部不另设优先级魔法）。
 */
export function buildConfigPermissionPatches(
  config: PermissionConfig,
  activeRoles: string[],
): StatePatchMap {
  const roleSet = new Set(activeRoles)
  const patches: StatePatchMap = {}

  for (const entry of config.entries) {
    if (!roleSet.has(entry.role)) continue
    const current = patches[entry.field] ?? {}
    patches[entry.field] = { ...current, ...entry.patch }
  }

  return patches
}

/** 结构校验：加载文件时快速失败，不把坏数据送进 Resolver */
export function isPermissionConfig(value: unknown): value is PermissionConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.roles) &&
    Array.isArray(candidate.entries)
  )
}
