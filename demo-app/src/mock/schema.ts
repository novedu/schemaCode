import type { Rule, Schema } from '@runtime-core/types'
import { defaultFieldState } from '@runtime-core/engine/field-state'
import { rules as coreBusinessRules } from '@runtime-core/rules'
import { warningRules } from '@runtime-core/rules/warning-rules'

/**
 * 采购申请单 Schema（应用侧定义，结构仍是 Runtime Core 契约）
 *
 * 注意：这里不是"手写表单"——字段顺序、组件、必填、选项全部声明在 Schema，
 * RuntimeForm 只负责渲染 Schema；这里定义的是"表单是什么"。
 */
export const purchaseSchema: Schema = {
  fields: [
    {
      name: 'applicant',
      label: '申请人',
      type: 'text',
      component: 'TextInput',
      initialState: defaultFieldState({ required: true }),
    },
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
      name: 'amount',
      label: '报销金额',
      type: 'number',
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
        { label: '人民币 CNY', value: 'CNY' },
        { label: '美元 USD', value: 'USD' },
      ],
      initialState: defaultFieldState({ required: true }),
    },
  ],
}

/**
 * 驱动本表单的业务规则：直接复用 Runtime Core 的规则集
 * （客户类型联动 + 金额预警），demo-app 不重写任何规则。
 */
export const purchaseRules: Rule[] = [...coreBusinessRules, ...warningRules]
