<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormVersionDetail } from '../../../config-server/types'
import { runtimeConfigClient } from '@/adapters/config-gateway-client'
import { formTitle, formatUpdatedAt, statusLabel } from './schema-shared'

/**
 * Schema 管理 · 第二层：表单详情（/schema/:formId）
 *
 * 只包含：
 *   基本信息（当前发布版本 / 状态 / 更新时间）
 *   版本列表（版本 / 状态 / 更新时间 / 查看）
 *
 * 不展开任何版本的 Schema / Rules / Permissions / Runtime Preview——
 * 那些属于第三层 /schema/:formId/versions/:version。
 * 草稿版本不出预览入口（Runtime 只解释 published）。
 */
const route = useRoute()
const router = useRouter()

const formId = computed(() => String(route.params.formId ?? ''))

const details = ref<FormVersionDetail[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const sortedDetails = computed(() =>
  [...details.value].sort((a, b) => b.version - a.version),
)

/** 当前发布版本 = 版本号最大的 published；无则为 null */
const latestPublished = computed(
  () => sortedDetails.value.find((d) => d.status === 'published') ?? null,
)

async function load(): Promise<void> {
  if (!formId.value) return
  loading.value = true
  loadError.value = null
  try {
    details.value = await runtimeConfigClient.listVersionDetails(formId.value)
  } catch (error) {
    loadError.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

function backToList(): void {
  void router.push('/schema')
}

function openVersion(version: number): void {
  void router.push(
    `/schema/${encodeURIComponent(formId.value)}/versions/${version}`,
  )
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <el-button size="small" @click="backToList">← 返回 Schema 管理</el-button>
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-card shadow="never" v-loading="loading">
      <template v-if="formId">
        <h2 class="form-title">{{ formTitle(formId) }}</h2>
        <div class="form-id">{{ formId }}</div>

        <el-divider content-position="left">基本信息</el-divider>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="当前发布版本">
            {{ latestPublished ? `v${latestPublished.version}` : '尚未发布' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag
              v-if="latestPublished"
              size="small"
              type="success"
            >
              {{ statusLabel(latestPublished.status) }}
            </el-tag>
            <el-tag v-else size="small" type="info">未发布</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ latestPublished ? formatUpdatedAt(latestPublished.updatedAt) : '—' }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">版本列表</el-divider>

        <el-empty
          v-if="!loading && details.length === 0 && !loadError"
          description="配置中心不存在该表单或尚无任何版本"
        />

        <el-table
          v-else
          :data="sortedDetails"
          border
          size="small"
        >
          <el-table-column label="版本" width="100">
            <template #default="{ row }">v{{ row.version }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.status === 'published' ? 'success' : 'info'"
              >
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" min-width="170">
            <template #default="{ row }">
              {{ formatUpdatedAt(row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'published'"
                size="small"
                type="primary"
                @click="openVersion(row.version)"
              >
                查看
              </el-button>
              <el-tooltip v-else content="草稿发布后才可在 Runtime 预览" placement="top">
                <el-button size="small" disabled>查看</el-button>
              </el-tooltip>
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
      </template>
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
.form-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.form-id {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.error-alert {
  margin-top: 16px;
}
</style>
