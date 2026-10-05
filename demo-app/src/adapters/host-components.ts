import { defineComponent, h, type PropType } from 'vue'
import { ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'

/**
 * Host Components（宿主组件适配）
 *
 * Runtime Core 的 ComponentMap 只认组件名，不挑组件实现。
 * 这里把 Element Plus 组件包装成核心 Schema 约定的形态：
 *   - 统一 v-model（modelValue / update:modelValue）；
 *   - options 约定为 [{label, value}]；
 *   - readonly 在数字组件上的差异由 MoneyField 消化。
 */

/** 下拉字段：ElSelect + ElOption，消费 Schema 的 options */
export const SelectField = defineComponent({
  name: 'SelectField',
  props: {
    modelValue: { type: [String, Number, Boolean] as PropType<string | number | boolean>, default: undefined },
    options: { type: Array as PropType<{ label: string; value: string }[]>, default: () => [] },
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        ElSelect,
        {
          modelValue: props.modelValue,
          disabled: props.disabled,
          placeholder: '请选择',
          style: { width: '100%' },
          'onUpdate:modelValue': (value: string | number | boolean) => emit('update:modelValue', value),
        },
        () => props.options.map((o) => h(ElOption, { key: o.value, label: o.label, value: o.value })),
      )
  },
})

/**
 * 金额字段：适配 Element Plus 与核心 readonly 语义的差异。
 *
 *   可编辑 → ElInputNumber（precision 生效）；
 *   只读   → ElInput 只读文本（ElInputNumber 不支持 readonly）。
 *
 * 这层差异属于"宿主环境适配"，不污染 Runtime Core 的 FieldState 语义。
 */
export const MoneyField = defineComponent({
  name: 'MoneyField',
  props: {
    modelValue: { type: Number, default: undefined },
    precision: { type: Number, default: 2 },
    currency: { type: String, default: 'CNY' },
    readonly: Boolean,
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => {
      if (props.readonly) {
        return h(ElInput, {
          modelValue: `${props.currency} ${Number(props.modelValue ?? 0).toFixed(props.precision)}`,
          readonly: true,
        })
      }

      return h(ElInputNumber, {
        modelValue: props.modelValue,
        precision: props.precision,
        disabled: props.disabled,
        min: 0,
        controlsPosition: 'right',
        style: { width: '100%' },
        'onUpdate:modelValue': (value: number | undefined) => emit('update:modelValue', value),
      })
    }
  },
})

export { ElInput, ElInputNumber }
