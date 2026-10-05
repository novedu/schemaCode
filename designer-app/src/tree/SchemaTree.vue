<script setup lang="ts">
/**
 * SchemaTree（结构大纲）
 *
 * 纯展示组件：把 Designer Store 的 CanvasNode 树投影为 el-tree。
 * - 每次 state.doc.nodes 变化时重新计算 treeData（computed）
 * - 展开/收起状态本地维护（expandedKeys），不进入 Store
 * - 点击 Field/Container/Grid → store.selectNode(id)
 * - 点击 Column → 忽略（selectable: false）
 */
import { computed, ref, watch } from 'vue'
import { ElTree } from 'element-plus'
import { useDesignerStore } from '../store/designer-store'
import { toTreeData, extractSelectableIds } from './schema-tree-model'
import type { SchemaTreeNode } from './schema-tree-model'

const store = useDesignerStore()

/** 展开/收起状态（本地 UI 状态，不持久化） */
const expandedKeys = ref<string[]>([])

/** 树数据：CanvasNode → SchemaTreeNode 投影（每次 nodes 变化时重新计算） */
const treeData = computed<SchemaTreeNode[]>(() => toTreeData(store.state.doc.nodes))

/** 当前选中节点 id（用于高亮） */
const selectedId = computed(() => store.state.selectedId)

/** 自动展开当前选中节点的祖先路径 */
watch(
  selectedId,
  (id) => {
    if (!id) return
    // 展开所有 selectable 节点（简化策略：默认展开全部）
    expandedKeys.value = extractSelectableIds(treeData.value)
  },
  { immediate: true },
)

/** el-tree 配置 */
const treeProps = {
  label: 'displayLabel',
  children: 'children',
}

/** 点击节点 */
function onNodeClick(data: SchemaTreeNode): void {
  if (!data.selectable) return
  store.selectNode(data.id)
}

/** 节点图标 */
function nodeIcon(kind: SchemaTreeNode['kind']): string {
  const icons = {
    field: 'Document',
    container: 'Folder',
    grid: 'Grid',
    column: 'Column',
  }
  return icons[kind]
}
</script>

<template>
  <div class="schema-tree">
    <el-tree
      :data="treeData"
      :props="treeProps"
      node-key="id"
      :default-expanded-keys="expandedKeys"
      @node-click="onNodeClick"
    >
      <template #default="{ data }">
        <div
          class="tree-node"
          :class="{
            'is-selected': data.id === selectedId,
            'is-disabled': !data.selectable,
          }"
        >
          <el-icon v-if="nodeIcon(data.kind) !== 'Column'" class="node-icon">
            <component :is="nodeIcon(data.kind)" />
          </el-icon>
          <span class="node-label">{{ data.displayLabel }}</span>
          <span v-if="data.kind === 'column'" class="node-kind">列</span>
        </div>
      </template>
    </el-tree>
  </div>
</template>

<style scoped>
.schema-tree {
  padding: 8px;
  font-size: 13px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.tree-node:hover {
  background-color: var(--el-fill-color-light);
}

.tree-node.is-selected {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.tree-node.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.tree-node.is-disabled:hover {
  background-color: transparent;
}

.node-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-kind {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  padding: 2px 6px;
  border-radius: 3px;
  background-color: var(--el-fill-color);
}
</style>
