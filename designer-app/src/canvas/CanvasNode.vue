<script setup lang="ts">
import { computed } from 'vue'
import type { FieldRenderConfig } from '@runtime-core/renderer/renderer'
import type { CanvasNode } from '../model/designer-types'
import { useDesignerStore } from '../store/designer-store'

/**
 * CanvasNode（画布节点外壳 · 递归）
 *
 * kind 判别渲染：
 *   field     → 标签 + 核心组件真实渲染（与 Runtime 同一 buildRenderConfigs 结果）
 *   container → 容器外壳（标题 + 可放置区）+ children 递归
 *
 * 容器是纯布局分组：不渲染业务组件、不参与状态计算。
 * drop 事件链：最深命中的容器发 DOM drop（.stop 防穿透），
 * 父层逐级转发自定义事件，Canvas 根部收到唯一一次目标容器 id。
 */
defineOptions({ name: 'CanvasNode' })

const props = defineProps<{
  node: CanvasNode
  /** 字段名 → 渲染配置（field 节点渲染用；容器忽略） */
  configOf: (field: string) => FieldRenderConfig | undefined
  placeholder: (field: string) => unknown
}>()

const emit = defineEmits<{
  select: [id: string]
  'update:placeholder': [field: string, value: unknown]
  /** drop 进入本容器（转发链终点是 Canvas 根部） */
  dropInto: [targetContainerId: string, event: DragEvent]
}>()

const { state } = useDesignerStore()
const selected = computed(() => state.selectedId === props.node.id)

/** 字段分支视图模型（联合类型窄化 + 渲染配置一次性解析） */
const fieldView = computed(() => {
  if (props.node.kind !== 'field') return null
  const config = props.configOf(props.node.field)
  const merged = config
    ? { ...config.props, ...(config.options ? { options: config.options } : {}) }
    : {}
  return { node: props.node, config, merged }
})

/** 容器分支视图模型 */
const containerView = computed(() =>
  props.node.kind === 'container' ? props.node : null,
)

/** 栅格分支视图模型 */
const gridView = computed(() =>
  props.node.kind === 'grid' ? props.node : null,
)

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData(
    'application/x-canvas-node',
    JSON.stringify({ type: 'node', id: props.node.id }),
  )
}

/** 字段值输入（闭包内自行守卫，避免模板收窄局限） */
function onFieldInput(value: unknown): void {
  if (fieldView.value) emit('update:placeholder', fieldView.value.node.field, value)
}
</script>

<template>
  <!-- ── 字段节点（叶子） ── -->
  <div
    v-if="fieldView"
    class="canvas-node"
    :class="{ selected }"
    draggable="true"
    @click.stop="emit('select', fieldView.node.id)"
    @dragstart="onDragStart"
  >
    <div class="node-label">
      {{ fieldView.node.label }}
      <span class="node-component">{{ fieldView.node.component }}</span>
    </div>

    <div class="node-control" @click.stop>
      <component
        :is="fieldView.config?.component"
        :model-value="placeholder(fieldView.node.field)"
        v-bind="fieldView.merged"
        @update:model-value="onFieldInput"
      />
    </div>
  </div>

  <!-- ── 容器节点（父节点，可放置） ── -->
  <div
    v-else-if="containerView"
    class="canvas-container"
    :class="{ selected }"
    draggable="true"
    @click.stop="emit('select', containerView.id)"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop.prevent.stop="emit('dropInto', containerView.id, $event)"
  >
    <div class="container-header">
      <span class="container-title">{{ containerView.label }}</span>
      <span class="container-tag">Container · {{ containerView.children.length }} 项</span>
    </div>

    <div class="container-body">
      <CanvasNode
        v-for="child in containerView.children"
        :key="child.id"
        :node="child"
        :config-of="configOf"
        :placeholder="placeholder"
        @select="(id: string) => emit('select', id)"
        @update:placeholder="(f: string, v: unknown) => emit('update:placeholder', f, v)"
        @drop-into="(id: string, e: DragEvent) => emit('dropInto', id, e)"
      />

      <div v-if="containerView.children.length === 0" class="container-empty">
        拖入字段或容器
      </div>
    </div>
  </div>

  <!-- ── 栅格节点（父节点，可放置） ── -->
  <div
    v-else-if="gridView"
    class="canvas-grid"
    :class="{ selected }"
    draggable="true"
    @click.stop="emit('select', gridView.id)"
    @dragstart="onDragStart"
  >
    <div class="grid-header">
      <span class="grid-title">{{ gridView.label }}</span>
      <span class="grid-tag">Grid · {{ gridView.columns.length }} 列</span>
    </div>

    <div class="grid-body">
      <div
        v-for="col in gridView.columns"
        :key="col.id"
        class="grid-column"
        @dragover.prevent
        @drop.prevent.stop="emit('dropInto', col.id, $event)"
      >
        <div class="column-tag">Column</div>
        <div class="column-body">
          <CanvasNode
            v-for="child in col.children"
            :key="child.id"
            :node="child"
            :config-of="configOf"
            :placeholder="placeholder"
            @select="(id: string) => emit('select', id)"
            @update:placeholder="(f: string, v: unknown) => emit('update:placeholder', f, v)"
            @drop-into="(id: string, e: DragEvent) => emit('dropInto', id, e)"
          />

          <div v-if="col.children.length === 0" class="column-empty">
            拖入字段
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-node {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px 14px;
  background: #fff;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.canvas-node:hover {
  border-color: #a0cfff;
}
.canvas-node.selected,
.canvas-container.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}
.node-label {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  margin-bottom: 8px;
}
.node-component {
  font-size: 11px;
  color: #a8abb2;
  font-family: ui-monospace, monospace;
  margin-left: 8px;
}
.node-control {
  cursor: initial;
}

/* 容器 */
.canvas-container {
  border: 1.5px dashed #c0c4cc;
  border-radius: 10px;
  background: #fafbfc;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.canvas-container:hover {
  border-color: #a0cfff;
}
.container-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px dashed #e4e7ed;
}
.container-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.container-tag {
  font-size: 11px;
  color: #909399;
  font-family: ui-monospace, monospace;
}
.container-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}
.container-empty {
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}

/* 栅格 */
.canvas-grid {
  border: 1.5px dashed #b3d8ff;
  border-radius: 10px;
  background: #f0f7ff;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.canvas-grid:hover {
  border-color: #79bbff;
}
.canvas-grid.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}
.grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px dashed #d9ecff;
}
.grid-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.grid-tag {
  font-size: 11px;
  color: #909399;
  font-family: ui-monospace, monospace;
}
.grid-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}
.grid-column {
  flex: 1;
  min-height: 60px;
  border: 1px dashed #c6e2ff;
  border-radius: 8px;
  background: #fff;
}
.column-tag {
  padding: 6px 10px;
  font-size: 11px;
  color: #909399;
  border-bottom: 1px dashed #e4e7ed;
  font-family: ui-monospace, monospace;
}
.column-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}
.column-empty {
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}
</style>
