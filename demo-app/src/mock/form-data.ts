import type { FormData } from '@runtime-core/types'

/** 初始采购申请数据（模拟已保存的草稿） */
export const initialPurchaseData: FormData = {
  customerType: 'company',
  companyName: '北京星河科技有限公司',
  registeredCapital: 0,
  amount: 6800,
  approveComment: '',
  applicant: '张三',
  currency: 'CNY',
}
