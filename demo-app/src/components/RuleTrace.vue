<script setup lang="ts">
import type { RuleTraceEntry } from '@/adapters/runtime-engine'

/**
 * Rule Trace（规则命中轨迹）
 *
 * 用核心条件求值器对每条规则的 when 做一次判定（见 runtime-engine 门面），
 * 展示此刻哪些产生式被触发。
 */
defineProps<{
  trace: RuleTraceEntry[]
}>()
</script>

<template>
  <div class="rule-trace">
    <div v-for="(r, i) in trace" :key="i" class="trace-row">
      <el-tag :type="r.fired ? 'success' : 'info'" size="small" effect="plain">
        {{ r.fired ? 'FIRED' : '—' }}
      </el-tag>
      <span class="trace-name" :class="{ fired: r.fired }">{{ r.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.rule-trace {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trace-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.trace-name {
  font-size: 13px;
  color: #909399;
}
.trace-name.fired {
  color: #303133;
  font-weight: 500;
}
</style>
