import type { OperatorName } from '../types'

/**
 * 第 1 层：Operator（操作符）
 *
 * 每个操作符只做一件事：拿到"实际值"和"期望值"，返回一个布尔结论。
 * 它不知道字段叫什么、不知道 FormData、更不知道 and/or —— 一个纯谓词。
 * 这保证了操作符可以被任意条件复用、单独测试。
 */
export type OperatorFn = (actual: unknown, expected?: unknown) => boolean

/** 操作符注册表：名字 → 实现。新增操作符只需在此登记 */
export const operators: Record<OperatorName, OperatorFn> = {
  /** 相等（严格相等） */
  equals: (actual, expected) => actual === expected,

  /** 大于（数值比较；字符串数字也会被 Number 归一化） */
  greaterThan: (actual, expected) => Number(actual) > Number(expected),

  /** 非空（null / undefined / '' 都视为空） */
  notEmpty: (actual) => actual !== undefined && actual !== null && actual !== '',
}

/** 按名字取操作符，未知名字直接报错（fail fast） */
export function getOperator(name: OperatorName): OperatorFn {
  const op = operators[name]
  if (!op) throw new Error(`未知操作符: ${name}`)
  return op
}
