import type { LayoutNode, LayoutFieldNode, Schema } from '@runtime-core/types'
import { defaultFieldState } from '@runtime-core/engine/field-state'
import type { CanvasNode, ContainerNode, FieldNode, GridNode, ColumnNode } from '../model/designer-types'

type FieldType = Schema['fields'][number]['type']

/**
 * Schema Builder（设计时 → Runtime 翻译器）
 *
 * 唯一职责：把设计器的节点树翻译成 Runtime Core 的 Schema。
 *
 *   - fields：完整扁平字段清单（深度优先顺序）——状态推理链路只消费它；
 *   - layout：可选布局树（Container/Grid 分组结构）——纯展示信息，
 *     供宿主渲染层分组呈现；无容器/栅格时不输出，保持 JSON 干净。
 */

/** 组件名 → 核心字段类型（FieldSchema.type） */
const COMPONENT_TYPE: Record<string, FieldType> = {
  TextInput: 'text',
  NumberInput: 'number',
  MoneyInput: 'number',
  SelectInput: 'select',
}

export function buildSchema(nodes: CanvasNode[]): Schema {
  const fields: Schema['fields'] = []
  const layout = toLayout(nodes, fields)

  return {
    fields,
    ...(layout.some((node) => node.kind === 'container' || node.kind === 'grid') ? { layout } : {}),
  }
}

/** 递归翻译：字段写入 fields（深度优先），同时产出 layout 节点 */
function toLayout(nodes: CanvasNode[], fields: Schema['fields']): LayoutNode[] {
  return nodes.map((node) => {
    if (node.kind === 'field') {
      fields.push(buildFieldSchema(node))
      return { kind: 'field' as const, field: node.field }
    }
    if (node.kind === 'grid') {
      return {
        kind: 'grid' as const,
        label: node.label,
        columns: node.columns.map((col) => ({
          children: toLayout(col.children, fields) as LayoutFieldNode[],
        })),
      }
    }
    return {
      kind: 'container' as const,
      label: node.label,
      children: toLayout(node.children, fields),
    }
  })
}

function buildFieldSchema(node: FieldNode): Schema['fields'][number] {
  const fieldSchema: Schema['fields'][number] = {
    name: node.field,
    label: node.label,
    type: COMPONENT_TYPE[node.component] ?? 'text',
    component: node.component,
    initialState: defaultFieldState({ required: node.required }),
  }
  if (Object.keys(node.props).length > 0) {
    fieldSchema.props = { ...node.props }
  }
  if (node.options?.length) {
    fieldSchema.options = node.options.map((o) => ({ ...o }))
  }
  return fieldSchema
}

/**
 * 反向解析：Runtime Schema → 设计器节点树。
 * 带 layout 的 Schema 按布局树恢复 Container/Grid 层级；
 * 旧扁平 Schema 按字段顺序平铺（完全兼容）。
 */
export function schemaToNodes(
  schema: Schema,
  createId: () => string = () => `node_import_${Math.random().toString(36).slice(2, 8)}`,
): CanvasNode[] {
  if (schema.layout?.length) {
    return fromLayout(schema.layout, fieldsByName(schema), createId)
  }
  return schema.fields.map((field) => fieldNodeFromSchema(field, createId()))
}

function fieldsByName(schema: Schema): Map<string, Schema['fields'][number]> {
  return new Map(schema.fields.map((field) => [field.name, field]))
}

function fromLayout(
  layout: LayoutNode[],
  byName: Map<string, Schema['fields'][number]>,
  createId: () => string,
): CanvasNode[] {
  const nodes: CanvasNode[] = []

  for (const node of layout) {
    if (node.kind === 'container') {
      nodes.push({
        id: createId(),
        kind: 'container',
        label: node.label,
        children: fromLayout(node.children, byName, createId),
      })
      continue
    }

    if (node.kind === 'grid') {
      const grid: GridNode = {
        id: createId(),
        kind: 'grid',
        label: node.label,
        columns: node.columns.map((col) => ({
          id: createId(),
          kind: 'column',
          children: col.children
            .map((f) => {
              const field = byName.get(f.field)
              return field ? fieldNodeFromSchema(field, createId()) : null
            })
            .filter((n): n is FieldNode => n !== null),
        })),
      }
      nodes.push(grid)
      continue
    }

    const field = byName.get(node.field)
    if (field) nodes.push(fieldNodeFromSchema(field, createId()))
  }

  return nodes
}

function fieldNodeFromSchema(
  field: Schema['fields'][number],
  id: string,
): FieldNode {
  const component = field.component ?? inferComponent(field.type)
  return {
    id,
    kind: 'field',
    field: field.name,
    label: field.label,
    component,
    props: { ...(field.props ?? {}) },
    options: field.options?.map((o) => ({ ...o })),
    required: field.initialState?.required ?? false,
  }
}

function inferComponent(type: FieldType): string {
  const reverse: Record<string, string> = {
    text: 'TextInput',
    number: 'NumberInput',
    money: 'MoneyInput',
    select: 'SelectInput',
  }
  return reverse[type] ?? 'TextInput'
}
