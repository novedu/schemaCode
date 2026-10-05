import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { SubFormSchema, SubFormRow } from '../../src/types'
import {
  createRow,
  cloneRow,
  setRowValue,
  removeRow,
  computeRow,
  sumColumn,
  computeAggregates,
  extractComputedFields,
  type SubFormComputedField,
  type SubFormAggregate,
} from '../../src/subform/subform-core'

/* ── 夹具 ── */

function purchaseOrderSubForm(): SubFormSchema {
  return {
    name: 'items',
    label: '明细',
    columns: [
      { field: 'product', label: '商品', type: 'text' },
      { field: 'quantity', label: '数量', type: 'number' },
      { field: 'price', label: '单价', type: 'money' },
      { field: 'amount', label: '金额', type: 'money' },
    ],
    computedFields: [
      { targetField: 'amount', op: 'multiply', sourceFields: ['quantity', 'price'] },
    ],
    aggregates: [
      { targetField: 'totalAmount', sourceField: 'amount', op: 'sum' },
    ],
  }
}

function row(rowId: string, values: Record<string, unknown>): SubFormRow {
  return { rowId, values }
}

/* ── Test 1-3：Data Model ── */

describe('SubForm · Test 1-3 Data Model', () => {
  it('Test 1：创建 SubForm Row', () => {
    const r = createRow('row-1', purchaseOrderSubForm().columns)
    assert.equal(r.rowId, 'row-1')
    assert.equal(r.values.product, '')
    assert.equal(r.values.quantity, 0)
    assert.equal(r.values.price, 0)
    assert.equal(r.values.amount, 0)
  })

  it('Test 2：rowId 唯一且稳定', () => {
    const r1 = createRow('row-1', purchaseOrderSubForm().columns)
    const r2 = createRow('row-2', purchaseOrderSubForm().columns)
    const r3 = cloneRow(r1, 'row-3')

    assert.equal(r1.rowId, 'row-1')
    assert.equal(r2.rowId, 'row-2')
    assert.equal(r3.rowId, 'row-3')
    assert.notEqual(r1.rowId, r2.rowId)
    assert.notEqual(r1.rowId, r3.rowId)
  })

  it('Test 3：删除 Row 不影响其他 Row', () => {
    const rows = [
      row('row-1', { product: 'A', quantity: 2, price: 100 }),
      row('row-2', { product: 'B', quantity: 3, price: 200 }),
      row('row-3', { product: 'C', quantity: 1, price: 50 }),
    ]

    const next = removeRow(rows, 'row-1')

    assert.equal(next.length, 2)
    assert.equal(next[0].rowId, 'row-2')
    assert.equal(next[1].rowId, 'row-3')
    // 原数组未被修改
    assert.equal(rows.length, 3)
  })
})

/* ── Test 4-6：Runtime Row Operations ── */

describe('SubForm · Test 4-6 Runtime Row Operations', () => {
  it('Test 4：添加 Row', () => {
    const rows: SubFormRow[] = []
    const newRow = createRow('row-1', purchaseOrderSubForm().columns)
    const next = [...rows, newRow]

    assert.equal(next.length, 1)
    assert.equal(next[0].rowId, 'row-1')
  })

  it('Test 5：删除 Row', () => {
    const rows = [
      row('row-1', { product: 'A' }),
      row('row-2', { product: 'B' }),
    ]
    const next = removeRow(rows, 'row-1')

    assert.equal(next.length, 1)
    assert.equal(next[0].rowId, 'row-2')
  })

  it('Test 6：多 Row 独立', () => {
    const r1 = setRowValue(createRow('row-1', purchaseOrderSubForm().columns), 'quantity', 2)
    const r2 = setRowValue(createRow('row-2', purchaseOrderSubForm().columns), 'quantity', 3)

    assert.equal(r1.values.quantity, 2)
    assert.equal(r2.values.quantity, 3)
    assert.equal(r1.rowId, 'row-1')
    assert.equal(r2.rowId, 'row-2')
  })
})

/* ── Test 7-9：Row Dependency ── */

