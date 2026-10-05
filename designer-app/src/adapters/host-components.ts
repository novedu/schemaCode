import { defineComponent, h, type PropType } from 'vue'
import { ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'

/**
 * Host Components（设计器宿主组件适配）
 *
 * 与 demo-app 同构：设计器与消费端各自是独立应用，宿主适配各自维护，
 * 互不依赖。把 Element Plus 包装成核心 Schema 约定的形态：
 * modelValue / update:modelValue + options[{label,value}]。
 */

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
 * 金额字段：可编辑 → ElInputNumber（precision 生效）；
 * readonly → 只读文本（ElInputNumber 不支持 readonly）。
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
