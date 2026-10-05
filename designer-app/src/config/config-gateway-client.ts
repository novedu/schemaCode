import type {
  FormBundle,
  FormDefinition,
} from '../../../config-server/types'

/**
 * Config Gateway 浏览器客户端
 *
 * 设计器与网关之间唯一的传输边界：全部调用走 fetch，不直接 import
 * config-server 的内存模块（那会在浏览器里另开一份 Map）。
 *
 * 未来接入真实配置中心时：本文件是唯一需要重写的文件
 * （换成真实 API 路径与鉴权头），调用方零改动。
 */

const PREFIX = '/__config'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(PREFIX + path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string
      message?: string
      validation?: { valid: boolean; issues: Array<{ code: string; severity: string; message: string }> }
    }
    throw new GatewayError(
      body.message ?? `配置网关请求失败（HTTP ${response.status}）`,
      body.error,
      body,
    )
  }

  return (await response.json()) as T
}

export class GatewayError extends Error {
  readonly code?: string
  readonly body?: Record<string, unknown>

  constructor(message: string, code?: string, body?: Record<string, unknown>) {
    super(message)
    this.name = code ?? 'GatewayError'
    this.code = code
    this.body = body
  }
}

export const gatewayClient = {
  /** 版本清单（升序） */
  listVersions(formId: string): Promise<number[]> {
    return request<number[]>(`/forms/${encodeURIComponent(formId)}/versions`)
  },

  /** 保存指定版本草稿 */
  saveDraft(
    formId: string,
    version: number,
    bundle: FormBundle,
  ): Promise<FormDefinition> {
    return request<FormDefinition>(
      `/forms/${encodeURIComponent(formId)}/versions/${version}/draft`,
      { method: 'PUT', body: JSON.stringify(bundle) },
    )
  },

  /** 自动选版本保存草稿（最新版是草稿则覆盖，否则开新版本） */
  saveDraftAuto(formId: string, bundle: FormBundle): Promise<FormDefinition> {
    return request<FormDefinition>(
      `/forms/${encodeURIComponent(formId)}/draft-auto`,
      { method: 'PUT', body: JSON.stringify(bundle) },
    )
  },

  /** 发布指定版本 */
  publish(formId: string, version: number): Promise<FormDefinition> {
    return request<FormDefinition>(
      `/forms/${encodeURIComponent(formId)}/versions/${version}/publish`,
      { method: 'POST' },
    )
  },

  /**
   * 保存并发布（"发布版本"按钮的完整动作）：
   *   自动选版本存草稿 → 发布该版本。
   */
  async saveAndPublish(
    formId: string,
    bundle: FormBundle,
  ): Promise<FormDefinition> {
    const draft = await this.saveDraftAuto(formId, bundle)
    return this.publish(formId, draft.version)
  },
}
