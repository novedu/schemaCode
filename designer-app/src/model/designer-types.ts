/**
 * Designer 数据模型（设计时）
 *
 * 关键边界：设计器只维护"配置"，不含任何业务逻辑。
 * FieldNode 是设计画布上的节点；它最终被 schema-builder 翻译为
 * Runtime Core 的 FieldSchema，交给 Runtime 执行。
 */

/** 画布字段节点 */
export interface FieldNode {
  /** 节点实例 id（设计器内部标识，同名组件可拖多个） */
  id: string
  kind: 'field'
  /** 字段名（对应 FieldSchema.name / FormData 的键） */
  field: string
  /** 显示标签 */
  label: string
  /** 组件名（核心 ComponentMap 中的注册名） */
  component: string
  /** 组件静态属性（如 precision、currency） */
  props: Record<string, unknown>
  /** Select 类组件的选项 */
  options?: { label: string; value: string }[]
  /** 是否必填：builder 会写入核心 initialState */
  required: boolean
}

/**
 * 画布容器节点（布局分组）：父节点，children 只能包含字段、容器或栅格。
 * 纯布局信息——不携带字段元数据，不参与规则/权限计算；
 * 经 schema-builder 翻译为 Runtime Schema 的 layout 树。
 */
export interface ContainerNode {
  id: string
  kind: 'container'
  /** 分组标题（写入 layout container 的 label） */
  label: string
  children: CanvasNode[]
}

/** 画布栅格节点：父节点，children 固定为 ColumnNode（等宽 2 列 / 3 列）。 */
export interface GridNode {
  id: string
  kind: 'grid'
  /** 分组标题 */
  label: string
  /** 列槽位（创建时固定，数量 = 2 或 3） */
  columns: ColumnNode[]
}

/** 画布列节点：Grid 内部槽位，只能包含字段叶子。不可作为独立节点移动/删除。 */
export interface ColumnNode {
  id: string
  kind: 'column'
  children: FieldNode[]
}

/**
 * 画布节点：字段（叶子）、容器（父节点）或栅格（父节点）。
 * Field 永远是叶子，禁止 Field 嵌套任何节点。
 */
export type CanvasNode = FieldNode | ContainerNode | GridNode

/**
 * 设计器文档：画布根节点。
 * nodes 即根节点的 children（设计器文档本身也是 node：有 id、有 children）。
 */
export interface DesignerDocument {
  id: string
  /** 表单业务标识（FieldSchema 之外的文档元信息） */
  formId: string
  title: string
  nodes: CanvasNode[]
}

/** 组件库物料：点击后据此创建 FieldNode */
export interface ComponentTemplate {
  component: string
  /** 物料展示名 */
  label: string
  /** 新建节点的默认字段名 */
  defaultField: string
  defaultLabel: string
  defaultProps: Record<string, unknown>
  /** 是否携带选项（Select 类） */
  hasOptions?: boolean
  defaultOptions?: { label: string; value: string }[]
  icon: string
}
