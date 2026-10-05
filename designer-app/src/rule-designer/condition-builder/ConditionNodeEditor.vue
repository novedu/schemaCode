<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import OperatorSelector from './OperatorSelector.vue'
import { useRuleStore } from '../rule-store'
import { useDesignerStore } from '../../store/designer-store'
import type {
  DesignerCondition,
  DesignerConditionNode,
  DesignerGroup,
} from '../rule-model'

/**
 * ConditionNodeEditor（条件树节点 · 递归编辑器）
 *
 * "树形数据结构 + 递归组件"是任意深度 AND/OR 嵌套的最小复杂度方案：
 *
 *   group(AND)
 *   ├─ condition: customerType = company
 *   └─ group(OR)
 *       ├─ condition: registeredCapital > 1000
 *       └─ condition: companyName notEmpty
 *
 * 每个组内是同一个连接符；混合逻辑通过嵌套子组表达，等价于括号。
 * 字段下拉来自 Schema Designer 的当前产物——规则只能引用页面上存在的字段。
 */
const props = defineProps<{
  node: DesignerConditionNode
  ruleId: string
  /** 根节点不可删 */
  isRoot?: boolean
}>()

const { patchTreeNode, addCondition, addGroup, deleteTreeNode } = useRuleStore()
const { currentSchema } = useDesignerStore()

/** Schema 当前字段：value=字段名，label=标签（字段名） */
const fieldOptions = computed(() =>
  currentSchema.value.fields.map((f) => ({
    value: f.name,
    label: `${f.label} (${f.name})`,
  })),
)

/* ── 叶子编辑（模板内 node 不会被判别收窄，统一收联合类型后内部收窄） ── */

function asLeaf(node: DesignerConditionNode): DesignerCondition | null {
  return node.kind === 'condition' ? node : null
}

function updateField(node: DesignerConditionNode, field: string): void {
  const leaf = asLeaf(node)
  if (!leaf) return
  patchTreeNode(props.ruleId, leaf.nodeId, { field })
}

function updateOperator(node: DesignerConditionNode, operator: DesignerCondition['operator']): void {
  const leaf = asLeaf(node)
  if (!leaf) return
  // 切到 notEmpty 时清掉 value（核心 notEmpty 不读期望值）
  patchTreeNode(props.ruleId, leaf.nodeId, {
    operator,
    value: operator === 'notEmpty' ? undefined : leaf.value,
  })
}

/** 值输入的字符串展示 */
function valueText(node: DesignerConditionNode): string {
  const leaf = asLeaf(node)
  if (!leaf || leaf.value === undefined || leaf.value === null) return ''
  return String(leaf.value)
}

/**
 * 文本 → 条件值：纯数字转 number，其余保持字符串。
 * 引擎 equals 是严格相等，customerType 的 "company" 必须保持字符串。
 */
function parseConditionValue(text: string): unknown {
  if (text.trim() !== '' && !Number.isNaN(Number(text))) return Number(text)
  return text
}

function updateValue(node: DesignerConditionNode, text: string): void {
  const leaf = asLeaf(node)
  if (!leaf) return
  patchTreeNode(props.ruleId, leaf.nodeId, { value: parseConditionValue(text) })
}

/* ── 组编辑 ── */

function updateCombinator(node: DesignerConditionNode, combinator: DesignerGroup['combinator']): void {
  if (node.kind !== 'group') return
  patchTreeNode(props.ruleId, node.nodeId, { combinator })
}
</script>

<template>
  <!-- 条件组 -->
  <div v-if="node.kind === 'group'" class="cond-group">
    <div class="group-toolbar">
      <el-radio-group
        :model-value="node.combinator"
        size="small"
        @update:model-value="(v: 'and' | 'or') => updateCombinator(node, v)"
      >
        <el-radio-button value="and">AND（且）</el-radio-button>
        <el-radio-button value="or">OR（或）</el-radio-button>
      </el-radio-group>

      <el-button
        v-if="!isRoot"
        type="danger"
        text
        size="small"
        :icon="Delete"
        @click="deleteTreeNode(ruleId, node.nodeId)"
      >
        删除整组
      </el-button>
    </div>

    <div class="group-children">
      <ConditionNodeEditor
        v-for="child in node.children"
        :key="child.nodeId"
        :node="child"
        :rule-id="ruleId"
      />

      <el-empty
        v-if="node.children.length === 0"
        description="空组（请在下方添加条件）"
        :image-size="48"
      />
    </div>

    <div class="group-actions">
      <el-button size="small" :icon="Plus" @click="addCondition(ruleId, node.nodeId)">
        添加条件
      </el-button>
      <el-button size="small" @click="addGroup(ruleId, node.nodeId)">
        + 添加条件组（括号）
      </el-button>
    </div>
  </div>

  <!-- 条件叶子 -->
  <div v-else class="cond-leaf">
    <el-select
      :model-value="node.field"
      size="small"
      class="field-select"
      filterable
      placeholder="选择字段"
      @update:model-value="(v: string) => updateField(node, v)"
    >
      <el-option
        v-for="o in fieldOptions"
        :key="o.value"
        :label="o.label"
        :value="o.value"
      />
    </el-select>

    <OperatorSelector
      :model-value="node.operator"
      @update:model-value="(op) => updateOperator(node, op)"
    />

    <el-input
      v-if="node.operator !== 'notEmpty'"
      :model-value="valueText(node)"
      size="small"
      class="value-input"
      placeholder="比较值，如 company / 1000"
      @update:model-value="(v: string) => updateValue(node, v)"
    />

    <el-button
      type="danger"
      text
      size="small"
      :icon="Delete"
      @click="deleteTreeNode(ruleId, node.nodeId)"
    />
  </div>
</template>

<style scoped>
/* 条件组 */
.cond-group {
  border: 1px dashed #c0c4cc;
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
}
.group-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.group-children {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 10px;
  border-left: 2px solid #dcdfe6;
  margin-bottom: 10px;
}
.group-actions {
  display: flex;
  gap: 8px;
}

/* 条件叶子 */
.cond-leaf {
  display: flex;
  gap: 8px;
  align-items: center;
}
.field-select {
  width: 200px;
  flex-shrink: 0;
}
.value-input {
  flex: 1;
  min-width: 120px;
}
</style>