describe('SubForm · Test 7-9 Row Dependency', () => {
  it('Test 7：row-1 quantity/price → row-1 amount', () => {
    const r = setRowValue(
      setRowValue(createRow('row-1', purchaseOrderSubForm().columns), 'quantity', 2),
      'price',
      100,
    )
    const computed = computeRow(r, purchaseOrderSubForm().computedFields!)

    assert.equal(computed.values.amount, 200)
  })

  it('Test 8：row-2 quantity/price → row-2 amount', () => {
    const r = setRowValue(
      setRowValue(createRow('row-2', purchaseOrderSubForm().columns), 'quantity', 3),
      'price',
      200,
    )
    const computed = computeRow(r, purchaseOrderSubForm().computedFields!)

    assert.equal(computed.values.amount, 600)
  })

  it('Test 9：修改 row-1 不影响 row-2', () => {
    const r1 = setRowValue(
      setRowValue(createRow('row-1', purchaseOrderSubForm().columns), 'quantity', 2),
      'price',
      100,
    )
    const r2 = setRowValue(
      setRowValue(createRow('row-2', purchaseOrderSubForm().columns), 'quantity', 3),
      'price',
      200,
    )

    const c1 = computeRow(r1, purchaseOrderSubForm().computedFields!)
    const c2 = computeRow(r2, purchaseOrderSubForm().computedFields!)

    assert.equal(c1.values.amount, 200)
    assert.equal(c2.values.amount, 600)

    // 修改 row-1
    const updated1 = computeRow(
      setRowValue(r1, 'quantity', 5),
      purchaseOrderSubForm().computedFields!,
    )

    assert.equal(updated1.values.amount, 500)
    // row-2 未变
    assert.equal(c2.values.amount, 600)
  })
})

/* ── Test 10-12：Aggregation ── */

describe('SubForm · Test 10-12 Aggregation', () => {
  it('Test 10：SUM 200 + 600 = 800', () => {
    const rows = [
      row('row-1', { product: 'A', quantity: 2, price: 100, amount: 200 }),
      row('row-2', { product: 'B', quantity: 3, price: 200, amount: 600 }),
    ]

    const total = sumColumn(rows, 'amount')
    assert.equal(total, 800)
  })

  it('Test 11：删除 row-1 后 total = 600', () => {
    const rows = [
      row('row-1', { product: 'A', quantity: 2, price: 100, amount: 200 }),
      row('row-2', { product: 'B', quantity: 3, price: 200, amount: 600 }),
    ]
    const next = removeRow(rows, 'row-1')

    const total = sumColumn(next, 'amount')
    assert.equal(total, 600)
  })

  it('Test 12：修改 row-2 后 total 正确更新', () => {
    const rows = [
      row('row-1', { product: 'A', quantity: 2, price: 100, amount: 200 }),
      row('row-2', { product: 'B', quantity: 3, price: 200, amount: 600 }),
    ]

    const updated2 = computeRow(
      setRowValue(rows[1], 'quantity', 4),
      purchaseOrderSubForm().computedFields!,
    )
    const next = [rows[0], updated2]

    const total = sumColumn(next, 'amount')
    assert.equal(total, 200 + 800) // row-2: 4 * 200 = 800
  })
})

/* ── Test 13-14：Schema Serialization ── */

describe('SubForm · Test 13-14 Schema Serialization', () => {
  it('Test 13：SubForm Schema 可以序列化', () => {
    const subForm = purchaseOrderSubForm()
    const json = JSON.stringify(subForm)
    const restored = JSON.parse(json) as SubFormSchema

    assert.deepEqual(restored, subForm)
  })

  it('Test 14：Schema → Runtime 正确恢复', () => {
    const subForm = purchaseOrderSubForm()
    const computedDefs = extractComputedFields(subForm)

    assert.equal(computedDefs.length, 1)
    assert.equal(computedDefs[0].targetField, 'amount')
    assert.equal(computedDefs[0].op, 'multiply')
    assert.deepEqual(computedDefs[0].sourceFields, ['quantity', 'price'])
  })
})

/* ── Test 15：computeAggregates ── */

describe('SubForm · Test 15 computeAggregates', () => {
  it('SUM 聚合写入 formValues', () => {
    const rows = [
      row('row-1', { amount: 200 }),
      row('row-2', { amount: 600 }),
    ]

    const patch = computeAggregates(rows, [
      { targetField: 'totalAmount', sourceField: 'amount', op: 'sum' },
    ])

    assert.equal(patch.totalAmount, 800)
  })
})

/* ── Test 16-23：受限计算模型 ── */

