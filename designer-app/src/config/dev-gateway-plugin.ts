import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ConfigStore } from '../../../config-server/config-store'
import { FormService } from '../../../config-server/form-service'
import { PublishService, PublishValidationError } from '../../../config-server/publish-service'
import type { FormBundle } from '../../../config-server/types'

/**
 * Config Gateway Dev Plugin（开发态传输适配器）
 *
 * 为什么需要它：
 *   config-server 是纯 TypeScript 的内存模块；designer（5174）与
 *   demo（5173）是两个独立 Vite 进程。若浏览器直接 import 内存模块，
 *   每个标签页各有一份 Map，设计器发布的配置 Runtime 看不到。
 *
 * 本插件把 config-server 单例挂在**本 Vite 进程（5174）**上，
 * 以一小撮 REST 风格路由暴露：
 *
 *   GET  /__config/forms
 *   GET  /__config/forms/:formId/version-details
 *   GET  /__config/forms/:formId/versions
 *   PUT  /__config/forms/:formId/draft-auto
 *   PUT  /__config/forms/:formId/versions/:version/draft
 *   POST /__config/forms/:formId/versions/:version/publish
 *   GET  /__config/forms/:formId/published/latest
 *   GET  /__config/forms/:formId/versions/:version/published
 *
 * demo-app 经 Vite proxy 把 /__config 转发到 5174，两个应用于是
 * 共享同一份内存仓储。
 *
 * 边界说明：
 *   - 这里没有、也不允许出现业务逻辑：路由只做参数解析与序列化，
 *     全部语义都在 config-server（保存/发布）与 Runtime Core（执行）；
 *   - 它是开发态设施，不是新后端；未来替换真实配置中心时，
 *     删掉本插件、把浏览器 client 的 fetch 指向真实 API 即可。
 */

/** 模块级单例：Vite 配置热更新时也保持同一份仓储 */
let storeSingleton: ConfigStore | null = null

function getStore(): ConfigStore {
  if (!storeSingleton) storeSingleton = new ConfigStore()
  return storeSingleton
}

export function configGatewayPlugin(): Plugin {
  return {
    name: 'config-gateway-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (!req.url?.startsWith('/__config/')) {
            next()
            return
          }

          const url = new URL(req.url, 'http://config-gateway.local')
          const segments = url.pathname.split('/').filter(Boolean)
          // ['__config', 'forms', formId, ...rest]
          const formId = decodeURIComponent(segments[2] ?? '')
          const actionPath = segments.slice(3)

          const store = getStore()
          const forms = new FormService(store)
          const publish = new PublishService(forms, store)

          void route(req, res, {
            method: req.method ?? 'GET',
            segments,
            formId,
            actionPath,
            forms,
            publish,
          })
        },
      )
    },
  }
}

interface RouteDeps {
  method: string
  segments: string[]
  formId: string
  actionPath: string[]
  forms: FormService
  publish: PublishService
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RouteDeps,
): Promise<void> {
  const { method, segments, formId, actionPath, forms, publish } = deps

  try {
    /* GET /__config/forms */
    if (method === 'GET' && segments.length === 2 && segments[1] === 'forms') {
      sendJson(res, 200, forms.listFormIds())
      return
    }

    /* GET version-details */
    if (method === 'GET' && actionPath[0] === 'version-details' && actionPath.length === 1) {
      sendJson(res, 200, forms.listVersionDetails(formId))
      return
    }

    /* GET versions */
    if (method === 'GET' && actionPath[0] === 'versions' && actionPath.length === 1) {
      sendJson(res, 200, forms.listVersions(formId))
      return
    }

    /* PUT draft-auto */
    if (method === 'PUT' && actionPath[0] === 'draft-auto') {
      const bundle = (await readBody(req)) as FormBundle
      sendJson(res, 200, forms.saveDraftAuto(formId, bundle))
      return
    }

    if (actionPath[0] === 'versions') {
      const version = Number(actionPath[1])
      const leaf = actionPath[2]

      /* PUT versions/:v/draft */
      if (method === 'PUT' && leaf === 'draft') {
        const bundle = (await readBody(req)) as FormBundle
        sendJson(res, 200, forms.saveDraft(formId, version, bundle))
        return
      }

      /* POST versions/:v/publish */
      if (method === 'POST' && leaf === 'publish') {
        sendJson(res, 200, publish.publish(formId, version))
        return
      }

      /* GET versions/:v/published */
      if (method === 'GET' && leaf === 'published') {
        const def = forms.getPublished(formId, version)
        if (!def) {
          sendJson(res, 404, { error: 'DefinitionNotFoundError', message: `${formId}@v${version} 未发布` })
          return
        }
        sendJson(res, 200, def)
        return
      }
    }

    /* GET published/latest */
    if (method === 'GET' && actionPath[0] === 'published' && actionPath[1] === 'latest') {
      const def = forms.getLatestPublished(formId)
      if (!def) {
        sendJson(res, 404, { error: 'DefinitionNotFoundError', message: `${formId} 没有已发布版本` })
        return
      }
      sendJson(res, 200, def)
      return
    }

    sendJson(res, 404, { error: 'UnknownRoute', message: req.url })
  } catch (error) {
    // Validation 错误 → 409 + 结构化 issues
    if (error instanceof PublishValidationError) {
      sendJson(res, 409, {
        error: 'PublishValidationError',
        message: error.message,
        validation: error.validation,
      })
      return
    }

    // 服务层的领域错误 → 409（冲突/前置条件不满足）；其余 → 500
    const status = (error as Error).name.endsWith('Error') ? 409 : 500
    sendJson(res, status, {
      error: (error as Error).name,
      message: (error as Error).message,
    })
  }
}

/* ── 工具 ── */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}
