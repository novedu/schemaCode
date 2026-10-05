import type { Rule, Schema } from '@runtime-core/types'
import { useDesignerStore } from './store/designer-store'
import { useRuleStore } from './rule-designer/rule-store'
import { usePermissionStore } from './permission-designer/permission-store'
import type { PermissionConfig } from './permission-designer/permission-builder'

/**
 * 统一产物导出（三个设计器的共同出口）
 *
 *   currentSchema    （核心 Schema）   → schema.json
 *   currentRules     （核心 Rule[]）    → rules.json
 *   currentPermission（声明式权限表）   → permission.json
 *
 * 三个设计器各自维护自己的文档，导出时在这里装配成 bundle：
 * 同时写入 localStorage（浏览器保存）并触发三个文件下载。
 * Schema/Rule 是 Runtime Core 原生类型；permission.json 是
 * 宿主权限配置，由 demo-app 适配器按角色挑选后交给核心 Resolver。
 */

const BUNDLE_STORAGE_KEY = 'low-code-designer/export/v1'

export interface DesignerBundle {
  schema: Schema
  rules: Rule[]
  permission: PermissionConfig
}

/** 读取当前完整产物（实时快照，普通对象，非响应式代理） */
export function getDesignerBundle(): DesignerBundle {
  return {
    schema: useDesignerStore().currentSchema.value,
    rules: useRuleStore().currentRules.value,
    permission: usePermissionStore().currentPermission.value,
  }
}

/** 导出 bundle：localStorage + 三个文件下载 */
export function exportDesignerBundle(): DesignerBundle {
  const bundle = getDesignerBundle()

  try {
    localStorage.setItem(BUNDLE_STORAGE_KEY, JSON.stringify(bundle))
  } catch {
    // 存储不可用时下载仍然成立
  }

  downloadFile('schema.json', JSON.stringify(bundle.schema, null, 2))
  downloadFile('rules.json', JSON.stringify(bundle.rules, null, 2))
  downloadFile('permission.json', JSON.stringify(bundle.permission, null, 2))

  return bundle
}

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
