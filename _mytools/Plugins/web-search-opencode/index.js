/**
 * Web search through OpenCode's Anthropic-compatible gateway (`zen/go`).
 *
 * Registers the `opencode` search provider in `ctx.web`. Each search is one
 * Messages request carrying the native `web_search_20250305` server tool, so
 * OpenCode performs the retrieval and bills it; the DeepSeek official account
 * is not touched. The gateway requires an `x-opencode-session` header on every
 * request, which this provider supplies per search.
 *
 * @module @local/dsh-web-search-opencode
 */

import { randomUUID } from 'node:crypto'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-opencode'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Stable provider id this plugin registers; `web.searchProvider` selects it. */
export const PROVIDER_ID = 'opencode'

/** Attribution header sent on every request. */
const USER_AGENT = 'dsh-web-search-opencode/0.1.0'

/** Shipping defaults; every value is overridable from the `config` row. */
export const DEFAULTS = {
  baseURL: 'https://opencode.ai/zen/go/v1',
  model: 'deepseek-v4.1-flash',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
  apiVersion: '2023-06-01',
  maxTokens: 4096,
  maxUses: 5,
  sessionHeader: 'x-opencode-session',
  disableThinking: true,
}

/**
 * Resolve the config row into one immutable option set.
 * @param config - the plugin's `config` from cordis; every field optional.
 * @returns the values this provider serves every search with.
 */
export function resolveOptions(config = {}) {
  return {
    baseURL: stripTrailingSlash(config.baseURL ?? DEFAULTS.baseURL),
    model: config.model ?? DEFAULTS.model,
    apiKeyEnv: config.apiKeyEnv ?? DEFAULTS.apiKeyEnv,
    apiVersion: config.apiVersion ?? DEFAULTS.apiVersion,
    maxTokens: config.maxTokens ?? DEFAULTS.maxTokens,
    maxUses: config.maxUses ?? DEFAULTS.maxUses,
    sessionHeader: config.sessionHeader ?? DEFAULTS.sessionHeader,
    disableThinking: config.disableThinking ?? DEFAULTS.disableThinking,
  }
}

/** Drop trailing slashes so `/messages` is appended exactly once. */
function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/u, '')
}

/**
 * The OpenCode-backed search provider.
 *
 * Unlike the DeepSeek provider it never falls back to an account token: the
 * gateway is a separate paid route with its own credential, so a missing key is
 * reported instead of silently switching accounts.
 */
export class OpenCodeSearchProvider {
  /**
   * @param options - resolved options; `ctx` is only read for the credentials seam.
   * @param ctx - plugin context, used lazily so a credential change applies to the next search.
   */
  constructor(options, ctx) {
    this.id = PROVIDER_ID
    this.options = options
    this.ctx = ctx
  }

  /** Cheap local usability check: a parseable endpoint and some key reference. */
  available() {
    return URL.canParse(this.options.baseURL) && this.options.apiKeyEnv.length > 0
  }

