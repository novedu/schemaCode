import type { FormService } from './form-service'
import type { ConfigStore } from './config-store'
import type { FormDefinition } from './types'
import { validateFormBundle, type ValidationResult } from '../src/validation'

/**
 * PublishService（发布服务）
 *
 * 唯一职责：draft → published 的状态跃迁。
 *
 *   1. 目标版本必须存在且为 draft，否则抛错；
 *   2. 发布前执行 Validation（Schema + Rule + Permission），error 阻断发布；
 *   3. 发布只翻转 status，配置内容（schema/rules/permissions）原样保留；
 *   4. 发布动作不 import、不调用任何 Runtime Core；
 *   5. 已发布版本无法再次 publish（draft 已不存在）——
 *      要改配置只能保存新版本，保证运行过的版本可追溯、可复现。
 *
 * Validation 失败时：
 *   - 抛出 PublishValidationError，携带 ValidationResult
 *   - draft 保留，published 不变
 */

/** 无法发布：目标版本不是草稿 */
export class PublishRequiresDraftError extends Error {
  constructor(formId: string, version: number) {
    super(`无法发布 ${formId}@v${version}：草稿不存在或该版本已发布`)
    this.name = 'PublishRequiresDraftError'
  }
}

/** 无法发布：校验失败 */
export class PublishValidationError extends Error {
  readonly validation: ValidationResult

  constructor(formId: string, version: number, validation: ValidationResult) {
    super(`无法发布 ${formId}@v${version}：配置校验失败`)
    this.name = 'PublishValidationError'
    this.validation = validation
  }
}

export class PublishService {
  constructor(
    private readonly forms: FormService,
    private readonly store: ConfigStore,
  ) {}

  publish(formId: string, version: number): FormDefinition {
    const draft = this.forms.getDraft(formId, version)
    if (!draft) throw new PublishRequiresDraftError(formId, version)

    // 发布前校验：error 阻断发布，warning 仅提示
    const validation = validateFormBundle(draft)
    if (!validation.valid) {
      throw new PublishValidationError(formId, version, validation)
    }

    // 同一 key 上 draft → published：ConfigStore 允许"覆盖草稿"，
    // 但此后该 key 即被锁定，任何 save 都会被拒绝。
    return this.store.save({ ...draft, status: 'published' })
  }
}
