import { componentMap } from '@runtime-core/renderer/component-map'
import { ElInput, ElInputNumber, MoneyField, SelectField } from './host-components'

/**
 * Element Component Registry（组件库接入适配器）
 *
 * 把 Element Plus 宿主组件登记到 Runtime Core 的 ComponentMap。
 *
 * 这正是核心 ComponentMap 的设计承诺："替换组件库只改注册表，
 * Schema 与规则都不动"。本文件是【应用侧的装配动作】，
 * 不修改 src 下任何核心文件 —— componentMap 本就是供宿主扩展的登记表。
 *
 * 调用一次后，核心 Renderer（buildRenderConfigs / renderForm）
 * 产出的就是 Element Plus VNode。
 */
let registered = false

export function registerElementComponents(): void {
  if (registered) return

  componentMap.TextInput = { component: ElInput }
  componentMap.NumberInput = { component: ElInputNumber }
  componentMap.SelectInput = { component: SelectField }
  componentMap.MoneyInput = {
    component: MoneyField,
    defaultProps: { precision: 2, currency: 'CNY' },
  }

  registered = true
}
