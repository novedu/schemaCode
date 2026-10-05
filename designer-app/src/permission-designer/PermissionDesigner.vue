<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Download, Key, Promotion } from '@element-plus/icons-vue'
import RoleSelector from './RoleSelector.vue'
import FieldPermissionEditor from './FieldPermissionEditor.vue'
import { usePermissionStore } from './permission-store'
import { selectPatchesForRoles } from './permission-model'
import { exportDesignerBundle } from '../export-bundle'
import { useGatewayPublish } from '../config/use-gateway-publish'

/**
 * PermissionDesigner（权限设计器页面）
 *
 *   顶部：角色管理（RoleSelector）
 *   主体：字段权限矩阵（字段来自当前 Schema，按选中角色编辑稀疏补丁）
 *
 * 预览抽屉：permission.json 全文 + "每个角色将选中的补丁"查表结果。
 * 导出与其他设计器共用 export-bundle，产物三件套一次下载。
 */
const {
  state,
  currentPermission,
  selectRole,
  addCustomRole,
  deleteRole,
} = usePermissionStore()

const { busy, saveDraft, publishVersion } = useGatewayPublish()

const jsonDrawer = ref(false)

/** permission.json 文件内容（实时） */
const permissionJson = computed(() =>
  JSON.stringify(currentPermission.value, null, 2),
)

/** 预览：每个角色 → 字段补丁（声明式配置查表，非运行时求值） */
const roleResolution = computed(() =>
  state.doc.roles.map((role) => {
    const patches = selectPatchesForRoles(state.doc.entries, [role])
    return {
      role,
      fields: Object.entries(patches).map(([field, patch]) => ({
        field,
        patch: JSON.stringify(patch),
      })),
    }
  }),
)

function onExport(): void {
  exportDesignerBundle()
  ElMessage.success(
    `已导出 schema.json / rules.json / permission.json（共 ${currentPermission.value.entries.length} 条权限条目）`,
  )
}
</script>

<template>
  <div class="permission-designer">
    <!-- 顶部工具栏 -->
    <header class="toolbar">
      <div class="toolbar-left">
        <el-icon class="logo"><Key /></el-icon>
        <el-tag size="small" type="warning" effect="plain">
          Permission Designer · 权限设计时
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-button size="small" :icon="Document" @click="jsonDrawer = true">
          permission.json 预览
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

    <!-- 角色管理条 -->
    <div class="role-bar">
      <span class="role-bar-title">正在为角色配置：</span>
      <RoleSelector
        :roles="state.doc.roles"
        :model-value="state.selectedRole"
        @update:model-value="selectRole"
        @add="addCustomRole"
        @remove="deleteRole"
      />
    </div>

    <!-- 字段权限矩阵 -->
    <main class="editor-main">
      <FieldPermissionEditor />
    </main>

    <!-- 预览抽屉 -->
    <el-drawer
      v-model="jsonDrawer"
      title="permission.json · 声明式权限表（经 FieldStateResolver 裁决）"
      size="56%"
    >
      <div class="section">
        <div class="section-title">文件内容</div>
        <pre class="json">{{ permissionJson }}</pre>
      </div>

      <div class="section">
        <div class="section-title">角色 → 字段补丁（配置查表预览）</div>
        <el-collapse>
          <el-collapse-item
            v-for="r in roleResolution"
            :key="r.role"
            :title="`${r.role}（${r.fields.length} 个字段）`"
            :name="r.role"
          >
            <el-empty v-if="r.fields.length === 0" description="该角色无任何权限条目（全部不表态）" :image-size="46" />
            <div v-for="f in r.fields" :key="f.field" class="resolved-row">
              <span class="resolved-field">{{ f.field }}</span>
              <code>{{ f.patch }}</code>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.permission-designer {
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
  color: #722ed1;
  font-size: 20px;
}

.role-bar {
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.role-bar-title {
  font-size: 13px;
  color: #303133;
  font-weight: 600;
}

.editor-main {
  flex: 1;
  padding: 16px;
  overflow: auto;
}

.section {
  margin-bottom: 18px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
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
.resolved-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}
.resolved-field {
  font-family: ui-monospace, monospace;
  color: #303133;
  min-width: 130px;
}
</style>
