<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RuntimeForm from '@/components/RuntimeForm.vue'
import type {
  FieldState,
  FormData,
  RuntimeContext,
} from '@runtime-core/types'
import { resolveFieldStates } from '@runtime-core/state-resolution/field-state-resolver'
import { provideSchemaState } from '@runtime-core/state-resolution/schema-state-provider'
import { provideRuleState } from '@runtime-core/state-resolution/rule-state-provider'
import { provideBpmState } from '@runtime-core/state-resolution/bpm-state-provider'
import { providePermissionState } from '@runtime-core/state-resolution/permission-state-provider'
import { buildConfigPermissionPatches } from '@/adapters/permission-config'
import { bpmNodePresets, createNodeContext } from '@/mock/runtime-context'
import type {
  FormDefinition,
  FormVersionDetail,
} from '../../../config-server/types'
import { runtimeConfigClient } from '@/adapters/config-gateway-client'
import { formTitle, formatUpdatedAt, statusLabel } from './schema-shared'

/**
 * Schema 管理 · 第三层：版本详情（/schema/:formId/versions/:version）
 *
 * 版本隔离的落点：
 *   只调用 loadFormDefinition(formId, version) 精确取该版本，
 *   全页不存在无参 latest 调用；并校验返回 def.version === version。
 *
 * draft 版本：只展示元数据与提示，不装配 Runtime
 * （网关不提供 draft 读取，Runtime 只解释 published）。
 */
const route = useRoute()
const router = useRouter()

const formId = computed(() => String(route.params.formId ?? ''))
const version = computed(() => {
  const n = Number(route.params.version)
  return Number.isInteger(n) && n >= 1 ? n : null
})

type Phase = 'loading' | 'ready' | 'draft' | 'error'
const phase = ref<Phase>('loading')
const errorMsg = ref<string | null>(null)

const meta = ref<FormVersionDetail | null>(null)
const definition = ref<FormDefinition | null>(null)
const detailTab = ref<'schema' | 'rules' | 'permissions'>('schema')

const context = ref<RuntimeContext | null>(null)
const data = reactive<Record<string, unknown>>({})
const fieldStates = ref<Record<string, FieldState>>({})

const jsonSchema = computed(() =>
  definition.value ? JSON.stringify(definition.value.schema, null, 2) : '',
)
const jsonRules = computed(() =>
  definition.value ? JSON.stringify(definition.value.rules, null, 2) : '',
)
const jsonPermissions = computed(() =>
  definition.value ? JSON.stringify(definition.value.permissions, null, 2) : '',
)

async function load(): Promise<void> {
  phase.value = 'loading'
  errorMsg.value = null
  meta.value = null
  definition.value = null

  if (!formId.value || version.value === null) {
    phase.value = 'error'
    errorMsg.value = '路由参数无效：需要合法的 formId 与正整数版本号。'
    return
  }

  try {
    const details = await runtimeConfigClient.listVersionDetails(formId.value)
    const found =
      details.find((d) => d.version === version.value) ?? null
    meta.value = found

    if (!found) {
      phase.value = 'error'
      errorMsg.value = `表单 ${formId.value} 不存在 v${version.value}。`
      return
    }

    if (found.status === 'draft') {
      phase.value = 'draft'
      return
    }

    // 精确版本加载——禁止走 latest
    const def = await runtimeConfigClient.loadFormDefinition(
      formId.value,
      version.value as number,
    )
    if (def.version !== version.value) {
      phase.value = 'error'
      errorMsg.value = `版本不一致：请求 v${version.value}，网关返回 v${def.version}。`
      return
    }

    definition.value = def
    context.value = createNodeContext(bpmNodePresets[0])
    initData(def)
    recompute()
    phase.value = 'ready'
  } catch (error) {
    phase.value = 'error'
    errorMsg.value = (error as Error).message
  }
}

function backToForm(): void {
  if (!formId.value) {
    void router.push('/schema')
    return
  }
  void router.push(`/schema/${encodeURIComponent(formId.value)}`)
}

/* ─────────────────────── Runtime 装配（与 DesignerPlayground 同型） ─────────────────────── */

