<script setup lang="ts">
import { computed } from 'vue'
import type { DependencyGraphApi } from '@/adapters/runtime-engine'

/**
 * DependencyGraph View（依赖图可视化）
 *
 * 数据全部来自核心 DependencyGraph 查询：
 *   输入字段 → 依赖它的规则（反向索引）
 *   规则     → 输出字段
 */
const props = defineProps<{
  graph: DependencyGraphApi | null
}>()

const inputRows = computed(() => {
  if (!props.graph) return []
  return props.graph.getAllInputFields().map((field) => ({
    field,
    rules: props.graph!.getRulesDependingOn(field),
  }))
})

const outputRows = computed(() => {
  if (!props.graph) return []
  // 规则 → 输出字段：从全部输出字段反查生产者，并集去重
  const allRules = new Set<string>()
  for (const field of props.graph.getAllOutputFields()) {
    for (const rule of props.graph.getRulesProducingField(field)) allRules.add(rule)
  }
  return [...allRules].map((rule) => ({
    rule,
    fields: props.graph!.getOutputFieldsOfRule(rule),
  }))
})
</script>

<template>
  <div class="dep-graph">
    <div class="section-title">输入边：字段变化 → 需重算的规则</div>
    <el-table :data="inputRows" size="small" border>
      <el-table-column prop="field" label="字段" width="150" />
      <el-table-column label="依赖规则">
        <template #default="{ row }">
          <el-tag v-for="r in row.rules" :key="r" size="small" class="edge-tag">
            {{ r.length > 24 ? r.slice(0, 24) + '…' : r }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div class="section-title">输出边：规则 → 写入的字段</div>
    <el-table :data="outputRows" size="small" border>
      <el-table-column label="规则">
        <template #default="{ row }">
          {{ row.rule.length > 30 ? row.rule.slice(0, 30) + '…' : row.rule }}
        </template>
      </el-table-column>
      <el-table-column label="输出字段" width="180">
        <template #default="{ row }">
          <el-tag v-for="f in row.fields" :key="f" type="success" size="small" class="edge-tag">
            {{ f }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin: 4px 0 8px;
}
.edge-tag {
  margin: 2px 6px 2px 0;
}
</style>
