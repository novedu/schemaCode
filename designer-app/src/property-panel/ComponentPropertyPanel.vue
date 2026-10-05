<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../store/designer-store'

/**
 * ComponentPropertyPanel（组件属性 / props 面板）
 *
 * 编辑节点 props 的通用键值编辑器：如 MoneyInput 的
 * precision 2 → 4、currency CNY → USD。
 *
 * 值按 JSON 语义解析：数字/布尔自动转型，解析失败保留字符串，
 * 让作者对写入产物负责。props 的键名可自由扩展，
 * 组件若不认识会在运行时忽略，不影响其他字段。
 */
const { selectedNode, patchSelected } = useDesignerStore()

/** 仅字段节点有 props（容器是纯布局节点） */
const node = computed(() => {
  const n = selectedNode.value
  return n && n.kind === 'field' ? n : null
})

const propEntries = computed(() =>
  Object.entries(node.value?.props ?? {}).map(([key, value]) => ({
    key,
    value,
    text: typeof value === 'string' ? value : JSON.stringify(value),
  })),
)

/** 序列化展示（字符串原样，其余 JSON） */
function toText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** 反向解析：数字 → number，true/false → boolean，其余保持字符串 */
function parseValue(text: string): unknown {
  if (text.trim() !== '' && !Number.isNaN(Number(text))) return Number(text)
  if (text === 'true') return true
  if (text === 'false') return false
  return text
}

function updateProp(oldKey: string, newKey: string, text: string): void {
  const props: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node.value?.props ?? {})) {
    if (k === oldKey) props[newKey || oldKey] = parseValue(text)
    else props[k] = v
  }
  patchSelected({ props })
}

function addProp(): void {
  patchSelected({
    props: { ...node.value?.props, newProp: 'value' },
  })
}

function removeProp(key: string): void {
  const props = { ...node.value?.props }
  delete props[key]
  patchSelected({ props })
}
</script>

<template>
  <el-empty v-if="!node" description="选中节点后编辑 props" :image-size="70" />

  <div v-else>
    <el-text type="info" size="small">
      组件：{{ node.component }}
    </el-text>

    <div v-if="propEntries.length === 0" class="no-props">
      <el-text type="info" size="small">（暂无 props）</el-text>
    </div>

    <div
      v-for="entry in propEntries"
      :key="entry.key"
      class="prop-row"
    >
      <el-input
        :model-value="entry.key"
        size="small"
        class="prop-key"
        @update:model-value="(k: string) => updateProp(entry.key, k, entry.text)"
      />
      <el-input
        :model-value="toText(entry.value)"
        size="small"
        class="prop-value"
        @update:model-value="(v: string) => updateProp(entry.key, entry.key, v)"
      />
      <el-button type="danger" text size="small" @click="removeProp(entry.key)">
        删
      </el-button>
    </div>

    <el-button size="small" class="add-prop" @click="addProp">
      + 添加 prop
    </el-button>
  </div>
</template>

<style scoped>
.prop-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}
.prop-key {
  width: 110px;
  flex-shrink: 0;
}
.no-props {
  margin: 10px 0 4px;
}
.add-prop {
  margin-top: 10px;
}
</style>
