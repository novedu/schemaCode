import {
  createEntryId,
  PRESET_ROLES,
  type PermissionDoc,
  type PermissionEntry,
  type PermissionPatch,
  type PermissionStateKey,
} from './permission-model'

/**
 * Permission Builder（权限产物装配）
 *
 * 设计期 PermissionDoc → permission.json。
 * 产物是一张声明式权限表（版本 + 角色 + 稀疏条目），
 * 不是自定义的"权限引擎"：demo-app 加载后由适配器按角色挑选补丁，
 * 交给核心 FieldStateResolver 裁决。
 */

export const PERMISSION_CONFIG_VERSION = 1

/** permission.json 文件契约 */
export interface PermissionConfig {
  version: number
  roles: string[]
  /** 每条 = 某字段在某角色下的稀疏补丁（示例形状见需求） */
  entries: {
    field: string
    role: string
    patch: PermissionPatch
  }[]
}

/** 文档 → 导出配置（剥离编辑用 id） */
export function buildPermissionConfig(doc: PermissionDoc): PermissionConfig {
  return {
    version: PERMISSION_CONFIG_VERSION,
    roles: doc.roles,
    entries: doc.entries.map(({ field, role, patch }) => ({ field, role, patch })),
  }
}

/* ─────────────────────── 校验 ─────────────────────── */

export interface PermissionValidation {
  valid: boolean
  errors: string[]
}

const ALLOWED_KEYS: readonly PermissionStateKey[] = [
  'editable',
  'readonly',
  'disabled',
  'visible',
]

/**
 * 导出前静态校验：
 *   - 角色集合非空；
 *   - 每条条目字段/角色齐全、patch 至少一个键且值均为布尔；
 *   - 条目引用的角色必须在 roles 中。
 */
export function validatePermissionDoc(doc: PermissionDoc): PermissionValidation {
  const errors: string[] = []

  if (doc.roles.length === 0) errors.push('角色集合为空')

  for (const entry of doc.entries) {
    if (!entry.field || !entry.role) {
      errors.push('存在字段或角色缺失的条目')
      break
    }
    const keys = Object.keys(entry.patch)
    if (keys.length === 0) {
      errors.push(`字段 ${entry.field}（${entry.role}）存在空补丁`)
      break
    }
    const badKey = keys.find((k) => !ALLOWED_KEYS.includes(k as PermissionStateKey))
    if (badKey) {
      errors.push(`字段 ${entry.field} 出现不支持的状态键：${badKey}`)
      break
    }
    const badValue = keys.find((k) => typeof entry.patch[k as PermissionStateKey] !== 'boolean')
    if (badValue) {
      errors.push(`字段 ${entry.field} 的 ${badValue} 必须是布尔值`)
      break
    }
    if (!doc.roles.includes(entry.role)) {
      errors.push(`条目引用了不存在的角色：${entry.role}`)
      break
    }
  }

  return { valid: errors.length === 0, errors }
}

/* ─────────────────────── 反向解析（导入继续设计） ─────────────────────── */

/**
 * permission.json → 设计期文档。
 * 预置角色若缺失自动补齐（保证三角色永远可配置）；
 * 结构非法时抛错，由调用方提示作者。
 */
export function permissionConfigToDoc(config: PermissionConfig): PermissionDoc {
  if (!config || !Array.isArray(config.roles) || !Array.isArray(config.entries)) {
    throw new Error('permission.json 结构无法识别')
  }

  const roles = [...new Set([...PRESET_ROLES, ...config.roles])]

  const entries: PermissionEntry[] = config.entries.map((entry) => {
    if (!entry.field || !entry.role || typeof entry.patch !== 'object') {
      throw new Error('permission.json 中存在非法条目')
    }
    return {
      id: createEntryId(),
      field: entry.field,
      role: entry.role,
      patch: entry.patch,
    }
  })

  return {
    id: `pd_${Date.now().toString(36)}`,
    roles,
    entries,
  }
}
