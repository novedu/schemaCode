import { SchemaRegistry } from '@runtime-core/schema-version/schema-registry'
import { SchemaVersionResolver } from '@runtime-core/schema-version/schema-version-resolver'
import { orderFormV1, orderFormV2 } from '@runtime-core/schema-version/order-form-schemas'

/**
 * 版本注册中心装配（应用侧）
 *
 * v1/v2 来自 Runtime Core，注册与解析全部调用核心 API：
 *   - 历史任务：版本严格冻结；
 *   - 新建任务：解析为 latest。
 */
export const FORM_ID = 'orderForm'

export function createVersionServices(): {
  registry: SchemaRegistry
  resolver: SchemaVersionResolver
} {
  const registry = new SchemaRegistry()
  registry.register(FORM_ID, 'v1', orderFormV1)
  registry.register(FORM_ID, 'v2', orderFormV2)

  return { registry, resolver: new SchemaVersionResolver(registry) }
}
