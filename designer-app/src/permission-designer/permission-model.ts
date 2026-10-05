import type { FieldState } from '@runtime-core/types'

/**
 * Permission Model（权限设计器模型）
 *
 * 与 Schema / Rule Designer 同一条建模纪律：
 *
 *   1. 设计期结构 = 导出契约 + 编辑用 id；
 *   2. 变更全部走纯不可变函数，store 只替换引用；
 *   3. 导出时剥离编辑字段，产物 permission.json 是声明式权限表，
 *      由宿主适配器按当前角色挑选补丁、交给核心 FieldStateResolver
 *      裁决 —— 设计器不复制任何权限运行时逻辑。
 *
 * Patch 语义是本文件的第一原则：
 *   作者没有明确表态的状态键，绝不生成默认值。
 *   未出现 = 不表态，最终值交给基线与其他来源裁决。
 */

/** 权限补丁开放的四个状态键（不含 required——必填不是安全权限） */
export type PermissionStateKey = 'editable' | 'readonly' | 'disabled' | 'visible'

/** 字段权限补丁（稀疏：只有作者显式选择的键） */
export type PermissionPatch = Partial<Pick<FieldState, PermissionStateKey>>

/** 预置角色（不可删除） */
export const PRESET_ROLES = ['employee', 'manager', 'finance'] as const

/** 设计期权限条目（= 导出 entry + 编辑用 id） */
export interface PermissionEntry {
  id: string
  field: string
  role: string
  patch: PermissionPatch
}

/** 权限设计文档 */
export interface PermissionDoc {
  id: string
  /** 角色集合（预置三个 + 作者自定义） */
  roles: string[]
  entries: PermissionEntry[]
}

/* ─────────────────────── ID ─────────────────────── */

let entrySeq = 0

export function createEntryId(): string {
  entrySeq += 1
  return `pe_${Date.now().toString(36)}_${entrySeq}`
}

/* ─────────────────────── 工厂 ─────────────────────── */

/** 新建权限文档：预置三个角色、无条目（零默认权限） */
export function createPermissionDoc(): PermissionDoc {
  return {
    id: `pd_${Date.now().toString(36)}`,
    roles: [...PRESET_ROLES],
    entries: [],
  }
}

/* ─────────────────────── 查询 ─────────────────────── */

/** 查找 字段×角色 的条目（没有则 null） */
export function findEntry(
  entries: PermissionEntry[],
  field: string,
  role: string,
): PermissionEntry | null {
  return entries.find((e) => e.field === field && e.role === role) ?? null
}

/* ─────────────────────── 状态写入（稀疏补丁） ─────────────────────── */

/**
 * 设置某字段在某角色下的一个状态键：
 *   - value=true/false → 写入补丁；
 *   - value=undefined  → 从补丁摘掉该键（"不表态"）；
 *   - 摘空后整条 entry 删除，产物里不留空 patch。
 *
 * 纯不可变：返回新的 entries 数组。
 */
export function setPermissionState(
  entries: PermissionEntry[],
  field: string,
  role: string,
  key: PermissionStateKey,
  value: boolean | undefined,
): PermissionEntry[] {
  if (!field || !role) return entries

  const existing = findEntry(entries, field, role)
  const nextPatch: PermissionPatch = { ...(existing?.patch ?? {}) }

  if (value === undefined) delete nextPatch[key]
  else nextPatch[key] = value

  // 补丁为空 → 删除条目（Patch 语义：空补丁不是"全部禁止"，是沉默）
  if (Object.keys(nextPatch).length === 0) {
    return entries.filter((e) => e.id !== existing?.id)
  }

  if (existing) {
    return entries.map((e) =>
      e.id === existing.id ? { ...e, patch: nextPatch } : e,
    )
  }

  return [
    ...entries,
    { id: createEntryId(), field, role, patch: nextPatch },
  ]
}

/* ─────────────────────── 角色管理 ─────────────────────── */

/** 新增自定义角色（重名忽略） */
export function addRole(roles: string[], role: string): string[] {
  const normalized = role.trim()
  if (!normalized || roles.includes(normalized)) return roles
  return [...roles, normalized]
}

/** 删除角色：预置角色不可删；同时删除该角色的全部条目 */
export function removeRole(
  doc: PermissionDoc,
  role: string,
): PermissionDoc {
  if ((PRESET_ROLES as readonly string[]).includes(role)) return doc
  return {
    ...doc,
    roles: doc.roles.filter((r) => r !== role),
    entries: doc.entries.filter((e) => e.role !== role),
  }
}

/* ─────────────────────── 角色→补丁选择（配置查找，非运行时逻辑） ─────────────────────── */

/**
 * 按"当前生效角色集合"从条目表挑选并合并补丁：
 *
 *   field → 合并后的 PermissionPatch
 *
 * 这只是声明式配置的查表 + 补丁浅合并（普通键后者覆盖），
 * 不知道 FieldState 长什么样、不做语义规范化——
 * 真正的状态裁决与规范化仍由核心 FieldStateResolver 完成。
 */
export function selectPatchesForRoles(
  entries: PermissionEntry[],
  activeRoles: string[],
): Record<string, PermissionPatch> {
  const roleSet = new Set(activeRoles)
  const result: Record<string, PermissionPatch> = {}

  // 条目顺序即配置声明顺序，同键后者覆盖（配置内不引入优先级魔法）
  for (const entry of entries) {
    if (!roleSet.has(entry.role)) continue
    result[entry.field] = { ...result[entry.field], ...entry.patch }
  }

  return result
}
