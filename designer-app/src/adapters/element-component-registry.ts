import { componentMap } from '@runtime-core/renderer/component-map'
import { ElInput, ElInputNumber, MoneyField, SelectField } from './host-components'

/**
 * Element Component Registry（设计器侧组件接入）
 *
 * 把 Element Plus 登记到 Runtime Core 的 ComponentMap ——
 * 设计器 Canvas 与 RuntimePreview 都通过核心 buildRenderConfigs
 * 解析组件，保证"设计器看到什么，Runtime 就执行什么"。
 *
 * 不修改 src 核心文件：componentMap 本就是供宿主扩展的登记表。
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
