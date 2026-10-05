<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../store/designer-store'
import { componentTemplates } from '../component-library/component-list'

/**
 * FieldPropertyPanel（字段属性面板）
 *
 * 编辑节点的字段标识层：field（字段名）、label、component、required、
 * Select 的 options。所有修改通过 store.patchSelected 进入节点树，
 * Schema JSON、Canvas、Preview 下一拍同步。
 */
const { selectedNode, patchSelected } = useDesignerStore()

/** 仅字段节点可编辑（容器由 ContainerPropertyPanel 负责） */
const node = computed(() => {
  const n = selectedNode.value
  return n && n.kind === 'field' ? n : null
})
const isSelect = computed(() => node.value?.component === 'SelectInput')

function updateField(key: 'field' | 'label' | 'component' | 'required', value: string | boolean): void {
  patchSelected({ [key]: value })
}

/* options 编辑（只对 SelectInput 可见） */
function addOption(): void {
  const options = node.value?.options ?? []
  const index = options.length + 1
  patchSelected({
    options: [...options, { label: `选项${index}`, value: `option${index}` }],
  })
}

function updateOption(index: number, key: 'label' | 'value', value: string): void {
  const options = (node.value?.options ?? []).map((o, i) =>
    i === index ? { ...o, [key]: value } : o,
  )
  patchSelected({ options })
}

function removeOption(index: number): void {
  patchSelected({
    options: (node.value?.options ?? []).filter((_, i) => i !== index),
  })
}
</script>

<template>
  <el-empty v-if="!node" description="选中画布节点后编辑字段属性" :image-size="70" />

  <el-form v-else label-width="72px" size="small">
    <el-form-item label="字段名">
      <el-input
        :model-value="node.field"
        placeholder="如 amount"
        @update:model-value="(v: string) => updateField('field', v)"
      />
    </el-form-item>

    <el-form-item label="标签">
      <el-input
        :model-value="node.label"
        @update:model-value="(v: string) => updateField('label', v)"
      />
    </el-form-item>

    <el-form-item label="组件">
      <el-select
        :model-value="node.component"
        style="width: 100%"
        @update:model-value="(v: string) => updateField('component', v)"
      >
        <el-option
          v-for="t in componentTemplates"
          :key="t.component"
          :label="t.label"
          :value="t.component"
        />
      </el-select>
    </el-form-item>

    <el-form-item label="必填">
      <el-switch
        :model-value="node.required"
        @update:model-value="(v: boolean) => updateField('required', v)"
      />
    </el-form-item>

    <!-- Select 选项编辑 -->
    <template v-if="isSelect">
      <el-divider content-position="left">选项 options</el-divider>

      <div
        v-for="(o, i) in node.options"
        :key="i"
        class="option-row"
      >
        <el-input
          :model-value="o.label"
          placeholder="显示名"
          @update:model-value="(v: string) => updateOption(i, 'label', v)"
        />
        <el-input
          :model-value="o.value"
          placeholder="值"
          @update:model-value="(v: string) => updateOption(i, 'value', v)"
        />
        <el-button type="danger" text @click="removeOption(i)">删</el-button>
      </div>

      <el-button size="small" class="add-option" @click="addOption">
        + 添加选项
      </el-button>
    </template>
  </el-form>
</template>

<style scoped>
.option-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}
.add-option {
  margin-top: 4px;
}
</style>
