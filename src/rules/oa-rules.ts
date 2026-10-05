import type { Rule } from '../types'
import { bpmRules } from './bpm-rules'
import { permissionRules } from './permission-rules'
import { warningRules } from './warning-rules'

/**
 * OA Runtime 规则总表
 * 三个规则文件各自独立维护，这里只做组合；
 * 冲突优先级语义（priority）在各层内显式声明。
 */
export const oaRules: Rule[] = [
  ...warningRules, // priority 10
  ...permissionRules, // 15 / 30
  ...bpmRules, // 20
]
