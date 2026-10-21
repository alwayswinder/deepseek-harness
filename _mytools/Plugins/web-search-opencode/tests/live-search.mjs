/**
 * Live check for the opencode search provider: one real search through the
 * OpenCode gateway, using this machine's OPENCODE_GO_API_KEY credential.
 *
 * Usage:
 *   node tests/live-search.mjs ["query"] [--model <id>] [--base-url <url>]
 *
 * Exits 1 when the provider throws or returns no sources, so `--model` doubles
 * as the check that a gateway model executes the native `web_search` tool.
 * Costs one gateway call (about ¥0.01 at the default model's tier).
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { OpenCodeSearchProvider, resolveOptions } from '../index.js'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  const value = argv[index + 1]
  argv.splice(index, 2)
  return value
}
const model = flag('--model')
const baseURL = flag('--base-url')
const query = argv[0] ?? 'DeepSeek API 价格'

/** Read one named ref value out of the harness credentials file. */
function credentialFromStore(name) {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  const file = join(home, '.credentials.yaml')
  try {
    const text = readFileSync(file, 'utf8')
    const match = text.match(new RegExp(`^\\s{2}${name}:\\s*['"]?([^'"\\s]+)['"]?\\s*$`, 'mu'))
    return match?.[1]
  } catch {
    return undefined
  }
}

const ctx = {
  get(service) {
    if (service !== 'credentials') return undefined
    return {
      async resolve(ref) {
        const value = credentialFromStore(ref) ?? process.env[ref]
        return value === undefined ? undefined : { value }
      },
    }
  },
}

const provider = new OpenCodeSearchProvider(resolveOptions({
  ...model === undefined ? {} : { model },
  ...baseURL === undefined ? {} : { baseURL },
}), ctx)
if (!provider.available()) {
  console.error('provider reports unavailable; check baseURL / apiKeyEnv')
  process.exit(1)
}

const started = Date.now()
try {
  const result = await provider.search({ query, maxResults: 10 }, AbortSignal.timeout(90_000))
  console.log(`model: ${provider.options.model}  baseURL: ${provider.options.baseURL}`)
  console.log(`query: ${query}`)
  console.log(`sources: ${result.sources.length}  (${Date.now() - started} ms)`)
  for (const source of result.sources.slice(0, 3)) {
    console.log(`- ${source.title ?? '(no title)'}  ${source.url}`)
  }
  process.exit(result.sources.length > 0 ? 0 : 1)
} catch (error) {
  console.error(`FAILED (${provider.options.model}): ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
