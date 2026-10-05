<script setup lang="ts">
import { ref } from 'vue'
import { EditPen, Key, Operation } from '@element-plus/icons-vue'
import Designer from './pages/Designer.vue'
import RuleDesigner from './rule-designer/RuleDesigner.vue'
import PermissionDesigner from './permission-designer/PermissionDesigner.vue'

/**
 * App 外壳：三个设计器的切换入口。
 *
 *   Schema Designer     → 配置页面长什么样（产出核心 Schema）
 *   Rule Designer       → 配置动态行为（产出核心 Rule[]）
 *   Permission Designer → 配置角色权限（产出 permission.json）
 *
 * 三个设计器互不感知，产物在 export-bundle 统一装配。
 */
type ActiveDesigner = 'schema' | 'rule' | 'permission'
const active = ref<ActiveDesigner>('schema')
</script>

<template>
  <div class="app-shell">
    <!-- 设计器切换条 -->
    <nav class="switcher">
      <div class="brand">Low-Code Designer</div>

      <el-radio-group v-model="active" size="small">
        <el-radio-button value="schema">
          <el-icon class="btn-icon"><EditPen /></el-icon>
          Schema Designer
        </el-radio-button>
        <el-radio-button value="rule">
          <el-icon class="btn-icon"><Operation /></el-icon>
          Rule Designer
        </el-radio-button>
        <el-radio-button value="permission">
          <el-icon class="btn-icon"><Key /></el-icon>
          Permission Designer
        </el-radio-button>
      </el-radio-group>
    </nav>

    <div class="designer-stage">
      <Designer v-if="active === 'schema'" />
      <RuleDesigner v-else-if="active === 'rule'" />
      <PermissionDesigner v-else />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.switcher {
  height: 40px;
  background: #263445;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 14px;
  flex-shrink: 0;
}
.brand {
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.btn-icon {
  margin-right: 4px;
  vertical-align: -2px;
}
.designer-stage {
  flex: 1;
  min-height: 0;
}
</style>
