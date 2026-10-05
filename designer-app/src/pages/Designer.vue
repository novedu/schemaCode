<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Download,
  FolderOpened,
  MagicStick,
  Promotion,
  Top,
  Bottom,
} from '@element-plus/icons-vue'
import Canvas from '../canvas/Canvas.vue'
import FieldPropertyPanel from '../property-panel/FieldPropertyPanel.vue'
import ComponentPropertyPanel from '../property-panel/ComponentPropertyPanel.vue'
import ContainerPropertyPanel from '../property-panel/ContainerPropertyPanel.vue'
import GridPropertyPanel from '../property-panel/GridPropertyPanel.vue'
import RuntimePreview from '../preview/RuntimePreview.vue'
import SchemaTree from '../tree/SchemaTree.vue'
import { componentTemplates } from '../component-library/component-list'
import { useDesignerStore } from '../store/designer-store'
import { exportDesignerBundle } from '../export-bundle'
import { useGatewayPublish } from '../config/use-gateway-publish'

/**
 * Designer 主页面 · 三栏布局
 *
 *   左：组件库（字段物料 + 布局容器）
 *   中：Canvas（核心 Renderer 驱动 + 结构化布局树）
 *   右：属性面板（字段属性 / 容器属性 / 组件 props）
 *
 * 底部抽屉：RuntimePreview（产物 JSON + 组件解析结果）。
 * 工具栏：表单标题、清空、上移/下移、预览、导出。
 */
const {
  state,
  selectedNode,
  fieldCount,
  addFromTemplate,
  addContainer,
  addGrid,
  deleteSelected,
  moveSelected,
  clearCanvas,
  setFormId,
} = useDesignerStore()

const { busy, saveDraft, publishVersion } = useGatewayPublish()

const previewVisible = ref(false)

function onExport(): void {
  if (state.doc.nodes.length === 0) {
    ElMessage.warning('画布为空，先添加组件')
    return
  }
  exportDesignerBundle()
  ElMessage.success('已导出 Bundle（离线调试用），并保存到浏览器')
}

async function onClear(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定清空画布？此操作不可撤销。', '清空画布', {
      type: 'warning',
    })
    clearCanvas()
  } catch {
    // 用户取消
  }
}

/** 物料拖拽：payload 放进 dataTransfer，画布/容器 drop 时创建节点 */
function onMaterialDragStart(event: DragEvent, component: string): void {
  event.dataTransfer?.setData(
    'application/x-canvas-node',
    JSON.stringify(
      component === '__container__'
        ? { type: 'container' }
        : { type: 'template', component },
    ),
  )
}

function onGridDragStart(event: DragEvent, columns: 2 | 3): void {
  event.dataTransfer?.setData(
    'application/x-canvas-node',
    JSON.stringify({ type: 'grid', columns }),
  )
}
</script>

