<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import type { FormData } from '@runtime-core/types'
import type { MigrationReport } from '@runtime-core/migration/types'
import type { ExecutionReport } from '@runtime-core/migration/execution/types'
import { validateMigrationPlan } from '@runtime-core/migration/migration-validator'
import { MigrationExecutor } from '@runtime-core/migration/execution/migration-executor'
import { createRuntimeContext } from '@runtime-core/runtime/runtime-context'
import MigrationReportView from '@/components/MigrationReportView.vue'
import {
  brokenMigrationPlan,
  cloneSample,
  migrationOrderV1,
  migrationOrderV2,
  orderMigrationPlan,
} from '@/mock/migration-data'

/**
 * 迁移中心
 *
 * 完整演示核心迁移管线（全程不进入 Runtime 主链路、不修改历史数据）：
 *
 *   ① 选择源版本/目标版本（v1 → v2）
 *   ② Validation：核心五类 Validator → MigrationReport
 *   ③ Dry Run：核心 Executor（dryRun=true）→ Before/After 预览
 *   ④ Execution：核心 Executor（dryRun=false）→ Operation Log
 *
 * 每一步都调用 Runtime Core 的真实 API，结果不做任何 mock。
 */
const useBrokenPlan = ref(false)
const activeStep = ref(0)

/**
 * 用 shallowRef：样本必须保持普通对象。
 * 核心执行器内部通过 structuredClone 深克隆，而 structuredClone
 * 不能克隆 Vue 的响应式 Proxy（DataCloneError）。
 */
const sourceData = shallowRef<FormData>(cloneSample())

let validation: MigrationReport | null = null
const validationReport = ref<MigrationReport | null>(null)
const dryRunReport = ref<ExecutionReport | null>(null)
const executionReport = ref<ExecutionReport | null>(null)

const steps = [
  { title: '选择版本' },
  { title: 'Validation' },
  { title: 'Dry Run' },
  { title: 'Execution Report' },
]

/* ① 运行校验 */
function runValidation(): void {
  validation = validateMigrationPlan(
    useBrokenPlan.value ? brokenMigrationPlan : orderMigrationPlan,
    {
      sourceSchema: migrationOrderV1,
      targetSchema: migrationOrderV2,
      sampleData: sourceData.value,
      context: createRuntimeContext(),
      permissionConfiguredFields: [],
    },
  )
  validationReport.value = validation
  activeStep.value = 1
}

/* ② Dry Run（核心执行器，默认 dryRun=true） */
function runDryRun(): void {
  if (!validation) return
  const executor = new MigrationExecutor()
  dryRunReport.value = executor.execute(
    useBrokenPlan.value ? brokenMigrationPlan : orderMigrationPlan,
    validation,
    sourceData.value,
    { dryRun: true },
  )
  activeStep.value = 2
}

/* ③ 执行（内存；源数据不变） */
function runExecution(): void {
  if (!validation) return
  const executor = new MigrationExecutor()
  executionReport.value = executor.execute(
    useBrokenPlan.value ? brokenMigrationPlan : orderMigrationPlan,
    validation,
    sourceData.value,
    { dryRun: false },
  )
  activeStep.value = 3
}

function resetAll(): void {
  activeStep.value = 0
  validation = null
  validationReport.value = null
  dryRunReport.value = null
  executionReport.value = null
  sourceData.value = cloneSample()
}

const beforeJson = computed(() => JSON.stringify(sourceData.value, null, 2))
const afterJson = computed(() => JSON.stringify(dryRunReport.value?.migratedData ?? {}, null, 2))
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">Schema Migration Pipeline</span>
          <div>
            <el-switch
              v-model="useBrokenPlan"
              active-text="坏计划（源字段缺失）"
              inline-prompt
              class="broken-switch"
            />
            <el-button size="small" @click="resetAll">重置</el-button>
          </div>
        </div>
      </template>

      <el-steps :active="activeStep" finish-status="success" align-center class="steps">
        <el-step v-for="s in steps" :key="s.title" :title="s.title" />
      </el-steps>

      <!-- 步骤一：版本选择 -->
      <div class="step-body">
        <el-space>
          <el-tag size="large">源版本：v1（amount: number）</el-tag>
          <span>→</span>
          <el-tag size="large" type="success">目标版本：v2（amount: {value, currency}）</el-tag>
        </el-space>

        <div class="sample-box">
          <span class="box-title">源数据：</span>
          <pre>{{ beforeJson }}</pre>
        </div>

        <el-button type="primary" :disabled="activeStep > 0" @click="runValidation">
          运行 Validation
        </el-button>
      </div>
    </el-card>

    <!-- 步骤二：校验报告 -->
    <el-card v-if="validationReport" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">② Validation Report</span>
          <el-button
            type="primary"
            size="small"
            :disabled="activeStep > 1 || validationReport.status === 'error'"
            @click="runDryRun"
          >
            执行 Dry Run
          </el-button>
        </div>
      </template>
      <MigrationReportView :validation="validationReport" />
    </el-card>

    <!-- 步骤三：Dry Run -->
    <el-card v-if="dryRunReport" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">③ Dry Run · Before / After 预览（源数据未改）</span>
          <el-button
            type="primary"
            size="small"
            :disabled="activeStep > 2"
            @click="runExecution"
          >
            执行迁移
          </el-button>
        </div>
      </template>

      <el-row :gutter="16">
        <el-col :span="12">
          <div class="json-box before"><span class="box-title">Before</span><pre>{{ beforeJson }}</pre></div>
        </el-col>
        <el-col :span="12">
          <div class="json-box after"><span class="box-title">After</span><pre>{{ afterJson }}</pre></div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 步骤四：执行报告 -->
    <el-card v-if="executionReport" shadow="never">
      <template #header><span class="card-title">④ Execution Report · Operation Log</span></template>
      <MigrationReportView :execution="executionReport" />
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-weight: 600;
}
.steps {
  margin: 8px 0 24px;
}
.step-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.broken-switch {
  margin-right: 14px;
}
.sample-box,
.json-box {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 10px 14px;
}
.json-box.after {
  background: #0d2b3e;
}
.box-title {
  color: #7fbf7f;
  font-size: 12px;
}
pre {
  color: #d4d4d4;
  font-size: 12px;
  margin: 6px 0 0;
  white-space: pre-wrap;
}
</style>
