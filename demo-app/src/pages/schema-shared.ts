import type { DefinitionStatus } from '../../../config-server/types'

/**
 * Schema 管理三个页面共用的展示工具：
 *
 *   /schema                              表单列表
 *   /schema/:formId                      表单详情 + 版本列表
 *   /schema/:formId/versions/:version    版本详情 + Runtime Preview
 *
 * 全部为纯函数、不依赖 Vue，便于 node:test 直接覆盖。
 */

/** formId → 中文表单名（仅 Demo 展示映射，不进入 Gateway 契约） */
const FORM_TITLES: Record<string, string> = {
  'purchase-order': '采购申请',
}

export function formTitle(formId: string): string {
  return FORM_TITLES[formId] ?? formId
}

/** ISO-8601 → 本地时区 'YYYY-MM-DD HH:mm'；非法值原样返回 */
export function formatUpdatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function statusLabel(status: DefinitionStatus): string {
  return status === 'published' ? '已发布' : '草稿'
}
