import type { FieldSchema, FieldShapeNode, Schema } from '../types'

/**
 * Schema Introspection（Schema 内省）
 *
 * Migration 校验需要频繁回答：
 *   - 源字段 "amount" 是否存在？什么类型/精度？
 *   - 目标路径 "amount.value" 落在哪？叶子类型是什么？
 *   - 目标 Schema 一共有哪些需要赋值的叶子？
 *
 * 这些查询规则只有一份，供五个 Validator 复用，
 * 避免每个 Validator 各自解析路径导致语义分叉。
 */

/** 源字段视图：扁平字段 + 解析出的精度 */
export interface SourceFieldView {
  field: FieldSchema
  type: string
  /** props.precision（源端精度） */
  precision?: number
}

/** 目标叶子视图：路径可能是 "currency" 或 "amount.value" */
export interface TargetLeafView {
  /** 完整路径 */
  path: string
  type: string
  required: boolean
  precision?: number
  /** 所属顶层字段 */
  owner: FieldSchema
  /** 嵌套叶子节点；扁平字段时为 undefined */
  shapeNode?: FieldShapeNode
}

export function getSourceField(schema: Schema, name: string): SourceFieldView | null {
  const field = schema.fields.find((f) => f.name === name)
  if (!field) return null

  return {
    field,
    type: field.type,
    precision: readPrecision(field.props),
  }
}

/**
 * 解析目标路径：
 *   扁平字段 "currency" → 字段本身；
 *   嵌套路径 "amount.value" → 顶层字段 amount 的 shape.value。
 * 路径不存在返回 null。
 */
export function resolveTargetPath(schema: Schema, path: string): TargetLeafView | null {
  const [head, ...rest] = path.split('.')
  const owner = schema.fields.find((f) => f.name === head)
  if (!owner) return null

  // 扁平字段
  if (rest.length === 0) {
    return {
      path,
      type: owner.type,
      required: owner.initialState.required,
      precision: readPrecision(owner.props),
      owner,
    }
  }

  // 嵌套：当前只支持一级（field.leaf），多级对象留待后续扩展
  if (rest.length !== 1 || !owner.shape) return null
  const node = owner.shape[rest[0]]
  if (!node) return null

  return {
    path,
    type: node.type,
    required: node.required ?? false,
    precision: node.precision ?? readPrecision(owner.props),
    owner,
    shapeNode: node,
  }
}

/**
 * 枚举目标 Schema 的全部叶子：
 *   普通字段 → 一条（字段名）；
 *   object 字段 → 每个 shape 键一条（field.leaf）。
 */
export function enumerateTargetLeaves(schema: Schema): TargetLeafView[] {
  const leaves: TargetLeafView[] = []

  for (const field of schema.fields) {
    if (field.type === 'object' && field.shape) {
      for (const [leafName, node] of Object.entries(field.shape)) {
        leaves.push({
          path: `${field.name}.${leafName}`,
          type: node.type,
          required: node.required ?? false,
          precision: node.precision ?? readPrecision(field.props),
          owner: field,
          shapeNode: node,
        })
      }
    } else {
      leaves.push({
        path: field.name,
        type: field.type,
        required: field.initialState.required,
        precision: readPrecision(field.props),
        owner: field,
      })
    }
  }

  return leaves
}

/** 顶层目标字段名列表（Permission Validator 判断"新增字段"用） */
export function getTargetFieldNames(schema: Schema): string[] {
  return schema.fields.map((f) => f.name)
}

function readPrecision(props: Record<string, unknown> | undefined): number | undefined {
  if (!props) return undefined
  const precision = props.precision
  return typeof precision === 'number' ? precision : undefined
}
