import type { Schema } from './types'
import { defaultFieldState } from './engine/field-state'

/**
 * ① Schema
 * 声明式地描述表单：有哪些字段、什么类型、用什么组件、初始状态是什么。
 * 这里只写"是什么"，不写"什么时候变"（那是 Rule 的职责）。
 */
export const schema: Schema = {
  fields: [
    {
      name: 'customerType',
      label: '客户类型',
      type: 'select',
      component: 'SelectInput',
      options: [
        { label: '个人', value: 'person' },
        { label: '公司', value: 'company' },
      ],
      initialState: defaultFieldState({ required: true }),
    },
    {
      name: 'companyName',
      label: '公司名称',
      type: 'text',
      component: 'TextInput',
      initialState: defaultFieldState(),
    },
    {
      name: 'registeredCapital',
      label: '注册资本（万元）',
      type: 'number',
      component: 'MoneyInput',
      props: { precision: 2 },
      initialState: defaultFieldState(),
    },
    {
      name: 'amount',
      label: '报销金额',
      type: 'number',
      component: 'MoneyInput',
      props: { precision: 2, currency: 'CNY' },
      initialState: defaultFieldState({ required: true }),
    },
    {
      name: 'approveComment',
      label: '审批意见',
      type: 'text',
      component: 'TextInput',
      props: { type: 'textarea', rows: 3 },
      initialState: defaultFieldState({ visible: false }),
    },
    {
      // 派生标识：本身不采集数据，只受规则驱动显示
      name: 'vipTag',
      label: 'VIP 客户标识',
      type: 'text',
      component: 'TextInput',
      initialState: defaultFieldState({ visible: false, editable: false }),
    },
  ],
}
