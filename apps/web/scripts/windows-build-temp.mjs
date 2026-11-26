/** Keep esbuild's large transform requests in the checkout's Windows build scratch directory. */
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

if (process.platform === 'win32') {
  const temporaryDirectory = fileURLToPath(new URL('../../../.cache/tmp', import.meta.url))
  mkdirSync(temporaryDirectory, { recursive: true })
  process.env.TEMP = temporaryDirectory
  process.env.TMP = temporaryDirectory
}