function initData(def: FormDefinition): void {
  for (const key of Object.keys(data)) delete data[key]
  for (const field of def.schema.fields) {
    if (field.subForm) {
      data[field.name] = []
    } else if (field.name === 'amount') {
      data[field.name] = 6800
    } else {
      data[field.name] = field.options?.[0]?.value ?? ''
    }
  }
}

function mergePatchMaps(
  a: Record<string, Record<string, unknown>>,
  b: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const result = { ...a }
  for (const [field, patch] of Object.entries(b)) {
    result[field] = { ...result[field], ...patch }
  }
  return result
}

function recompute(): void {
  const def = definition.value
  if (!def || !context.value) return
  const ctx = context.value

  const configPatches = buildConfigPermissionPatches(
    def.permissions,
    ctx.user.roles,
  )
  const permissionPatches = mergePatchMaps(
    providePermissionState(ctx),
    configPatches,
  )

  const sources = [
    { name: 'schema' as const, patches: provideSchemaState(def.schema) },
    {
      name: 'rule' as const,
      patches: provideRuleState(def.rules, data as unknown as FormData),
    },
    { name: 'bpm' as const, patches: provideBpmState(ctx) },
    { name: 'permission' as const, patches: permissionPatches },
  ]

  const result = resolveFieldStates(def.schema, sources)
  fieldStates.value = result.fieldStates
}

function onModelUpdate(next: FormData): void {
  for (const key of Object.keys(next)) {
    const newVal = (next as unknown as Record<string, unknown>)[key]
    if (data[key] !== newVal) data[key] = newVal
  }
  recompute()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <el-button size="small" @click="backToForm">
        ← 返回 {{ formId ? formTitle(formId) : 'Schema 管理' }}
      </el-button>
      <el-button
        v-if="phase !== 'loading'"
        size="small"
        @click="load"
      >
        刷新
      </el-button>
    </div>

    <el-card shadow="never" v-loading="phase === 'loading'">
      <template v-if="formId && version !== null">
        <h2 class="version-title">
          {{ formTitle(formId) }} · v{{ version }}
        </h2>

        <el-descriptions
          v-if="meta"
          class="meta"
          :column="3"
          border
          size="small"
        >
          <el-descriptions-item label="Schema Version">
            v{{ meta.version }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag
              size="small"
              :type="meta.status === 'published' ? 'success' : 'info'"
            >
              {{ statusLabel(meta.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatUpdatedAt(meta.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 草稿：不装配 Runtime -->
        <el-alert
          v-if="phase === 'draft'"
          class="draft-alert"
          type="warning"
          :closable="false"
          title="该版本仍为草稿"
          description="Runtime 仅预览已发布配置；请在设计器发布后再查看 Schema / Rules / Permissions 与 Runtime Preview。"
        />

        <!-- 已发布：配置 Tabs + 指定版本 Runtime Preview -->
        <template v-if="phase === 'ready' && definition">
          <el-tabs v-model="detailTab" class="config-tabs">
            <el-tab-pane label="Schema" name="schema">
              <pre class="json-block">{{ jsonSchema }}</pre>
            </el-tab-pane>
            <el-tab-pane label="Rules" name="rules">
              <pre class="json-block">{{ jsonRules }}</pre>
            </el-tab-pane>
            <el-tab-pane label="Permissions" name="permissions">
              <pre class="json-block">{{ jsonPermissions }}</pre>
            </el-tab-pane>
          </el-tabs>

          <el-divider content-position="left">Runtime Preview</el-divider>
          <el-tag size="small" type="success" class="preview-tag">
            已加载 {{ formId }}@v{{ definition.version }}（指定版本，非 latest）
          </el-tag>
          <RuntimeForm
            :schema="definition.schema"
            :model-value="data as unknown as FormData"
            :states="fieldStates"
            @update:model-value="onModelUpdate"
          />
        </template>

        <!-- 错误 -->
        <el-alert
          v-if="phase === 'error'"
          class="error-alert"
          type="error"
          :closable="false"
          :title="errorMsg ?? '加载失败'"
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
.version-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.meta {
  margin-top: 16px;
}
.config-tabs {
  margin-top: 8px;
}
.json-block {
  margin: 0;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  overflow: auto;
  max-height: 300px;
}
.preview-tag {
  margin-bottom: 12px;
}
.draft-alert,
.error-alert {
  margin-top: 16px;
}
</style>
