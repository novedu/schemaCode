<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
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
import { evaluateNode } from '@runtime-core/engine/condition-group'
import {
  bpmNodePresets,
  createNodeContext,
  type NodePreset,
} from '@/mock/runtime-context'
import { buildConfigPermissionPatches } from '@/adapters/permission-config'
import { runtimeConfigClient } from '@/adapters/config-gateway-client'
import type { FormDefinition } from '../../../config-server/types'

/**
 * DesignerPlayground（Config Gateway 运行时消费端）
 *
 * 本页不读取任何本地 json，也不读 localStorage：
 *
 *   onMounted
 *     → runtimeConfigClient.loadFormDefinition('purchase-order')
 *     → 网关（仅返回 published）
 *     → FormDefinition
 *     → 装配四来源
 *     → 核心 FieldStateResolver
 *     → FieldState → RuntimeForm
 *
 * 页面自身没有任何 if(role)：角色差异是网关配置经 Resolver 的裁决结果。
 */

/** 当前消费的表单标识（对应设计器中的 formId） */
const FORM_ID = 'purchase-order'

const definition = ref<FormDefinition | null>(null)
const context = ref<RuntimeContext | null>(null)
const activePreset = ref<NodePreset | null>(null)

const data = reactive<Record<string, unknown>>({})

const fieldStates = ref<Record<string, FieldState>>({})
const firedRules = ref<string[]>([])
const traces = ref<{ field: string; decidedBy: Record<string, string> }[]>([])

/** 已发布版本清单（供版本切换） */
const versions = ref<number[]>([])
const selectedVersion = ref<number | null>(null)

const loading = ref(false)
const loadError = ref<string | null>(null)

/* ── 配置加载 ── */

/**
 * 从网关加载已发布版本：
 *   version 省略 → 最新发布版本；指定 → 精确版本。
 */
async function loadFromGateway(version?: number): Promise<void> {
  loading.value = true
  loadError.value = null

  try {
    const def = await runtimeConfigClient.loadFormDefinition(FORM_ID, version)
    definition.value = def
    selectedVersion.value = def.version

    // 刷新版本清单（失败不影响主流程）
    versions.value = await runtimeConfigClient.listVersions(FORM_ID)

    const preset = activePreset.value ?? bpmNodePresets[0]
    activePreset.value = preset
    context.value = createNodeContext(preset)

    initData(def)
    recompute()
  } catch (error) {
    definition.value = null
    loadError.value = (error as Error).message
    versions.value = []
    selectedVersion.value = null
  } finally {
    loading.value = false
  }
}

/** 切换已发布版本（draft 永远不会出现在清单里） */
function onVersionChange(version: number): void {
  void loadFromGateway(version)
}

/** 切换流程节点（= 切换 task.node 与 user.roles 上下文） */
function switchNode(preset: NodePreset): void {
  if (!definition.value) return
  activePreset.value = preset
  context.value = createNodeContext(preset)
  recompute()
}

/** 按 Schema 初始化占位数据：select 取首项，金额给示例值，SubForm 初始化为空行数组 */
function initData(def: FormDefinition): void {
  for (const key of Object.keys(data)) delete data[key]
  for (const field of def.schema.fields) {
    if (field.subForm) {
      // SubForm 初始化为空行数组
      data[field.name] = []
    } else if (field.name === 'amount') {
      data[field.name] = 6800
    } else {
      data[field.name] = field.options?.[0]?.value ?? ''
    }
  }
}

/**
 * 核心 FieldStateResolver 全量裁决。
 * 页面自身不计算任何字段状态。
 */
function recompute(): void {
  const def = definition.value
  if (!def || !context.value) return
  const ctx = context.value

  /* 权限来源：核心实例/角色权限 与网关 permissions 查表补丁合并 */
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

  const result = resolveFieldStates(def.schema, sources, { trace: true })
  fieldStates.value = result.fieldStates
  traces.value = result.traces

  // 命中规则清单：复用核心条件求值，不重写引擎
  firedRules.value = def.rules
    .filter((rule) => evaluateNode(rule.when, data as unknown as Record<string, unknown>))
    .map((rule) => rule.name)
}

/** 补丁表合并（普通键后者覆盖） */
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

/* ── 表单值回写 ── */

