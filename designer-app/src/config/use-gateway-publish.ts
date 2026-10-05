import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { gatewayClient, GatewayError } from './config-gateway-client'
import { getDesignerBundle } from '../export-bundle'
import { useDesignerStore } from '../store/designer-store'
import type { FormBundle } from '../../../config-server/types'

/**
 * useGatewayPublish（设计器发布动作）
 *
 * 三个 Designer 共用同一套发布行为，保持它们彼此独立：
 * 发布时实时装配 Bundle（schema+rules+permissions），再交给网关。
 *
 *   保存草稿 → saveDraftAuto（网关决定写哪个版本）
 *   发布版本 → saveDraftAuto + publish（Validation 失败时展示错误报告）
 */
export function useGatewayPublish() {
  const { state } = useDesignerStore()
  const busy = ref(false)

  function currentFormId(): string {
    return state.doc.formId.trim() || 'customForm'
  }

  /**
   * 实时装配网关 Bundle。
   * 文件导出里字段叫 permission（历史命名），网关 FormDefinition
   * 契约字段为 permissions —— 仅在此边界做一次映射。
   */
  function currentGatewayBundle(): FormBundle {
    const bundle = getDesignerBundle()
    return { schema: bundle.schema, rules: bundle.rules, permissions: bundle.permission }
  }

  async function saveDraft(): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      const def = await gatewayClient.saveDraftAuto(
        currentFormId(),
        currentGatewayBundle(),
      )
      ElMessage.success(`草稿已保存：${def.formId}@v${def.version}（draft）`)
    } catch (error) {
      ElMessage.error((error as Error).message)
    } finally {
      busy.value = false
    }
  }

  async function publishVersion(): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      const def = await gatewayClient.saveAndPublish(
        currentFormId(),
        currentGatewayBundle(),
      )
      ElMessage.success(`已发布：${def.formId}@v${def.version}（published，Runtime 可加载）`)
    } catch (error) {
      // Validation 失败 → 展示错误报告
      if (error instanceof GatewayError && error.code === 'PublishValidationError') {
        const issues = (error.body?.validation as { issues?: Array<{ code: string; severity: string; message: string }> })?.issues ?? []
        const errorCount = issues.filter((i) => i.severity === 'error').length
        const warningCount = issues.filter((i) => i.severity === 'warning').length

        let content = `发现 ${errorCount} 个错误`
        if (warningCount > 0) content += `、${warningCount} 个警告`
        content += '：\n\n'

        issues.forEach((issue, idx: number) => {
          const icon = issue.severity === 'error' ? '❌' : '⚠️'
          content += `${idx + 1}. ${icon} ${issue.message}\n`
        })

        ElMessageBox.alert(content, '发布失败：配置校验未通过', {
          type: 'error',
          confirmButtonText: '知道了',
        })
      } else {
        ElMessage.error((error as Error).message)
      }
    } finally {
      busy.value = false
    }
  }

  return { busy, saveDraft, publishVersion }
}
