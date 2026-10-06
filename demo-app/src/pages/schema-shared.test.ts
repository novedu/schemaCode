import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { formTitle, formatUpdatedAt, statusLabel } from './schema-shared'

describe('schema-shared · formTitle', () => {
  it('purchase-order 映射为采购申请', () => {
    assert.equal(formTitle('purchase-order'), '采购申请')
  })

  it('未知 formId 原样返回（不编造标题）', () => {
    assert.equal(formTitle('leave-request'), 'leave-request')
  })
})

describe('schema-shared · formatUpdatedAt', () => {
  it('ISO 时间格式化为本地 YYYY-MM-DD HH:mm（秒被截断）', () => {
    const iso = '2026-10-04T01:48:30.000Z'
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

    assert.equal(formatUpdatedAt(iso), expected)
    assert.equal(formatUpdatedAt(iso).includes('30'), false)
  })

  it('非法时间原样返回', () => {
    assert.equal(formatUpdatedAt('not-a-date'), 'not-a-date')
  })
})

describe('schema-shared · statusLabel', () => {
  it('published → 已发布；draft → 草稿', () => {
    assert.equal(statusLabel('published'), '已发布')
    assert.equal(statusLabel('draft'), '草稿')
  })
})
