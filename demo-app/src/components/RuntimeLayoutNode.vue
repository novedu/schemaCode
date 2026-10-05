<script setup lang="ts">
import { computed } from 'vue'
import type { FieldRenderConfig } from '@runtime-core/renderer/renderer'
import type {
  FieldState,
  LayoutNode,
} from '@runtime-core/types'
import RuntimeFieldItem from './RuntimeFieldItem.vue'

/**
 * RuntimeLayoutNode（布局树递归渲染）
 *
 * 消费 Schema.layout（Container 布局树）：
 *
 *   container → el-card 分组（标题 = container.label）+ children 递归
 *   field     → RuntimeFieldItem（与平铺路径同一字段渲染单元）
 *
 * 布局只决定"字段怎么分组展示"；字段状态（visible/disabled/readonly）
 * 仍完全由 Runtime Core 的 FieldState 裁决，布局层不做任何业务判断。
 */
defineOptions({ name: 'RuntimeLayoutNode' })

const props = defineProps<{
  nodes: LayoutNode[]
  /** 字段名 → 渲染配置（核心 buildRenderConfigs 产物） */
  configOf: (field: string) => FieldRenderConfig | undefined
  states: Record<string, FieldState>
  modelValue: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [field: string, value: unknown]
}>()

function isVisible(node: LayoutNode): boolean {
  return !(node.kind === 'field' && props.states[node.field]?.visible === false)
}

const visibleNodes = computed(() => props.nodes.filter(isVisible))

function gridSpan(node: LayoutNode): number {
  if (node.kind !== 'grid') return 24
  return Math.floor(24 / node.columns.length)
}

function onFieldUpdate(field: string, value: unknown): void {
  emit('update:field', field, value)
}
</script>

<template>
  <template v-for="node in visibleNodes" :key="node.kind === 'field' ? node.field : node.label">
    <!-- 容器：分组卡片 -->
    <el-card
      v-if="node.kind === 'container'"
      shadow="never"
      class="layout-container"
    >
      <template #header>
        <span class="container-title">{{ node.label }}</span>
      </template>
      <RuntimeLayoutNode
        :nodes="node.children"
        :config-of="configOf"
        :states="states"
        :model-value="modelValue"
        @update:field="(f: string, v: unknown) => onFieldUpdate(f, v)"
      />
    </el-card>

    <!-- 栅格：el-row + el-col 等宽布局 -->
    <el-card
      v-else-if="node.kind === 'grid'"
      shadow="never"
      class="layout-grid"
    >
      <template #header>
        <span class="grid-title">{{ node.label }}</span>
      </template>
      <el-row :gutter="20">
        <el-col
          v-for="(col, index) in node.columns"
          :key="index"
          :span="gridSpan(node)"
        >
          <template v-for="fieldNode in col.children" :key="fieldNode.field">
            <RuntimeFieldItem
              v-if="configOf(fieldNode.field)"
              :config="configOf(fieldNode.field)!"
              :model-value="modelValue[fieldNode.field]"
              :state="states[fieldNode.field]"
              @update:model-value="(v: unknown) => onFieldUpdate(fieldNode.field, v)"
            />
          </template>
        </el-col>
      </el-row>
    </el-card>

    <!-- 字段：与平铺路径同一渲染单元 -->
    <template v-else-if="node.kind === 'field'">
      <RuntimeFieldItem
        v-if="configOf(node.field)"
        :config="configOf(node.field)!"
        :model-value="modelValue[node.field]"
        :state="states[node.field]"
        @update:model-value="(v: unknown) => onFieldUpdate(node.field, v)"
      />
    </template>
  </template>
</template>

<style scoped>
.layout-container {
  margin-bottom: 18px;
}
.layout-container :deep(.el-card__header) {
  padding: 10px 16px;
  background: #f5f7fa;
}
.container-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.layout-grid {
  margin-bottom: 18px;
}
.layout-grid :deep(.el-card__header) {
  padding: 10px 16px;
  background: #f0f7ff;
}
.grid-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
</style>
