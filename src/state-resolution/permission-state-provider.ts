import type {
  FieldState,
  RuntimeContext,
  StatePatchMap,
} from '../types'

/**
 * Permission State Provider
 *
 * 设计原因：权限是安全边界，必须成为最高优先级来源 ——
 * 即使业务规则或流程节点声称"可编辑"，权限说不行就是不行。
 *
 * 输入只有 RuntimeContext（实例级权限 + 角色），
 * 不读 FormData、不依赖 RuleEngine。
 */
export function providePermissionState(context: RuntimeContext): StatePatchMap {
  const patches: StatePatchMap = {}

  /* 1. 实例级权限：只读实例 → 金额禁用（控件灰掉且不允许编辑） */
  if (context.permissions.editable === false) {
    patches.amount = merge(patches.amount, {
      editable: false,
      disabled: true,
    })
  }

  /* 2. 角色权限：先处理 employee（较宽松），再处理 manager（可覆盖） */
  if (context.user.roles.includes('employee')) {
    patches.approveComment = merge(patches.approveComment, {
      visible: false,
    })
  }

  if (context.user.roles.includes('manager')) {
    patches.approveComment = merge(patches.approveComment, {
      visible: true,
      required: true,
      editable: true,
    })
  }

  return patches
}

/** 来源内部补丁叠加：普通键后者覆盖，warnings 累积（本文件暂无 warnings） */
function merge(
  current: Partial<FieldState> | undefined,
  next: Partial<FieldState>,
): Partial<FieldState> {
  return { ...current, ...next }
}