describe('SubForm · Test 16-23 受限计算模型', () => {
  const cf = (op: 'multiply' | 'add' | 'subtract' | 'divide', fields: string[]): SubFormComputedField => ({
    targetField: 'result',
    op,
    sourceFields: fields,
  })

  it('Test 16：multiply 正常计算', () => {
    const r = row('r1', { a: 3, b: 4 })
    const result = computeRow(r, [cf('multiply', ['a', 'b'])])
    assert.equal(result.values.result, 12)
  })

  it('Test 17：add 正常计算', () => {
    const r = row('r1', { a: 3, b: 4 })
    const result = computeRow(r, [cf('add', ['a', 'b'])])
    assert.equal(result.values.result, 7)
  })

  it('Test 18：subtract 正常计算', () => {
    const r = row('r1', { a: 10, b: 4 })
    const result = computeRow(r, [cf('subtract', ['a', 'b'])])
    assert.equal(result.values.result, 6)
  })

  it('Test 19：divide 正常计算', () => {
    const r = row('r1', { a: 10, b: 4 })
    const result = computeRow(r, [cf('divide', ['a', 'b'])])
    assert.equal(result.values.result, 2.5)
  })

  it('Test 20：divide by zero 返回 0', () => {
    const r = row('r1', { a: 10, b: 0 })
    const result = computeRow(r, [cf('divide', ['a', 'b'])])
    assert.equal(result.values.result, 0)
    assert.ok(!Number.isNaN(result.values.result))
    assert.ok(Number.isFinite(result.values.result))
  })

  it('Test 21：非数字值不会产生 NaN', () => {
    const r = row('r1', { a: '', b: 100 })
    const result = computeRow(r, [cf('multiply', ['a', 'b'])])
    assert.equal(result.values.result, 0)
    assert.ok(!Number.isNaN(result.values.result))
  })

  it('Test 22：不会产生 Infinity', () => {
    const r = row('r1', { a: Infinity, b: 2 })
    const result = computeRow(r, [cf('multiply', ['a', 'b'])])
    assert.equal(result.values.result, 0)
    assert.ok(Number.isFinite(result.values.result))
  })

  it('Test 23：computeRow 不修改原 Row', () => {
    const r = row('r1', { a: 3, b: 4 })
    const result = computeRow(r, [cf('multiply', ['a', 'b'])])

    // 原对象未被修改
    assert.equal(r.values.result, undefined)
    // 返回新对象
    assert.equal(result.values.result, 12)
    assert.notEqual(r, result)
  })
})

/* ── Test 24-28：聚合边界 ── */

describe('SubForm · Test 24-28 聚合边界', () => {
  it('Test 24：空 rows SUM = 0', () => {
    const patch = computeAggregates([], [
      { targetField: 'total', sourceField: 'amount', op: 'sum' },
    ])
    assert.equal(patch.total, 0)
  })

  it('Test 25：非数字 amount 按 0 处理', () => {
    const rows = [
      row('r1', { amount: '' }),
      row('r2', { amount: 'not-a-number' }),
      row('r3', { amount: 100 }),
    ]
    const patch = computeAggregates(rows, [
      { targetField: 'total', sourceField: 'amount', op: 'sum' },
    ])
    assert.equal(patch.total, 100)
  })

  it('Test 26：computeAggregates 不修改原 rows', () => {
    const rows = [row('r1', { amount: 200 })]
    const originalLength = rows.length
    const originalAmount = rows[0].values.amount

    computeAggregates(rows, [
      { targetField: 'total', sourceField: 'amount', op: 'sum' },
    ])

    assert.equal(rows.length, originalLength)
    assert.equal(rows[0].values.amount, originalAmount)
  })

  it('Test 27：删除 Row 后重新 SUM', () => {
    const rows = [
      row('r1', { amount: 200 }),
      row('r2', { amount: 600 }),
    ]
    const next = removeRow(rows, 'r1')
    const patch = computeAggregates(next, [
      { targetField: 'total', sourceField: 'amount', op: 'sum' },
    ])
    assert.equal(patch.total, 600)
  })

  it('Test 28：Row isolation（修改 row-1 不影响 row-2）', () => {
    const r1 = row('row-1', { quantity: 2, price: 100 })
    const r2 = row('row-2', { quantity: 3, price: 200 })

    const cfList: SubFormComputedField[] = [
      { targetField: 'amount', op: 'multiply', sourceFields: ['quantity', 'price'] },
    ]

    const c1 = computeRow(r1, cfList)
    const c2 = computeRow(r2, cfList)

    assert.equal(c1.values.amount, 200)
    assert.equal(c2.values.amount, 600)

    // 修改 row-1
    const updated1 = computeRow(setRowValue(r1, 'quantity', 5), cfList)
    assert.equal(updated1.values.amount, 500)
    // row-2 未变
    assert.equal(c2.values.amount, 600)
  })
})
