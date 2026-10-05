<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Schema } from '@runtime-core/types'
import { createVersionServices, FORM_ID } from '@/mock/version-registry'

/**
 * Schema 管理
 *
 * 全部数据来自 Runtime Core 的 SchemaVersion Runtime：
 *   SchemaRegistry.listVersions / getSchema + SchemaVersionResolver。
 *
 * 展示：
 *   v1 状态=历史版本（amount: NumberInput）
 *   v2 状态=当前版本（amount: MoneyInput，新增 currency）
 *
 * 点击版本查看结构差异；"模拟打开历史任务"演示版本冻结：
 * 历史任务永远拿到创建时的版本，不会自动切到 latest。
 */
const { registry, resolver } = createVersionServices()

const versions = registry.listVersions(FORM_ID)
const latest = registry.getLatestVersion(FORM_ID)

const selectedVersion = ref<string>(latest)
const currentSchema = computed<Schema>(
  () => registry.getSchema(FORM_ID, selectedVersion.value),
)

function componentNameOf(schema: Schema, field: string): string {
  const f = schema.fields.find((x) => x.name === field)
  return f?.component ?? '(未配置)'
}

/** 差异行：对比两版字段是否存在、组件名是否变化 */
const diffRows = computed(() => {
  const v1 = registry.getSchema(FORM_ID, 'v1')
  const v2 = registry.getSchema(FORM_ID, selectedVersion.value)
  const allFields = new Set([
    ...v1.fields.map((f) => f.name),
    ...v2.fields.map((f) => f.name),
  ])

  return [...allFields].map((field) => {
    const inV1 = v1.fields.some((f) => f.name === field)
    const inV2 = v2.fields.some((f) => f.name === field)
    const c1 = componentNameOf(v1, field)
    const c2 = componentNameOf(v2, field)

    let type: 'added' | 'removed' | 'changed' | 'same'
    if (!inV1 && inV2) type = 'added'
    else if (inV1 && !inV2) type = 'removed'
    else if (c1 !== c2) type = 'changed'
    else type = 'same'

    return { field, c1, c2, type }
  })
})

/** 演示 Version Pinning：同一任务在"发布 v2 后"仍按持久化版本打开 */
const pinningDemo = computed(() => {
  // 模拟历史单据：持久化时记录 version=v1
  const persisted = { formId: FORM_ID, version: 'v1' }
  const resolved = resolver.resolve({
    formId: FORM_ID,
    mode: 'history',
    version: persisted.version,
  })
  const newest = resolver.resolve({ formId: FORM_ID, mode: 'create' })

  return {
    historyVersion: resolved.version,
    createVersion: newest.version,
    frozen: resolved.version === 'v1' && resolved.version !== registry.getLatestVersion(FORM_ID),
  }
})

const tagType = { added: 'success', removed: 'danger', changed: 'warning', same: 'info' } as const
const tagLabel = { added: '新增字段', removed: '字段移除', changed: '组件变化', same: '无变化' } as const
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="version-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">orderForm · Schema 版本</span>
          <el-tag size="small" type="success">Latest：{{ latest }}</el-tag>
        </div>
      </template>

      <el-table :data="versions.map((v) => ({
        version: v,
        status: v === latest ? '当前版本' : '历史版本',
      }))" border>
        <el-table-column prop="version" label="版本" width="120" />
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="row.version === latest ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button
              size="small"
              :type="selectedVersion === row.version ? 'primary' : 'default'"
              @click="selectedVersion = row.version"
            >
              查看差异
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        class="pinning"
        type="success"
        :closable="false"
        :title="`版本冻结：历史任务打开 → ${pinningDemo.historyVersion}；新建表单 → ${pinningDemo.createVersion}`"
        description="历史单据持久化了创建时版本，发布 v2 后重新打开仍然是 v1，不会自动切换或修改数据。"
      />
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">结构差异 · v1 → {{ selectedVersion }}</span>
        </div>
      </template>

      <el-table :data="diffRows" border size="small">
        <el-table-column prop="field" label="字段" width="160" />
        <el-table-column prop="c1" label="v1" />
        <el-table-column prop="c2" :label="selectedVersion" />
        <el-table-column label="变化" width="110">
          <template #default="{ row }">
            <el-tag :type="tagType[row.type as keyof typeof tagType]" size="small">
              {{ tagLabel[row.type as keyof typeof tagLabel] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <el-divider />
      <div class="schema-preview">
        <span class="preview-title">当前版本字段预览：</span>
        <el-tag
          v-for="f in currentSchema.fields"
          :key="f.name"
          class="field-tag"
        >
          {{ f.label }} <small>({{ f.component }})</small>
        </el-tag>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-weight: 600;
}
.pinning {
  margin-top: 16px;
}
.field-tag {
  margin: 4px 8px 4px 0;
}
.preview-title {
  font-weight: 600;
  color: #606266;
  font-size: 13px;
}
</style>
