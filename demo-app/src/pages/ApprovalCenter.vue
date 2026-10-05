<script setup lang="ts">
import { computed, onMounted } from 'vue'
import RuntimeForm from '@/components/RuntimeForm.vue'
import FieldStatePanel from '@/components/FieldStatePanel.vue'
import { useRuntimeStore } from '@/stores/runtime-store'
import { bpmNodePresets } from '@/mock/runtime-context'

/**
 * 审批中心
 *
 * 顶部流程：员工填写 → 部门经理审批 → 财务审批 → 完成。
 * 点击节点 = 切换 RuntimeContext.task.node → 核心 State Resolution Engine
 * 重新推导 FieldState（页面不自己改任何字段状态）。
 *
 * 关键展示：amount 在员工节点可编辑，经理/财务节点只读，
 * 金额 > 5000 时 Rule Provider 的 warning 仍正常显示。
 */
const { state, switchNode } = useRuntimeStore()

onMounted(() => switchNode('manager_approve'))

const steps = [
  { title: '员工填写', node: 'employee_fill' },
  { title: '部门经理审批', node: 'manager_approve' },
  { title: '财务审批', node: 'finance_approve' },
  { title: '完成', node: 'done' },
]

const activeIndex = computed(() =>
  steps.findIndex((s) => s.node === state.context.task.node),
)

function selectNode(node: string, index: number): void {
  if (node === 'done') return
  switchNode(node)
  void index
}

const amountState = computed(() => state.fieldStates.amount)
const currentPreset = computed(
  () => bpmNodePresets.find((p) => p.node === state.context.task.node),
)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">采购审批流程 · PURCHASE-2026-1004</span>
          <el-tag size="small">点击节点切换 RuntimeContext</el-tag>
        </div>
      </template>

      <el-steps :active="activeIndex" align-center finish-status="success" class="steps">
        <el-step
          v-for="(s, i) in steps"
          :key="s.node"
          :title="s.title"
          :description="i === activeIndex ? currentPreset?.description : ''"
          class="step"
          @click="selectNode(s.node, i)"
        />
      </el-steps>

      <el-alert
        :title="`当前节点：${currentPreset?.label ?? '—'} ｜ ${currentPreset?.description ?? ''}`"
        :closable="false"
        type="info"
        class="node-alert"
      />

      <!-- amount 字段状态快览 -->
      <el-descriptions title="amount 字段状态" :column="4" border size="small" class="amount-desc">
        <el-descriptions-item label="editable">
          <el-tag :type="amountState?.editable ? 'success' : 'info'" size="small">
            {{ String(amountState?.editable) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="readonly">
          <el-tag :type="amountState?.readonly ? 'warning' : 'info'" size="small">
            {{ String(amountState?.readonly) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="required">{{ String(amountState?.required) }}</el-descriptions-item>
        <el-descriptions-item label="warnings">
          <span v-if="amountState?.warnings.length">{{ amountState.warnings.length }} 条</span>
          <span v-else>—</span>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 同一 RuntimeForm：节点切换后自动只读 -->
      <div class="form-wrap">
        <RuntimeForm
          :schema="state.schema"
          :model-value="state.data"
          :states="state.fieldStates"
        />
      </div>
    </el-card>

    <el-card shadow="never" class="inspector-card">
      <template #header><span class="card-title">FieldState Inspector</span></template>
      <FieldStatePanel
        :schema="state.schema"
        :states="state.fieldStates"
        :traces="state.traces"
      />
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(640px, 1fr) 420px;
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
.steps {
  margin: 10px 0 22px;
}
.step {
  cursor: pointer;
}
.node-alert {
  margin-bottom: 18px;
}
.amount-desc {
  margin-bottom: 20px;
}
.form-wrap {
  padding-top: 8px;
}
</style>
