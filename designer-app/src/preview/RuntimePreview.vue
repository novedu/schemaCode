<script setup lang="ts">
import { computed } from 'vue'
import { buildRenderConfigs } from '@runtime-core/renderer/renderer'
import { useDesignerStore } from '../store/designer-store'

/**
 * RuntimePreview（运行时产物预览）
 *
 * 两部分：
 *   1. 导出产物 bundle 的 JSON（schema.json 内容；rules.json 当前为空）；
 *   2. "Runtime 将如何渲染"：同样调用核心 buildRenderConfigs，
 *      按 Schema 顺序列出每个字段将解析到的组件。
 *
 * 与 Canvas 使用同一核心函数，预览结论与实际执行必然一致。
 */
const { currentSchema } = useDesignerStore()

const bundleJson = computed(() =>
  JSON.stringify(
    {
      schema: currentSchema.value,
      rules: [],
    },
    null,
    2,
  ),
)

const resolved = computed(() =>
  buildRenderConfigs(currentSchema.value).map((c) => ({
    field: c.field,
    label: c.label,
    component: c.componentName,
  })),
)
</script>

<template>
  <div class="preview">
    <div class="section">
      <div class="section-title">导出产物（schema.json + rules.json）</div>
      <pre class="json">{{ bundleJson }}</pre>
    </div>

    <div class="section">
      <div class="section-title">Runtime 组件解析结果（Schema → ComponentMap）</div>
      <el-empty v-if="resolved.length === 0" description="暂无字段" :image-size="60" />
      <el-table v-else :data="resolved" size="small" border>
        <el-table-column prop="field" label="字段" width="140" />
        <el-table-column prop="label" label="标签" width="140" />
        <el-table-column prop="component" label="渲染组件" />
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.section {
  margin-bottom: 18px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}
.json {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 14px;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 360px;
  overflow: auto;
}
</style>
