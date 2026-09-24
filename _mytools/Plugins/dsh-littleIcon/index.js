/** Serve the whale-girl artwork to the same-origin browser client. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const name = 'little-icon'

/** Stable client asset names. Values retain the supplied artwork filenames. */
export const PET_ASSETS = Object.freeze({
  idle: '待机.png',
  bored: '无聊.png',
  sleeping: '打盹.png',
  happy: '开心.png',
  working: '干活中.png',
  peeking: '偷窥.png',
})

export const ROUTE_PREFIX = '/api/little-icon/'

function assetLoader(filename) {
  const path = fileURLToPath(new URL(`./IconImage/${filename}`, import.meta.url))
  let loaded = false
  let bytes = null
  return () => {
    if (loaded) return bytes
    loaded = true
    try {
      bytes = readFileSync(path)
    } catch (error) {
      console.warn(`little-icon: artwork unreadable at ${path}:`, error)
    }
    return bytes
  }
}

/**
 * Register one exact same-origin route per packaged image.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    for (const [state, filename] of Object.entries(PET_ASSETS)) {
      const load = assetLoader(filename)
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}${state}.png`,
        handler: (_request, response) => {
          const body = load()
          if (body === null) {
            response.writeHead(404)
            response.end()
            return
          }
          response.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': String(body.length),
            'Cache-Control': 'public, max-age=3600',
          })
          response.end(body)
        },
      }), `little-icon: ${state} artwork route`)
    }
  })
}
