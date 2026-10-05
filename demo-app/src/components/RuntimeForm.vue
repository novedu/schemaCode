<script setup lang="ts">
import { computed } from 'vue'
import type {
  FieldState,
  FormData,
  Schema,
  SubFormRow,
} from '@runtime-core/types'
import { buildRenderConfigs } from '@runtime-core/renderer/renderer'
import RuntimeFieldItem from './RuntimeFieldItem.vue'
import RuntimeLayoutNode from './RuntimeLayoutNode.vue'
import RuntimeSubForm from './RuntimeSubForm.vue'

/**
 * RuntimeForm（Schema 驱动的运行时表单）
 *
 * 这是消费端接入核心 Renderer 的位置：
 *
 *   Schema ──▶ core buildRenderConfigs（ComponentMap 查询 + props 合并）
 *                   ──▶ 渲染配置列表 ──▶ <component :is>（Element Plus）
 *
 * 渲染分两条路径，字段单元完全一致：
 *   - schema.layout 存在 → 按布局树分组渲染（RuntimeLayoutNode 递归）；
 *   - 无 layout          → 按 fields 顺序平铺（与既有行为一致）。
 *
 * 布局是纯展示信息：不参与字段状态推理。
 * 本组件不硬编码任何字段；visible=false 的字段直接跳过，
 * 与核心"隐藏字段不渲染、不校验"一致。
 */
const props = defineProps<{
  schema: Schema
  modelValue: FormData
  states: Record<string, FieldState>
}>()

const emit = defineEmits<{
  'update:modelValue': [FormData]
  submit: []
}>()

/** 核心 Renderer 产出的渲染配置（组件名已经过核心 ComponentMap 解析）。
 *  SubForm 是结构性字段（type='object' + subForm），由 RuntimeSubForm 单独渲染，
 *  不进入 ComponentMap 平铺链路（'SubForm' 组件不在 ComponentMap 中）。 */
const renderConfigs = computed(() =>
  buildRenderConfigs({
    ...props.schema,
    fields: props.schema.fields.filter((f) => !f.subForm),
  }),
)

function configOf(field: string) {
  return renderConfigs.value.find((cfg) => cfg.field === field)
}

const visibleConfigs = computed(() =>
  renderConfigs.value.filter((cfg) => props.states[cfg.field]?.visible !== false),
)

/** 值更新：只回传新 FormData，由上层（store）触发核心引擎重算 */
function onFieldUpdate(field: string, value: unknown): void {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  } as FormData)
}

/** SubForm 聚合结果写回顶层 formValues */
function onFormValuesPatch(patch: Record<string, unknown>): void {
  emit('update:modelValue', {
    ...props.modelValue,
    ...patch,
  } as FormData)
}
</script>

<template>
  <el-form label-width="110px" class="runtime-form" @submit.prevent="emit('submit')">
    <!-- SubForm 子表渲染（schema.fields 中 type='object' 且含 subForm 的字段） -->
    <template v-for="field in schema.fields" :key="field.name">
      <RuntimeSubForm
        v-if="field.subForm"
        :schema="field.subForm"
        :rows="((modelValue as unknown as Record<string, unknown>)[field.name] as SubFormRow[]) ?? []"
        :form-values="(modelValue as unknown as Record<string, unknown>)"
        :readonly="states[field.name]?.readonly"
        @update:rows="(rows) => onFieldUpdate(field.name, rows)"
        @update:form-values="(patch) => onFormValuesPatch(patch)"
      />
    </template>

    <!-- 布局树渲染（Container 分组） -->
    <RuntimeLayoutNode
      v-if="schema.layout?.length"
      :nodes="schema.layout"
      :config-of="configOf"
      :states="states"
      :model-value="(modelValue as unknown as Record<string, unknown>)"
      @update:field="(field: string, v: unknown) => onFieldUpdate(field, v)"
    />

    <!-- 平铺渲染（无 layout 时与既有行为一致） -->
    <template v-else>
      <RuntimeFieldItem
        v-for="cfg in visibleConfigs"
        :key="cfg.field"
        :config="cfg"
        :model-value="(modelValue as unknown as Record<string, unknown>)[cfg.field]"
        :state="states[cfg.field]"
        @update:model-value="(v: unknown) => onFieldUpdate(cfg.field, v)"
      />
    </template>

    <el-form-item v-if="$slots.actions" label-width="110px">
      <slot name="actions" />
    </el-form-item>
  </el-form>
</template>

<style scoped>
.runtime-form {
  max-width: 640px;
}
</style>