  /**
   * Run one search through OpenCode's Messages API.
   * @param request - the query and optional result bound.
   * @param signal - caller cancellation.
   * @returns normalized sources; `truncated` stays false because the seam caps results.
   */
  async search(request, signal) {
    const options = this.options
    const endpoint = `${options.baseURL}/messages`
    const apiKey = await this.resolveKey(signal)
    if (apiKey === undefined) {
      throw new Error(
        `opencode search has no API key for "${options.apiKeyEnv}". Store it through the credentials service`
        + ' (the Models page writes OPENCODE_GO_API_KEY), export it in the launching environment,'
        + ' or set a literal "apiKey" in the web-search-opencode config.',
      )
    }

    const body = {
      model: options.model,
      max_tokens: options.maxTokens,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Perform a web search for the query: ${request.query}` }],
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: options.maxUses }],
      ...options.disableThinking ? { thinking: { type: 'disabled' } } : {},
    }

    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'x-api-key': apiKey,
          authorization: `Bearer ${apiKey}`,
          'anthropic-version': options.apiVersion,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': USER_AGENT,
          [options.sessionHeader]: randomUUID(),
        },
        body: JSON.stringify(body),
        ...signal === undefined ? {} : { signal },
      })
    } catch (error) {
      if (signal?.aborted === true) throw searchAborted(signal, error)
      throw new Error(`opencode search request failed at ${endpoint}: ${String(error)}`, { cause: error })
    }

    if (!response.ok) {
      let detail = ''
      try {
        const text = await response.text()
        detail = extractErrorDetail(text)
      } catch (error) {
        if (signal?.aborted === true) throw searchAborted(signal, error)
      }
      throw new Error(
        `opencode search API error (HTTP ${response.status})${detail.length > 0 ? `: ${detail}` : ''}`
        + `\n\nThe request used ${endpoint} with model ${options.model}.`
        + ' Configure web-search-opencode.baseURL / model / apiKeyEnv when they are not intended.',
      )
    }

    try {
      return mapResponse(await response.json())
    } catch (error) {
      if (signal?.aborted === true) throw searchAborted(signal, error)
      // A tool error is the gateway's own answer, not an unreadable body.
      if (error instanceof WebSearchToolError) throw error
      throw new Error(`opencode returned an unprocessable search response: ${String(error)}`, { cause: error })
    }
  }

  /**
   * Resolve the gateway key for this search without retaining it.
   * @param signal - caller cancellation.
   * @returns the key, or undefined when no store holds one.
   */
  async resolveKey(signal) {
    if (signal?.aborted === true) throw searchAborted(signal)
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const resolved = await credentials.resolve(this.options.apiKeyEnv)
      const value = resolved?.value
      if (typeof value === 'string' && value.length > 0) return value
    }
    const ambient = process.env[this.options.apiKeyEnv]
    return typeof ambient === 'string' && ambient.length > 0 ? ambient : undefined
  }
}

/**
 * A server-side `web_search` failure reported inside an otherwise successful
 * Messages response; carries the gateway's `error_code`.
 */
class WebSearchToolError extends Error {}

/**
 * Map an Anthropic Messages response to the seam's search result: walk
 * `web_search_tool_result` blocks, dedupe by URL, and join each result to the
 * excerpt carried by a text block's citation for the same URL.
 * @param payload - the parsed Messages response.
 * @returns normalized sources; `truncated` stays false.
 * @throws when a result block reports a tool error, carrying its `error_code`.
 */
export function mapResponse(payload) {
  const blocks = Array.isArray(payload?.content) ? payload.content : []
  const resultBlocks = blocks.filter((block) => block?.type === 'web_search_tool_result')
  if (resultBlocks.length === 0) {
    const text = blocks.filter((block) => block?.type === 'text').map((block) => block.text).join(' ').trim()
    throw new Error(
      'opencode returned no web_search_tool_result blocks; the request may not have triggered native web search'
      + (text.length > 0 ? ` (model said: ${text.slice(0, 200)})` : ''),
    )
  }

  const snippets = new Map()
  for (const block of blocks) {
    if (block?.type !== 'text') continue
    for (const cite of block.citations ?? []) {
      if (typeof cite?.url === 'string' && cite.url.length > 0
        && typeof cite.cited_text === 'string' && cite.cited_text.length > 0
        && !snippets.has(cite.url)) {
        snippets.set(cite.url, cite.cited_text)
      }
    }
  }

  const seen = new Set()
  const sources = []
  for (const block of resultBlocks) {
    // A failed server-tool call replaces the item list with a
    // `web_search_tool_result_error` object; iterating it would surface a bare
    // TypeError instead of the gateway's reason.
    const items = block.content ?? []
    if (!Array.isArray(items)) {
      const code = items?.error_code
      throw new WebSearchToolError(
        'opencode reported a web_search tool error'
        + (typeof code === 'string' && code.length > 0 ? `: ${code}` : ''),
      )
    }
    for (const item of items) {
      if (item?.type !== 'web_search_result' || typeof item.url !== 'string' || item.url.length === 0) continue
      if (seen.has(item.url)) continue
      seen.add(item.url)
      const snippet = snippets.get(item.url)
      sources.push({
        url: item.url,
        ...typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {},
        ...typeof snippet === 'string' && snippet.length > 0 ? { snippet } : {},
        ...typeof item.page_age === 'string' && item.page_age.length > 0 ? { publishedAt: item.page_age } : {},
      })
    }
  }
  return { sources, truncated: false }
}

/** Pull a human message out of an Anthropic-shaped error body, else the raw text. */
function extractErrorDetail(text) {
  try {
    const parsed = JSON.parse(text)
    const detail = parsed?.error?.message ?? parsed?.error ?? parsed?.message
    if (typeof detail === 'string' && detail.length > 0) return detail
  } catch {
    // A non-JSON body is normal for gateway failures; the status already tells the story.
  }
  return text.trim().slice(0, 300)
}

/** Build the seam's cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
  return new Error('opencode search aborted', { cause: signal?.aborted === true ? signal.reason : fallback })
}

/**
 * Register the provider with the web seam.
 * @param ctx - plugin context; `ctx.web` is supplied by the loader through `inject`.
 * @param config - the `web-search-opencode` row's config.
 */
export function apply(ctx, config = {}) {
  const options = resolveOptions(config)
  ctx.web.registerSearchProvider(new OpenCodeSearchProvider(options, ctx))
}
