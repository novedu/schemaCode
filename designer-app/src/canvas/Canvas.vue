<script setup lang="ts">
import { computed, reactive } from 'vue'
import { buildRenderConfigs } from '@runtime-core/renderer/renderer'
import type { FieldRenderConfig } from '@runtime-core/renderer/renderer'
import { ElMessage } from 'element-plus'
import CanvasNode from './CanvasNode.vue'
import { useDesignerStore } from '../store/designer-store'
import { componentTemplates } from '../component-library/component-list'
import type { CanvasNode as CanvasNodeModel } from '../model/designer-types'

/**
 * Canvas（设计画布）
 *
 * 结构化布局：只编辑 Schema Tree，不做自由定位。
 *
 *   节点树 → buildSchema（核心 Schema）→ core buildRenderConfigs
 *          → CanvasNode 递归渲染（field = 真实组件；container = 布局分组）
 *
 * 拖放（HTML5 DnD，无坐标/无 absolute）：
 *   - 组件库物料 → 拖到根画布或容器内（创建字段）；
 *   - 画布已有节点 → 拖到容器内 / 根画布（移动，循环非法时拒绝）。
 */
const {
  state,
  currentSchema,
  selectNode,
  addFromTemplate,
  addContainer,
  addGrid,
  moveNodeInTree,
} = useDesignerStore()

/** 核心 Renderer：字段名 → 渲染配置（随 Schema 实时变化） */
const configMap = computed(() => {
  const map = new Map<string, FieldRenderConfig>()
  for (const cfg of buildRenderConfigs(currentSchema.value)) {
    map.set(cfg.field, cfg)
  }
  return map
})

function configOf(field: string): FieldRenderConfig | undefined {
  return configMap.value.get(field)
}

/* 设计期占位数据（按字段名存取，不持久化） */
const placeholderData = reactive<Record<string, unknown>>({})
const placeholder = (field: string): unknown => placeholderData[field]

/* ── 拖放 ── */

interface DragPayload {
  type: 'template' | 'container' | 'node' | 'grid'
  component?: string
  id?: string
  columns?: 2 | 3
}

function readPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer?.getData('application/x-canvas-node')
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}

/** 根画布作为放置目标：拖到空白区 = 追加到根层级末尾 */
function onDropRoot(event: DragEvent): void {
  const payload = readPayload(event)
  if (!payload) return

  if (payload.type === 'template' && payload.component) {
    const template = componentTemplates.find((t) => t.component === payload.component)
    if (template) addFromTemplate(template, null)
    return
  }

  if (payload.type === 'container') {
    addContainer(null)
    return
  }

  if (payload.type === 'grid' && payload.columns) {
    addGrid(payload.columns)
    return
  }

  if (payload.type === 'node' && payload.id) {
    const result = moveNodeInTree(payload.id, null)
    if (!result.ok && result.reason) ElMessage.warning(result.reason)
  }
}

/** drop 进入容器/列：追加到该容器 children 或列末尾 */
function onDropIntoContainer(targetParentId: string, event: DragEvent): void {
  const payload = readPayload(event)
  if (!payload) return

  if (payload.type === 'template' && payload.component) {
    const template = componentTemplates.find((t) => t.component === payload.component)
    if (template) addFromTemplate(template, targetParentId)
    return
  }

  if (payload.type === 'container') {
    addContainer(targetParentId)
    return
  }

  if (payload.type === 'grid' && payload.columns) {
    // Grid 只能添加到根层级，不能拖入容器/列内部
    ElMessage.warning('栅格只能放置在根层级')
    return
  }

  if (payload.type === 'node' && payload.id) {
    const result = moveNodeInTree(payload.id, targetParentId)
    if (!result.ok && result.reason) ElMessage.warning(result.reason)
  }
}
</script>

<template>
  <div
    class="canvas"
    @click="selectNode(null)"
    @dragover.prevent
    @drop.prevent="onDropRoot"
  >
    <el-empty
      v-if="state.doc.nodes.length === 0"
      description="从左侧组件库点击或拖拽组件，添加到画布"
    />

    <div v-else class="node-list">
      <CanvasNode
        v-for="node in state.doc.nodes as CanvasNodeModel[]"
        :key="node.id"
        :node="node"
        :config-of="configOf"
        :placeholder="placeholder"
        @select="(id: string) => selectNode(id)"
        @update:placeholder="(f: string, v: unknown) => (placeholderData[f] = v)"
        @drop-into="(containerId: string, e: DragEvent) => onDropIntoContainer(containerId, e)"
      />
    </div>
  </div>
</template>

<style scoped>
.canvas {
  min-height: 100%;
}
.node-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 520px;
  margin: 0 auto;
}
</style>
