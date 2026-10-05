import { computed, reactive } from 'vue'
import {
  addRole,
  createPermissionDoc,
  removeRole,
  setPermissionState,
  type PermissionDoc,
  type PermissionStateKey,
} from './permission-model'
import {
  buildPermissionConfig,
  permissionConfigToDoc,
  type PermissionConfig,
} from './permission-builder'

/**
 * Permission Store（权限文档响应式薄封装）
 *
 * 与 designer / rule store 同构：纯函数承担变更逻辑，
 * store 只替换引用 + localStorage 持久化。
 *
 * 导出物 permission.json 由 computed 实时派生：
 * 改一个角色的一个状态，产物与预览下一拍即更新。
 */

const STORAGE_KEY = 'low-code-designer/permission/v1'

interface PermissionStoreState {
  doc: PermissionDoc
  /** 当前正在编辑的角色 */
  selectedRole: string
}

function loadDocument(): PermissionDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PermissionDoc
      if (Array.isArray(parsed.roles) && Array.isArray(parsed.entries)) {
        return parsed
      }
    }
  } catch {
    // 数据损坏时回退空文档
  }
  return createPermissionDoc()
}

const state = reactive<PermissionStoreState>({
  doc: loadDocument(),
  selectedRole: 'employee',
})

/* ── 派生 ── */

/** 当前权限配置（permission.json 内容，实时） */
const currentPermission = computed<PermissionConfig>(() =>
  buildPermissionConfig(state.doc),
)

/* ── 动作 ── */

function selectRole(role: string): void {
  state.selectedRole = role
}

function setFieldState(
  field: string,
  key: PermissionStateKey,
  value: boolean | undefined,
): void {
  state.doc.entries = setPermissionState(
    state.doc.entries,
    field,
    state.selectedRole,
    key,
    value,
  )
  persist()
}

function addCustomRole(role: string): void {
  const next = addRole(state.doc.roles, role)
  if (next !== state.doc.roles) {
    state.doc.roles = next
    state.selectedRole = role.trim()
    persist()
  }
}

function deleteRole(role: string): void {
  state.doc = removeRole(state.doc, role)
  if (state.selectedRole === role) state.selectedRole = state.doc.roles[0]
  persist()
}

/** 导入 permission.json 继续设计 */
function importPermission(config: PermissionConfig): void {
  state.doc = permissionConfigToDoc(config)
  state.selectedRole = state.doc.roles[0]
  persist()
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doc))
  } catch {
    // 存储不可用时设计不中断
  }
}

export function usePermissionStore() {
  return {
    state,
    currentPermission,
    selectRole,
    setFieldState,
    addCustomRole,
    deleteRole,
    importPermission,
  }
}
