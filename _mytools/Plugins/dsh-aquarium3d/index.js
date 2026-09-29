/**
 * DSH 3D aquarium — host half (plain ESM, no build step).
 *
 * Registers one same-origin prefix route on the shared web server that serves
 * this plugin's own directory as a static tree. The browser half fetches the
 * three.js runtime (`vendor/three.module.js`, MIT) and the scene modules under
 * `src/` from there, so neither enters the client bundle and an edited scene
 * module reaches the browser on the next page load instead of the next build.
 *
 * Only whitelisted file extensions are answered, and a resolved path must stay
 * inside this directory, so the route cannot read the rest of the disk.
 *
 * The webServer service is injected optionally: a profile without it still
 * loads the plugin, and the browser half then reports that the scene failed to
 * load instead of mounting a canvas.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'aquarium3d'

/** The same-origin prefix every runtime file of this plugin is served under. */
export const ROUTE_PREFIX = '/api/aquarium3d'

/** Absolute path of the directory this module lives in, with a trailing separator. */
const ROOT = fileURLToPath(new URL('.', import.meta.url))

/** Extensions the route answers, mapped to the content type sent with them. */
const CONTENT_TYPES = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.glb', 'model/gltf-binary'],
  ['.bin', 'application/octet-stream'],
])

/**
 * Map a request path to a file inside this directory.
 * @param pathname - the decoded request pathname.
 * @returns the absolute file path, or null when the path escapes the directory or names no whitelisted file.
 */
function resolveRequestedFile(pathname) {
  if (!pathname.startsWith(ROUTE_PREFIX)) return null
  let rest
  try {
    rest = decodeURIComponent(pathname.slice(ROUTE_PREFIX.length))
  } catch {
    // A malformed percent-escape is a client error, not a path to guess at.
    return null
  }
  if (rest.includes('\0')) return null
  const resolved = normalize(join(ROOT, rest))
  if (!resolved.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return null
  if (!CONTENT_TYPES.has(extname(resolved).toLowerCase())) return null
  return resolved
}

/**
 * Answer one runtime-file request.
 * @param req - the incoming HTTP request.
 * @param res - the response owning the reply.
 */
async function serveRuntimeFile(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }
  const pathname = new URL(String(req.url), 'http://localhost').pathname
  const file = resolveRequestedFile(pathname)
  if (file === null) {
    res.writeHead(404)
    res.end()
    return
  }
  let size
  try {
    const stats = await stat(file)
    if (!stats.isFile()) throw new Error('not a file')
    size = stats.size
  } catch {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES.get(extname(file).toLowerCase()),
    'Content-Length': String(size),
    // Scene modules and the vendored runtime are edited in place while this
    // plugin is under development, so no client may reuse a previous body.
    'Cache-Control': 'no-store',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => { res.destroy() })
  stream.pipe(res)
}

/**
 * Register the runtime-file route when the webServer service is present.
 * @param ctx - Cordis context of this plugin fiber.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: serveRuntimeFile,
    }), `aquarium3d: GET ${ROUTE_PREFIX}/<file>`)
  })
}
