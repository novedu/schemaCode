<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Document,
  Download,
  Plus,
  Operation,
  Promotion,
} from '@element-plus/icons-vue'
import ConditionNodeEditor from './condition-builder/ConditionNodeEditor.vue'
import FieldActionEditor from './action-builder/FieldActionEditor.vue'
import { useRuleStore } from './rule-store'
import { validateRuleDoc } from './rule-builder'
import { exportDesignerBundle } from '../export-bundle'
import { useGatewayPublish } from '../config/use-gateway-publish'

/**
 * RuleDesigner（规则设计器页面）
 *
 *   左：规则列表（一个文档 = 一条产生式规则）
 *   中：规则元信息（名称/优先级）+ Condition Builder（递归 AND/OR 树）
 *   右：Action Builder（目标字段三态动作）
 *
 * Rule JSON 由 rule-store 的 currentRules（核心 Rule[]）实时派生，
 * 抽屉中预览；导出产出 rules.json（与 Schema Designer 的 schema.json
 * 组成完整的运行时产物 bundle）。
 */
const {
  state,
  currentRules,
  selectedRule,
  addRule,
  deleteRule,
  selectRule,
  patchRule,
} = useRuleStore()

const { busy, saveDraft, publishVersion } = useGatewayPublish()

const jsonDrawer = ref(false)

/** 当前全部规则的 Rule JSON（就是 rules.json 文件内容） */
const rulesJson = computed(() => JSON.stringify(currentRules.value, null, 2))

/** 当前规则的校验提示（实时） */
const validation = computed(() =>
  selectedRule.value ? validateRuleDoc(selectedRule.value) : null,
)

onMounted(() => {
  // 默认选中第一条，避免中间区域空白
  if (!state.selectedRuleId && state.docs.length > 0) {
    selectRule(state.docs[0].id)
  }
})

async function onDeleteRule(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm('删除该规则？', '删除规则', { type: 'warning' })
    deleteRule(id)
  } catch {
    // 用户取消
  }
}

function onExport(): void {
  // 导出前逐条校验；有问题先提示作者，不静默产出半成品
  const problems = state.docs
    .map((doc) => ({ name: doc.name, ...validateRuleDoc(doc) }))
    .filter((v) => !v.valid)

  if (problems.length > 0) {
    ElMessage.warning(`规则未配完整：${problems[0].name} — ${problems[0].errors[0]}`)
    return
  }

  exportDesignerBundle()
  ElMessage.success('已导出 schema.json / rules.json（核心 Rule 原生格式）')
}
</script>

<template>
  <div class="rule-designer">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <el-icon class="logo"><Operation /></el-icon>
        <el-tag size="small" type="success" effect="plain">Rule Designer · 规则设计时</el-tag>
        <el-text type="info" size="small">
          规则只引用 Schema Designer 中已存在的字段
        </el-text>
      </div>
      <div class="toolbar-right">
        <el-button size="small" :icon="Document" @click="jsonDrawer = true">
          Rule JSON 预览
        </el-button>
        <el-button size="small" :loading="busy" @click="saveDraft">
          保存草稿
        </el-button>
        <el-button size="small" type="success" :icon="Promotion" :loading="busy" @click="publishVersion">
          发布版本
        </el-button>
        <el-button size="small" :icon="Download" @click="onExport">
          导出 Bundle
        </el-button>
      </div>
    </header>

    <div class="columns">
      <!-- 左：规则列表 -->
      <aside class="pane pane-left">
        <el-button
          size="small"
          type="primary"
          plain
          class="add-rule"
          :icon="Plus"
          @click="addRule"
        >
          新建规则
        </el-button>

        <div
          v-for="doc in state.docs"
          :key="doc.id"
          class="rule-item"
          :class="{ active: doc.id === state.selectedRuleId }"
          @click="selectRule(doc.id)"
        >
          <div class="rule-item-name">{{ doc.name }}</div>
          <div class="rule-item-meta">
            priority={{ doc.priority }} ·
            {{ Object.keys(doc.then).length }} 个动作
          </div>
          <el-button
            type="danger"
            text
            size="small"
            class="rule-item-del"
            :icon="Delete"
            @click.stop="onDeleteRule(doc.id)"
          />
        </div>
      </aside>

      <!-- 中：条件构建 -->
      <main class="pane pane-center">
        <el-empty v-if="!selectedRule" description="选择或新建一条规则" />

        <template v-else>
          <div class="rule-meta">
            <el-input
              :model-value="selectedRule.name"
              size="small"
              class="rule-name"
              @update:model-value="(v: string) => patchRule(selectedRule!.id, { name: v })"
            />
            <div class="priority-box">
              <el-text type="info" size="small">优先级 priority</el-text>
              <el-input-number
                :model-value="selectedRule.priority"
                size="small"
                :min="0"
                controls-position="right"
                @update:model-value="(v?: number) => patchRule(selectedRule!.id, { priority: v ?? 0 })"
              />
            </div>
          </div>

          <!-- 校验提示 -->
          <el-alert
            v-if="validation && !validation.valid"
            :title="validation.errors.join('；')"
            type="warning"
            show-icon
            :closable="false"
            class="validation-alert"
          />

          <div class="pane-section-title">WHEN（条件成立时）</div>
          <ConditionNodeEditor
            :node="selectedRule.when"
            :rule-id="selectedRule.id"
            is-root
          />
        </template>
      </main>

      <!-- 右：动作构建 -->
      <aside class="pane pane-right">
        <div class="pane-section-title">THEN（执行字段状态变更）</div>
        <FieldActionEditor v-if="selectedRule" :doc="selectedRule" />
        <el-empty v-else description="先选择规则" :image-size="60" />
      </aside>
    </div>

    <!-- Rule JSON 抽屉 -->
    <el-drawer
      v-model="jsonDrawer"
      title="rules.json · 核心 Rule 原生格式（可直接被 Runtime Core 加载）"
      size="52%"
    >
      <pre class="json">{{ rulesJson }}</pre>
    </el-drawer>
  </div>
</template>

<style scoped>
.rule-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
}
.toolbar {
  height: 54px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo {
  color: #67c23a;
  font-size: 20px;
}

.columns {
  flex: 1;
  display: flex;
  min-height: 0;
}
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pane-left {
  width: 226px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  padding: 14px;
  overflow: auto;
  flex-shrink: 0;
}
.pane-center {
  flex: 1;
  padding: 14px 18px;
  overflow: auto;
}
.pane-right {
  width: 340px;
  background: #fff;
  border-left: 1px solid #ebeef5;
  padding: 14px;
  overflow: auto;
  flex-shrink: 0;
}
.pane-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}

.add-rule {
  width: 100%;
  margin-bottom: 12px;
}
.rule-item {
  position: relative;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px 30px 10px 10px;
  margin-bottom: 8px;
  cursor: pointer;
}
.rule-item.active {
  border-color: #67c23a;
  background: #f0f9eb;
}
.rule-item-name {
  font-size: 13px;
  color: #303133;
}
.rule-item-meta {
  font-size: 11px;
  color: #a8abb2;
  margin-top: 2px;
}
.rule-item-del {
  position: absolute;
  top: 6px;
  right: 4px;
}

.rule-meta {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
}
.rule-name {
  flex: 1;
}
.priority-box {
  display: flex;
  align-items: center;
  gap: 8px;
}
.validation-alert {
  margin-bottom: 12px;
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
}
</style>
