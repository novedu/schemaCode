<script setup lang="ts">
import { useDesignerStore } from '../store/designer-store'

/**
 * GridPropertyPanel（栅格属性面板）
 *
 * 选中栅格时编辑分组标题。栅格是纯布局节点：
 * 没有字段名/组件/必填等字段属性，也不参与规则与权限。
 */
const { selectedNode, patchSelected } = useDesignerStore()
</script>

<template>
  <el-empty
    v-if="!selectedNode || selectedNode.kind !== 'grid'"
    description="选中画布栅格后编辑属性"
    :image-size="70"
  />

  <el-form v-else label-width="72px" size="small">
    <el-form-item label="标题">
      <el-input
        :model-value="selectedNode.label"
        placeholder="如 基本信息"
        @update:model-value="(v: string) => patchSelected({ label: v })"
      />
    </el-form-item>

    <el-form-item label="列数">
      <el-text type="info" size="small">
        {{ selectedNode.columns.length }} 列（等宽）
      </el-text>
    </el-form-item>

    <el-form-item label="子节点">
      <el-text type="info" size="small">
        {{ selectedNode.columns.reduce((acc, col) => acc + col.children.length, 0) }} 项字段
      </el-text>
    </el-form-item>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="栅格是纯布局分组"
      description="不参与规则 / 权限 / 字段状态计算；删除栅格时各列字段会按顺序提升到上一级，不会丢失。"
    />
  </el-form>
</template>
