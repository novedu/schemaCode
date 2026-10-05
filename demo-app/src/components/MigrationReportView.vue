<script setup lang="ts">
import type { MigrationReport } from '@runtime-core/migration/types'
import type { ExecutionReport } from '@runtime-core/migration/execution/types'

/**
 * MigrationReport View
 *
 * 渲染核心迁移模块产出的两份报告：
 *   - MigrationReport：校验阶段（checks / errors / warnings / manualRequired）
 *   - ExecutionReport：执行阶段（状态 / 操作日志 / failures）
 */
defineProps<{
  validation?: MigrationReport
  execution?: ExecutionReport
}>()

const STATUS_TYPE: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  pass: 'success',
  warning: 'warning',
  manual: 'info',
  error: 'danger',
  success: 'success',
}
</script>

<template>
  <div class="migration-report">
    <template v-if="validation">
      <el-descriptions :column="3" border size="small" class="block">
        <el-descriptions-item label="总体状态">
          <el-tag :type="STATUS_TYPE[validation.status] ?? 'info'" size="small">
            {{ validation.status.toUpperCase() }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="errors">{{ validation.errors.length }}</el-descriptions-item>
        <el-descriptions-item label="warnings">{{ validation.warnings.length }}</el-descriptions-item>
      </el-descriptions>

      <el-table :data="validation.checks" size="small" border class="block">
        <el-table-column prop="name" label="检查项" />
        <el-table-column label="结果" width="120">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status] ?? 'info'" size="small">
              {{ row.status.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        v-for="(m, i) in validation.manualRequired"
        :key="`m${i}`"
        :title="m"
        type="info"
        :closable="false"
        show-icon
        class="line"
      />
      <el-alert
        v-for="(w, i) in validation.warnings"
        :key="`w${i}`"
        :title="w"
        type="warning"
        :closable="false"
        show-icon
        class="line"
      />
      <el-alert
        v-for="(e, i) in validation.errors"
        :key="`e${i}`"
        :title="e"
        type="error"
        :closable="false"
        show-icon
        class="line"
      />
    </template>

    <template v-if="execution">
      <el-descriptions :column="2" border size="small" class="block">
        <el-descriptions-item label="执行状态">
          <el-tag
            :type="execution.status === 'success' ? 'success' : execution.status === 'alreadyExecuted' ? 'info' : 'warning'"
            size="small"
          >
            {{ execution.status.toUpperCase() }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="dryRun">{{ String(execution.dryRun) }}</el-descriptions-item>
      </el-descriptions>

      <el-table
        :data="execution.operations ?? []"
        size="small"
        border
        class="block"
      >
        <el-table-column prop="action" label="动作" width="90" />
        <el-table-column prop="sourceField" label="源" width="110" />
        <el-table-column prop="targetField" label="目标" />
        <el-table-column label="before" width="100">
          <template #default="{ row }">{{ JSON.stringify(row.before) }}</template>
        </el-table-column>
        <el-table-column label="after" width="100">
          <template #default="{ row }">{{ JSON.stringify(row.after) }}</template>
        </el-table-column>
      </el-table>

      <el-alert
        v-for="(f, i) in execution.failures"
        :key="i"
        :title="`#${f.index} ${f.reason}`"
        type="error"
        :closable="false"
        show-icon
        class="line"
      />
    </template>
  </div>
</template>

<style scoped>
.block {
  margin-bottom: 12px;
}
.line {
  margin-top: 6px;
}
</style>
