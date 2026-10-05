<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import RuntimeForm from '@/components/RuntimeForm.vue'
import FieldStatePanel from '@/components/FieldStatePanel.vue'
import RuleTrace from '@/components/RuleTrace.vue'
import { useRuntimeStore } from '@/stores/runtime-store'
import { validateForm } from '@runtime-core/validation/validator'
import type { FormData } from '@runtime-core/types'

/**
 * 申请中心（我的申请）
 *
 * 页面本身不写任何表单字段 —— 左侧表单由 Runtime Core 的
 * Schema → ComponentMap → Renderer 配置生成；
 * 右侧是 FieldState Inspector + 规则命中轨迹。
 *
 * 进入页面切换到 employee_fill 节点（字段可编辑），
 * 离开不影响全局结构。
 */
const { state, updateField, resetData, switchNode } = useRuntimeStore()

onMounted(() => switchNode('employee_fill'))

function onModelUpdate(next: FormData): void {
  for (const key of Object.keys(next)) {
    const oldVal = (state.data as unknown as Record<string, unknown>)[key]
    const newVal = (next as unknown as Record<string, unknown>)[key]
    if (oldVal !== newVal) updateField(key, newVal)
  }
}

function onSubmit(): void {
  const result = validateForm(state.schema, state.data, state.fieldStates)
  if (result.valid) {
    ElMessage.success('提交成功，已进入审批流程')
  } else {
    ElMessage.error(result.errors[0]?.message ?? '表单校验失败')
  }
}
</script>

<template>
  <div class="page">
    <el-card class="form-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">采购申请单</span>
          <el-tag size="small" type="info">Schema-driven · Runtime Core</el-tag>
        </div>
      </template>

      <RuntimeForm
        :schema="state.schema"
        :model-value="state.data"
        :states="state.fieldStates"
        @update:model-value="onModelUpdate"
        @submit="onSubmit"
      >
        <template #actions>
          <el-button type="primary" @click="onSubmit">提交申请</el-button>
          <el-button @click="resetData">重置</el-button>
        </template>
      </RuntimeForm>
    </el-card>

    <div class="side-cards">
      <el-card shadow="never">
        <template #header><span class="card-title">FieldState Inspector</span></template>
        <FieldStatePanel
          :schema="state.schema"
          :states="state.fieldStates"
          :traces="state.traces"
        />
      </el-card>

      <el-card shadow="never">
        <template #header><span class="card-title">Rule Trace</span></template>
        <RuleTrace :trace="state.ruleTrace" />
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(560px, 1fr) 460px;
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
.side-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
