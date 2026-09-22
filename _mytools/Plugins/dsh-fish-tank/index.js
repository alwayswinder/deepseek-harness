/**
 * DSH fish tank — host half (plain ESM, no build step).
 *
 * Registers one same-origin route on the shared web server that serves the
 * packaged aquarium concept image (`bg.jpg` beside this file), so the browser
 * half can draw the pixel seabed without bundling a 500 KB asset into its
 * client bundle. The webServer service is injected optionally: a profile
 * without it still loads the plugin, and the browser half falls back to a
 * procedurally drawn gradient seabed when the route is absent.
 *
 * The image bytes are read once on first request and cached in memory; the
 * route unregisters together with the webServer fiber.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const name = 'fish-tank'

/** The same-origin route the browser half fetches its background from. */
export const ROUTE_PATH = '/api/fish-tank/background'

/** The packaged concept image (a JPEG; the browser half expects `image/jpeg`). */
const IMAGE_FILE = fileURLToPath(new URL('./bg.jpg', import.meta.url))

/**
 * Read and cache the image bytes; `null` after a failed read, so a broken
 * installation answers 404 once and the client keeps its gradient fallback.
 * @returns the image bytes, or null when the file is unreadable.
 */
function loadBytes() {
  let bytes = null
  let tried = false
  return () => {
    if (tried) return bytes
    tried = true
    try {
      bytes = readFileSync(IMAGE_FILE)
    } catch (error) {
      console.warn(`fish-tank: background image unreadable at ${IMAGE_FILE}:`, error)
    }
    return bytes
  }
}

/**
 * Register the background route when the webServer service is present.
 * @param ctx - Cordis context of this plugin fiber.
 */
export function apply(ctx) {
  const bytes = loadBytes()
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: (_req, res) => {
        const body = bytes()
        if (body === null) {
          res.writeHead(404)
          res.end()
          return
        }
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(body.length),
          // The image changes only when the plugin is updated; one hour of
          // freshness keeps a restart-after-edit from serving a stale body.
          'Cache-Control': 'public, max-age=3600',
        })
        res.end(body)
      },
    }), 'fish-tank: background image route')
  })
}