function onModelUpdate(next: FormData): void {
  for (const key of Object.keys(next)) {
    const newVal = (next as unknown as Record<string, unknown>)[key]
    if (data[key] !== newVal) data[key] = newVal
  }
  recompute()
}

/* ── 金额状态摘要（侧栏强证据） ── */
const amountState = computed(() =>
  fieldStates.value.amount
    ? {
        editable: fieldStates.value.amount.editable,
        readonly: fieldStates.value.amount.readonly,
        disabled: fieldStates.value.amount.disabled,
      }
    : null,
)

onMounted(() => {
  void loadFromGateway()
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="form-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ FORM_ID }} · 配置中心运行时（Config Gateway）</span>
          <el-tag size="small" type="success" effect="plain">
            仅加载 published · 经核心 FieldStateResolver 裁决
          </el-tag>
        </div>
      </template>

      <!-- 网关加载条 -->
      <div class="loader-bar">
        <el-button
          size="small"
          :icon="Refresh"
          :loading="loading"
          @click="loadFromGateway()"
        >
          从配置中心重新加载
        </el-button>

        <template v-if="versions.length > 0">
          <span class="loader-label">已发布版本：</span>
          <el-select
            :model-value="selectedVersion"
            size="small"
            class="version-select"
            @update:model-value="onVersionChange"
          >
            <el-option
              v-for="v in [...versions].reverse()"
              :key="v"
              :label="`v${v}`"
              :value="v"
            />
          </el-select>
        </template>
      </div>

      <!-- 加载失败：配置中心没有已发布版本 -->
      <el-result
        v-if="loadError"
        icon="warning"
        title="配置尚未发布"
        :sub-title="loadError"
      >
        <template #extra>
          <el-text type="info" size="small">
            请在 designer-app（:5174）中确认 formId = {{ FORM_ID }}，
            点击“发布版本”后回到本页重新加载。
          </el-text>
        </template>
      </el-result>

      <template v-else-if="definition">
        <!-- 节点切换 -->
        <div class="node-bar">
          <span class="node-bar-title">流程节点 / 角色：</span>
          <el-radio-group
            :model-value="activePreset?.node"
            size="small"
            @update:model-value="(v: string) =>
              switchNode(bpmNodePresets.find((p) => p.node === v)!)"
          >
            <el-radio-button
              v-for="p in bpmNodePresets"
              :key="p.node"
              :value="p.node"
            >
              {{ p.label }}（{{ p.roles.join('/') }}）
            </el-radio-button>
          </el-radio-group>
        </div>

        <RuntimeForm
          :schema="definition.schema"
          :model-value="data as unknown as FormData"
          :states="fieldStates"
          @update:model-value="onModelUpdate"
        />
      </template>

      <el-skeleton v-else-if="loading" :rows="5" animated />
    </el-card>

    <!-- 侧栏 -->
    <div class="side-cards">
      <el-card shadow="never">
        <template #header><span class="card-title">amount 权限结果</span></template>
        <el-empty v-if="!amountState" description="加载后显示" :image-size="50" />
        <el-descriptions v-else :column="1" size="small" border>
          <el-descriptions-item label="editable">{{ amountState.editable }}</el-descriptions-item>
          <el-descriptions-item label="readonly">{{ amountState.readonly }}</el-descriptions-item>
          <el-descriptions-item label="disabled">{{ amountState.disabled }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">命中规则</span></template>
        <el-empty v-if="firedRules.length === 0" description="无规则命中" :image-size="50" />
        <el-timeline v-else>
          <el-timeline-item v-for="name in firedRules" :key="name" type="success">
            {{ name }}
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">决策来源（amount）</span></template>
        <el-text v-for="key in ['editable','readonly','visible']" :key="key" class="trace-line">
          {{ key }} → {{ traces.find((t) => t.field === 'amount')?.decidedBy[key] ?? '（未表态）' }}
        </el-text>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(560px, 1fr) 400px;
  gap: 16px;
  align-items: start;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-weight: 600;
}
.loader-bar,
.node-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.loader-label,
.node-bar-title {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
}
.version-select {
  width: 110px;
}
.side-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.trace-line {
  display: block;
  font-size: 12px;
  font-family: ui-monospace, monospace;
  margin-bottom: 4px;
}
</style>
