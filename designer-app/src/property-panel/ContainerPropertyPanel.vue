<script setup lang="ts">
import { useDesignerStore } from '../store/designer-store'

/**
 * ContainerPropertyPanel（容器属性面板）
 *
 * 选中容器时编辑分组标题。容器是纯布局节点：
 * 没有字段名/组件/必填等字段属性，也不参与规则与权限。
 */
const { selectedNode, patchSelected } = useDesignerStore()
</script>

<template>
  <el-empty
    v-if="!selectedNode || selectedNode.kind !== 'container'"
    description="选中画布容器后编辑属性"
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

    <el-form-item label="子节点">
      <el-text type="info" size="small">
        {{ selectedNode.children.length }} 项（字段 / 嵌套容器）
      </el-text>
    </el-form-item>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="容器是纯布局分组"
      description="不参与规则 / 权限 / 字段状态计算；删除容器时其中的字段会提升到上一级，不会丢失。"
    />
  </el-form>
</template>
