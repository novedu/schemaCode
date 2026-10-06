<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormVersionDetail } from '../../../config-server/types'
import { runtimeConfigClient } from '@/adapters/config-gateway-client'
import { formTitle, formatUpdatedAt, statusLabel } from './schema-shared'

/**
 * Schema 管理 · 第一层：表单列表（/schema）
 *
 * 本页只负责"找到表单"：不展示任何版本的 Schema / Rules /
 * Permissions / Runtime Preview。点击行或"查看详情"进入
 * /schema/:formId（表单详情 + 版本列表）。
 *
 * 数据全部来自 Config Gateway；"当前版本"取最新 published，
 * 尚无发布时回退到最新 draft。
 */
const router = useRouter()

interface FormRow {
  formId: string
  title: string
  current: FormVersionDetail | null
}

const formRows = ref<FormRow[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const ids = await runtimeConfigClient.listForms()
    formRows.value = await Promise.all(
      ids.map(async (formId) => {
        const details = await runtimeConfigClient.listVersionDetails(formId)
        const latestPublished =
          [...details].reverse().find((d) => d.status === 'published') ?? null
        const current = latestPublished ?? details[details.length - 1] ?? null
        return { formId, title: formTitle(formId), current }
      }),
    )
  } catch (error) {
    loadError.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

function openForm(row: FormRow): void {
  void router.push(`/schema/${encodeURIComponent(row.formId)}`)
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">Schema 管理</h2>
      <el-button size="small" :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <el-card shadow="never">
      <el-skeleton v-if="loading" :rows="4" animated />

      <el-empty
        v-else-if="formRows.length === 0"
        description="配置中心暂无表单，请先在设计器发布 purchase-order"
      />

      <el-table
        v-else
        :data="formRows"
        v-loading="loading"
        border
        class="form-table"
        @row-click="openForm"
      >
        <el-table-column label="表单名称" min-width="180">
          <template #default="{ row }">
            <span class="link-text">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="formId" label="Form ID" min-width="180" />
        <el-table-column label="当前版本" width="110">
          <template #default="{ row }">
            {{ row.current ? `v${row.current.version}` : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag
              v-if="row.current"
              size="small"
              :type="row.current.status === 'published' ? 'success' : 'info'"
            >
              {{ statusLabel(row.current.status) }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="170">
          <template #default="{ row }">
            {{ row.current ? formatUpdatedAt(row.current.updatedAt) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click.stop="openForm(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        v-if="loadError"
        class="error-alert"
        type="error"
        :closable="false"
        :title="loadError"
      />
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.form-table {
  cursor: pointer;
}
.link-text {
  font-weight: 600;
  color: #409eff;
}
.error-alert {
  margin-top: 16px;
}
</style>
