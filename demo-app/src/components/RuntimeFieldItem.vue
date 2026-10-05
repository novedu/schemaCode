<script setup lang="ts">
import type { FieldRenderConfig } from '@runtime-core/renderer/renderer'
import type { FieldState } from '@runtime-core/types'

/**
 * RuntimeFieldItem（运行时单字段渲染单元）
 *
 * 从 RuntimeForm 抽出的字段渲染单元，供"平铺"与"布局树（Container）"
 * 两种渲染路径复用 —— 保证两种布局下字段行为完全一致：
 *
 *   Schema 渲染配置（核心 buildRenderConfigs）+ 宿主值绑定
 *   + FieldState 动态控制量（disabled/readonly/required/warnings）
 */
const props = defineProps<{
  config: FieldRenderConfig
  modelValue: unknown
  state?: FieldState
}>()

const emit = defineEmits<{
  'update:modelValue': [unknown]
}>()

/** FieldState → 宿主动态 props */
function dynamicProps(): Record<string, unknown> {
  const state = props.state
  if (!state) return {}
  return {
    disabled: state.disabled,
    readonly: state.readonly,
  }
}

/** 单个字段的全部绑定（静态 props + options + 动态状态），模板里只保留一个 v-bind */
function mergedAttrs(): Record<string, unknown> {
  return {
    ...props.config.props,
    ...(props.config.options ? { options: props.config.options } : {}),
    ...dynamicProps(),
  }
}
</script>

<template>
  <el-form-item
    :key="config.field"
    :label="config.label"
    :required="state?.required"
  >
    <component
      :is="config.component"
      :model-value="modelValue"
      v-bind="mergedAttrs()"
      @update:model-value="(v: unknown) => emit('update:modelValue', v)"
    />

    <!-- 非阻断预警（核心 warnings，拼接去重后的最终结果） -->
    <div v-if="state?.warnings?.length" class="field-warnings">
      <el-text
        v-for="(w, i) in state.warnings"
        :key="i"
        type="warning"
        size="small"
      >
        ⚠ {{ w }}
      </el-text>
    </div>
  </el-form-item>
</template>

<style scoped>
.field-warnings {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}
</style>