<template>
  <div class="designer">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <el-icon class="logo"><MagicStick /></el-icon>
        <el-input
          :model-value="state.doc.title"
          size="small"
          class="title-input"
          @update:model-value="(v: string) => (state.doc.title = v)"
        />
        <el-input
          :model-value="state.doc.formId"
          size="small"
          class="form-id-input"
          placeholder="formId"
          @update:model-value="(v: string) => setFormId(v)"
        >
          <template #prepend class="prepend-text">formId</template>
        </el-input>
      </div>

      <div class="toolbar-right">
        <el-button-group>
          <el-button size="small" :icon="Top" :disabled="!selectedNode" @click="moveSelected(-1)" />
          <el-button size="small" :icon="Bottom" :disabled="!selectedNode" @click="moveSelected(1)" />
        </el-button-group>
        <el-button size="small" :icon="Delete" :disabled="!selectedNode" @click="deleteSelected">
          删除节点
        </el-button>
        <el-button size="small" @click="onClear">清空</el-button>
        <el-button size="small" @click="previewVisible = true">产物预览</el-button>

        <!-- Config Gateway：保存草稿 / 发布版本 -->
        <el-button
          size="small"
          :loading="busy"
          @click="saveDraft"
        >
          保存草稿
        </el-button>
        <el-button
          size="small"
          type="success"
          :icon="Promotion"
          :loading="busy"
          @click="publishVersion"
        >
          发布版本
        </el-button>

        <el-button size="small" :icon="Download" @click="onExport">
          导出 Bundle
        </el-button>
      </div>
    </header>

    <!-- 三栏主体 -->
    <div class="columns">
      <!-- 左：组件库 -->
      <aside class="pane pane-left">
        <div class="materials-section">
          <div class="pane-title">组件库</div>
          <div class="pane-hint">点击或拖拽组件到画布</div>

          <div
            v-for="t in componentTemplates"
            :key="t.component"
            class="material"
            draggable="true"
            @click="addFromTemplate(t)"
            @dragstart="onMaterialDragStart($event, t.component)"
          >
            <el-icon class="material-icon"><MagicStick /></el-icon>
            <div class="material-meta">
              <div class="material-label">{{ t.label }}</div>
              <div class="material-name">{{ t.component }}</div>
            </div>
          </div>

          <el-divider content-position="left" class="lib-divider">布局</el-divider>

          <div
            class="material material-container"
            draggable="true"
            @click="addContainer()"
            @dragstart="onMaterialDragStart($event, '__container__')"
          >
            <el-icon class="material-icon"><FolderOpened /></el-icon>
            <div class="material-meta">
              <div class="material-label">Container · 分组容器</div>
              <div class="material-name">Container</div>
            </div>
          </div>

          <div
            class="material material-grid"
            draggable="true"
            @click="addGrid(2)"
            @dragstart="onGridDragStart($event, 2)"
          >
            <el-icon class="material-icon"><FolderOpened /></el-icon>
            <div class="material-meta">
              <div class="material-label">Grid · 2列</div>
              <div class="material-name">Grid</div>
            </div>
          </div>

          <div
            class="material material-grid"
            draggable="true"
            @click="addGrid(3)"
            @dragstart="onGridDragStart($event, 3)"
          >
            <el-icon class="material-icon"><FolderOpened /></el-icon>
            <div class="material-meta">
              <div class="material-label">Grid · 3列</div>
              <div class="material-name">Grid</div>
            </div>
          </div>
        </div>

        <div class="tree-section">
          <div class="pane-title">结构</div>
          <SchemaTree />
        </div>
      </aside>

      <!-- 中：画布 -->
      <main class="pane pane-center">
        <div class="canvas-header">
          <span class="pane-title">画布</span>
          <el-text type="info" size="small">
            由 Runtime Renderer 实时渲染 · 共 {{ fieldCount }} 个字段
          </el-text>
        </div>
        <Canvas />
      </main>

      <!-- 右：属性面板 -->
      <aside class="pane pane-right">
        <!-- 选中容器 → 容器属性；选中栅格 → 栅格属性；否则字段/组件两页签 -->
        <ContainerPropertyPanel v-if="selectedNode?.kind === 'container'" />
        <GridPropertyPanel v-else-if="selectedNode?.kind === 'grid'" />
        <el-tabs v-else model-value="field" class="props-tabs">
          <el-tab-pane label="字段属性" name="field">
            <FieldPropertyPanel />
          </el-tab-pane>
          <el-tab-pane label="组件 props" name="component">
            <ComponentPropertyPanel />
          </el-tab-pane>
        </el-tabs>
      </aside>
    </div>

    <!-- 产物预览抽屉 -->
    <el-drawer
      v-model="previewVisible"
      title="Runtime 产物预览 · Design Time → Runtime"
      size="52%"
    >
      <RuntimePreview />
    </el-drawer>
  </div>
</template>

<style scoped>
.designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
}

/* 工具栏 */
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
  color: #409eff;
  font-size: 20px;
}
.title-input {
  width: 160px;
}
.form-id-input {
  width: 210px;
}
.form-id-input :deep(.el-input-group__prepend) {
  font-size: 11px;
  padding: 0 8px;
}

/* 三栏 */
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
  width: 236px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  padding: 14px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* 物料区域可滚动 */
.materials-section {
  flex-shrink: 0;
  overflow-y: auto;
  max-height: 50%;
}

/* Schema Tree 区域占剩余空间，独立滚动 */
.tree-section {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #ebeef5;
  overflow-y: auto;
}
.pane-center {
  flex: 1;
  padding: 14px 18px;
  overflow: auto;
}
.pane-right {
  width: 300px;
  background: #fff;
  border-left: 1px solid #ebeef5;
  flex-shrink: 0;
  overflow: auto;
}
.pane-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.pane-hint {
  font-size: 11px;
  color: #a8abb2;
  margin: 2px 0 12px;
}
.lib-divider {
  margin: 10px 0 12px;
}
.lib-divider :deep(.el-divider__text) {
  font-size: 12px;
  color: #909399;
}

/* 物料 */
.material {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.material:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
}
.material-icon {
  color: #409eff;
  font-size: 18px;
}
.material-container .material-icon {
  color: #e6a23c;
}
.material-grid .material-icon {
  color: #67c23a;
}
.material-label {
  font-size: 13px;
  color: #303133;
}
.material-name {
  font-size: 11px;
  color: #a8abb2;
  font-family: ui-monospace, monospace;
}

/* 画布头 */
.canvas-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.props-tabs {
  padding: 0 12px;
}
.props-tabs :deep(.el-tabs__content) {
  overflow: auto;
}
</style>
