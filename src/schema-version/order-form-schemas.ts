import type { Schema } from '../types'
import { defaultFieldState } from '../engine/field-state'

/**
 * 订单表单的两个历史版本（演示 Schema 演进）
 *
 * v1（2026-01）：报销/订单金额，普通数字输入
 * v2（2026-02）：金额升级为 money 类型（金额组件），并新增币种字段
 *
 * 注意：v2 的字段变化对 v1 历史数据"不可见" ——
 * 历史任务继续按 v1 渲染，页面上不会出现 currency。
 */

/** v1：只有 amount（number） */
export const orderFormV1: Schema = {
  fields: [
    {
      name: 'amount',
      label: '金额',
      type: 'number',
      component: 'NumberInput',
      initialState: defaultFieldState({ required: true }),
    },
  ],
}

/** v2：amount 升级为 money 组件，新增 currency 下拉 */
export const orderFormV2: Schema = {
  fields: [
    {
      name: 'amount',
      label: '金额',
      type: 'money',
      component: 'MoneyInput',
      props: { precision: 2, currency: 'CNY' },
      initialState: defaultFieldState({ required: true }),
    },
    {
      name: 'currency',
      label: '币种',
      type: 'select',
      component: 'SelectInput',
      options: [
        { label: '人民币', value: 'CNY' },
        { label: '美元', value: 'USD' },
      ],
      initialState: defaultFieldState({ required: true }),
    },
  ],
}
