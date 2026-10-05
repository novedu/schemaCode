import { defineComponent } from 'vue'

/**
 * Vue 组件定义（真实的 Vue 3 组件，可被 h() / createApp 使用）
 *
 * 教学重点在运行时装配链路，因此组件只保留最小契约：
 * 声明 name + props；在真实项目里这些就是一个个 .vue SFC。
 */

/** 文本输入（支持 textarea 模式） */
export const TextInput = defineComponent({
  name: 'TextInput',
  props: ['modelValue', 'type', 'rows', 'disabled', 'readonly', 'placeholder'],
})

/** 数字输入 */
export const NumberInput = defineComponent({
  name: 'NumberInput',
  props: ['modelValue', 'disabled', 'readonly', 'min', 'max'],
})

/** 金额输入：比 NumberInput 多精度与币种 */
export const MoneyInput = defineComponent({
  name: 'MoneyInput',
  props: ['modelValue', 'precision', 'currency', 'disabled', 'readonly'],
})

/** 下拉选择 */
export const SelectInput = defineComponent({
  name: 'SelectInput',
  props: ['modelValue', 'options', 'disabled', 'readonly'],
})
