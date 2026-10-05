import type { FormDefinition } from '../../../config-server/types'

/**
 * Runtime 配置加载客户端（应用侧适配器）
 *
 * demo-app 获取配置的唯一入口：
 *
 *   loadFormDefinition(formId)           → 最新已发布版本
 *   loadFormDefinition(formId, version)  → 指定已发布版本
 *   listVersions(formId)                 → 版本清单
 *
 * 本 client 只能读到 published：网关不提供 draft 读取路由，
 * 也不存在本地 json / localStorage 兜底。
 *
 * Runtime Core 不参与配置获取——拿到的 FormDefinition 由
 * DesignerPlayground 装配后再喂给核心（Config Server → adapter → Core）。
 * 未来接入真实配置中心时只需重写本文件。
 */

const PREFIX = '/__config'

async function request<T>(path: string): Promise<T> {
  const response = await fetch(PREFIX + path)

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
      message?: string
    }
    const error = new Error(
      body.message ?? `配置网关请求失败（HTTP ${response.status}）`,
    ) as Error & { code?: string }
    error.name = body.error ?? 'GatewayError'
    error.code = body.error
    throw error
  }

  return (await response.json()) as T
}

export const runtimeConfigClient = {
  /**
   * 加载已发布表单定义。
   * version 省略 → 最新发布版本；draft 永远不可见。
   */
  loadFormDefinition(formId: string, version?: number): Promise<FormDefinition> {
    const encoded = encodeURIComponent(formId)
    const path =
      version === undefined
        ? `/forms/${encoded}/published/latest`
        : `/forms/${encoded}/versions/${version}/published`
    return request<FormDefinition>(path)
  },

  listVersions(formId: string): Promise<number[]> {
    return request<number[]>(
      `/forms/${encodeURIComponent(formId)}/versions`,
    )
  },
}
