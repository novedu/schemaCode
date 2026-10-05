import type { ComponentTemplate } from '../model/designer-types'

/**
 * 组件库物料清单
 *
 * 物料名与 Runtime Core ComponentMap 的注册名一致 ——
 * 这保证从组件库点选的每一个组件，Runtime 都认识、可直接执行。
 * 新增物料：在此登记一条即可，设计器其他部分无需修改。
 */
export const componentTemplates: ComponentTemplate[] = [
  {
    component: 'TextInput',
    label: 'Input · 文本输入',
    defaultField: 'textField',
    defaultLabel: '文本',
    defaultProps: {},
    icon: 'EditPen',
  },
  {
    component: 'SelectInput',
    label: 'Select · 下拉选择',
    defaultField: 'selectField',
    defaultLabel: '选项',
    defaultProps: {},
    hasOptions: true,
    defaultOptions: [
      { label: '选项一', value: 'option1' },
      { label: '选项二', value: 'option2' },
    ],
    icon: 'ArrowDown',
  },
  {
    component: 'NumberInput',
    label: 'NumberInput · 数字输入',
    defaultField: 'numberField',
    defaultLabel: '数字',
    defaultProps: {},
    icon: 'Histogram',
  },
  {
    component: 'MoneyInput',
    label: 'MoneyInput · 金额输入',
    defaultField: 'amount',
    defaultLabel: '金额',
    defaultProps: { precision: 2, currency: 'CNY' },
    icon: 'Money',
  },
]

export function findTemplate(component: string): ComponentTemplate | undefined {
  return componentTemplates.find((t) => t.component === component)
}
