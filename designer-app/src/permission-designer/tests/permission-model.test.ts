import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  addRole,
  createPermissionDoc,
  findEntry,
  removeRole,
  selectPatchesForRoles,
  setPermissionState,
  type PermissionEntry,
} from '../permission-model'

describe('permission-model · 字段权限生成（稀疏补丁）', () => {
  it('manager readonly=true：只生成声明的键，无任何默认值', () => {
    const entries = setPermissionState([], 'amount', 'manager', 'readonly', true)

    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0].patch, { readonly: true })
    // 没有 editable/disabled/visible —— 未表态即不出现
    assert.equal('editable' in entries[0].patch, false)
  })

  it('employee editable=true + finance editable=true 各自独立成条目', () => {
    let entries = setPermissionState([], 'amount', 'employee', 'editable', true)
    entries = setPermissionState(entries, 'amount', 'finance', 'editable', true)

    assert.equal(entries.length, 2)
    assert.deepEqual(findEntry(entries, 'amount', 'employee')?.patch, { editable: true })
    assert.deepEqual(findEntry(entries, 'amount', 'finance')?.patch, { editable: true })
  })

  it('同一 字段×角色 再加一个键：浅合并进同一条目，不新增条目', () => {
    let entries = setPermissionState([], 'companyName', 'manager', 'visible', true)
    entries = setPermissionState(entries, 'companyName', 'manager', 'editable', true)

    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0].patch, { visible: true, editable: true })
  })

  it('摘掉最后一个键（不表态）：整条条目删除，不留空补丁', () => {
    let entries = setPermissionState([], 'amount', 'manager', 'readonly', true)
    entries = setPermissionState(entries, 'amount', 'manager', 'readonly', undefined)

    assert.deepEqual(entries, [])
  })
})

describe('permission-model · 角色管理 / 角色切换', () => {
  it('预置三角色；addRole 新增自定义角色，重名忽略', () => {
    const doc = createPermissionDoc()
    assert.deepEqual(doc.roles, ['employee', 'manager', 'finance'])

    const next = addRole(doc.roles, 'auditor')
    assert.deepEqual(next, ['employee', 'manager', 'finance', 'auditor'])
    assert.strictEqual(addRole(next, 'auditor'), next)
  })

  it('预置角色不可删；自定义角色删除时连带其条目', () => {
    let doc = createPermissionDoc()
    doc = { ...doc, roles: addRole(doc.roles, 'auditor') }
    doc = {
      ...doc,
      entries: [
        {
          id: 'x',
          field: 'amount',
          role: 'auditor',
          patch: { disabled: true },
        },
      ] as PermissionEntry[],
    }

    assert.strictEqual(removeRole(doc, 'manager'), doc)

    const removed = removeRole(doc, 'auditor')
    assert.equal(removed.roles.includes('auditor'), false)
    assert.equal(removed.entries.length, 0)
  })
})

describe('permission-model · Patch 合并（按角色查表）', () => {
  function fixture(): PermissionEntry[] {
    let entries = setPermissionState([], 'amount', 'employee', 'editable', true)
    entries = setPermissionState(entries, 'amount', 'manager', 'readonly', true)
    entries = setPermissionState(entries, 'amount', 'finance', 'editable', true)
    return entries
  }

  it('切换角色 → 只选中该角色的补丁', () => {
    const entries = fixture()

    assert.deepEqual(selectPatchesForRoles(entries, ['employee']), {
      amount: { editable: true },
    })
    assert.deepEqual(selectPatchesForRoles(entries, ['manager']), {
      amount: { readonly: true },
    })
  })

  it('多角色用户：命中条目按声明顺序浅合并，同键后者覆盖', () => {
    let entries = fixture()
    // 追加一条 employee 的 readonly 表态（顺序在后，应覆盖）
    entries = setPermissionState(entries, 'amount', 'employee', 'readonly', true)

    const merged = selectPatchesForRoles(entries, ['employee', 'manager'])
    assert.equal(merged.amount.readonly, true)
    assert.equal(merged.amount.editable, true)
  })

  it('无匹配角色 → 空表（不猜测默认权限）', () => {
    assert.deepEqual(selectPatchesForRoles(fixture(), ['nobody']), {})
  })
})
