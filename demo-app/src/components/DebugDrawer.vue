<script setup lang="ts">
import { computed } from 'vue'
import { useRuntimeStore } from '@/stores/runtime-store'
import DependencyGraphView from './DependencyGraphView.vue'
import RuleTrace from './RuleTrace.vue'

/**
 * Runtime Debug 面板（类 Chrome DevTools）
 *
 * 全部内容来自全局 store，即 Runtime Core 当前一次真实计算的输入/输出：
 *   FormData · Schema · RuntimeContext · DependencyGraph · RuleTrace · FieldState
 */
const { state, toggleDebug } = useRuntimeStore()

const tabs = [
  { key: 'data', label: 'FormData' },
  { key: 'schema', label: 'Schema' },
  { key: 'context', label: 'RuntimeContext' },
  { key: 'graph', label: 'Dependency Graph' },
  { key: 'rules', label: 'Rule Trace' },
  { key: 'state', label: 'FieldState' },
]

const activeTab = computed({
  get: () => state.debugTab,
  set: (v: string) => {
    state.debugTab = v
  },
})

const json = computed(() => {
  switch (activeTab.value) {
    case 'data':
      return JSON.stringify(state.data, null, 2)
    case 'schema':
      return JSON.stringify(
        state.schema.fields.map((f) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          component: f.component,
          props: f.props,
          options: f.options,
        })),
        null,
        2,
      )
    case 'context':
      return JSON.stringify(state.context, null, 2)
    case 'state':
      return JSON.stringify(state.fieldStates, null, 2)
    default:
      return ''
  }
})
</script>

<template>
  <el-drawer
    :model-value="state.debugVisible"
    title="Runtime Debug"
    direction="rtl"
    size="46%"
    :with-header="true"
    @update:model-value="(v: boolean) => toggleDebug(v)"
  >
    <el-tabs v-model="activeTab" class="debug-tabs">
      <el-tab-pane v-for="t in tabs" :key="t.key" :label="t.label" :name="t.key" />
    </el-tabs>

    <div class="debug-body">
      <pre v-if="['data', 'schema', 'context', 'state'].includes(activeTab)">{{ json }}</pre>

      <DependencyGraphView v-else-if="activeTab === 'graph'" :graph="state.graph" />

      <RuleTrace v-else :trace="state.ruleTrace" />
    </div>
  </el-drawer>
</template>

<style scoped>
.debug-tabs {
  margin-bottom: 8px;
}
.debug-body {
  padding: 4px 2px;
}
pre {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 14px;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
