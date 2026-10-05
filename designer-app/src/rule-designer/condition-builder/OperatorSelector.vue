<script setup lang="ts">
import type { OperatorName } from '@runtime-core/types'

/**
 * OperatorSelector（操作符选择器）
 *
 * 操作符集合以 Runtime Core 的 OperatorName 契约为准
 * （equals / greaterThan / notEmpty），不自定义拼写。
 * 新增操作符必须先扩展核心——设计器不发明引擎不认识的运算符。
 */
const props = defineProps<{
  modelValue: OperatorName
}>()

const emit = defineEmits<{
  'update:modelValue': [OperatorName]
}>()

const options: { value: OperatorName; label: string }[] = [
  { value: 'equals', label: '等于 ( = )' },
  { value: 'greaterThan', label: '大于 ( > )' },
  { value: 'notEmpty', label: '非空 ( not empty )' },
]
</script>

<template>
  <el-select
    :model-value="props.modelValue"
    class="operator-select"
    size="small"
    @update:model-value="(v: OperatorName) => emit('update:modelValue', v)"
  >
    <el-option
      v-for="o in options"
      :key="o.value"
      :label="o.label"
      :value="o.value"
    />
  </el-select>
</template>

<style scoped>
.operator-select {
  width: 150px;
  flex-shrink: 0;
}
</style>
