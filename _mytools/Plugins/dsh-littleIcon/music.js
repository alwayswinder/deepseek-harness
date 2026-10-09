/**
 * DSH Little Icon — the music library (host half).
 *
 * The person's own list of Bilibili links is the only thing that travels between
 * machines: it lives in this plugin's config, which the settings card writes and
 * `_mytools/settings/sync-settings.mjs` carries into the repository as
 * `pet-settings.yml`. Everything derived from a link — the audio file and the
 * index that names it — stays on the machine that downloaded it, under the music
 * directory the settings name (or this machine's own harness home by default), so
 * a checkout never carries media.
 *
 * A machine that pulls the link list therefore starts with every entry missing,
 * and `sync()` is the one-click step that downloads them all: the pet's menu and
 * the settings card both reach it, and neither needs a page to be listening,
 * because downloading is this half's own work. What the pet plays is a local file
 * it already has; the page only ever reads the library and asks for work.
 *
 * The index is keyed by Bilibili id (a `BV`/`av` id, with `-pN` appended for a
 * multi-part video) rather than by link text, because one video has many link
 * spellings — a short `b23.tv` address, a full URL with query parameters, a bare
 * id — and they must resolve to the same entry. The link text is kept beside it,
 * so a link the parser cannot recognize on its own (a short address) still
 * matches the entry it was downloaded from.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Bilibili endpoints this half reads: video facts, then the playable streams. */
const VIEW_API = 'https://api.bilibili.com/x/web-interface/view'
const PLAYURL_API = 'https://api.bilibili.com/x/player/playurl'

/** Bilibili answers a bare fetch with the web page, not the API, so both are sent. */
const BILIBILI_HEADERS = Object.freeze({
  'User-Agent': 'Mozilla/5.0',
  Referer: 'https://www.bilibili.com',
})

/** Longest one download step may take before it is abandoned. */
export const MUSIC_TIMEOUT_MS = 120_000

/**
 * Audio stream ids to prefer, best first: 30280 is the ~192 kbps AAC stream, and
 * the two below it are the same codec at lower bitrates for videos that carry no
 * better one. The stream names the quality, so nothing is transcoded here.
 */
export const MUSIC_QUALITY_ORDER = Object.freeze([30280, 30232, 30216])

/** Audio extension every saved stream carries; Bilibili serves AAC in an MP4 box. */
export const MUSIC_AUDIO_EXTENSION = '.m4a'

/** Pause between two downloads of one sync, so a long list is not a burst. */
export const MUSIC_SYNC_GAP_MS = 400

/** Format version of the library index, bumped when its own layout changes. */
export const MUSIC_INDEX_VERSION = 1

/** Longest file name stem taken from a title, before the extension. */
const TITLE_MAX_CHARS = 80

/** Characters Windows refuses in a file name, plus the control range. */
const ILLEGAL_IN_FILENAME = /[\\/:*?"<>|\u0000-\u001f]/gu

const BV_PATTERN = /BV[0-9A-Za-z]{10}/u
const AV_PATTERN = /av(\d+)/iu
const PAGE_PATTERN = /[?&]p=(\d+)/u

/**
 * A Bilibili link or id as it identifies one playable item.
 * @param raw - the text a person pasted, or a resolved address.
 * @returns the id kind, the id itself, and the 1-based part of a multi-part video;
 *   undefined when the text names no video.
 */
export function parseBilibiliRef(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '') return undefined
  const page = Number.parseInt(PAGE_PATTERN.exec(text)?.[1] ?? '1', 10)
  const bv = BV_PATTERN.exec(text)
  if (bv !== null) return { kind: 'bvid', id: bv[0], page: Number.isSafeInteger(page) && page > 0 ? page : 1 }
  const av = AV_PATTERN.exec(text)
  if (av !== null) return { kind: 'aid', id: av[1], page: Number.isSafeInteger(page) && page > 0 ? page : 1 }
  return undefined
}

/**
 * The index key of one item: its id, and the part number when the link named one.
 * Two parts of the same video are two entries, because they are two audio streams
 * with their own titles.
 * @param ref - a parsed reference.
 * @returns the key.
 */
export function musicEntryId(ref) {
  return ref.page > 1 ? `${ref.id}-p${ref.page}` : ref.id
}

/**
 * A file name stem safe on Windows and still readable: the title without the
 * characters a file name cannot hold, capped, and never empty or dot-ended (which
 * Windows also refuses).
 * @param title - the video title.
 * @param fallback - name to use when nothing readable is left.
 * @returns the stem, without an extension.
 */
export function sanitizeFileStem(title, fallback = 'bilibili') {
  const cleaned = String(title ?? '').replace(ILLEGAL_IN_FILENAME, '_').replace(/\s+/gu, ' ').trim()
  const capped = cleaned.slice(0, TITLE_MAX_CHARS).replace(/[. ]+$/u, '')
  return capped === '' ? fallback : capped
}

/**
 * The directory audio files go to, as every half resolves it: a blank setting
 * means this machine's own harness home, `~` expands to the user directory, and a
 * relative path resolves there too rather than against the process's own cwd.
 * @param raw - the configured value.
 * @param dshHome - absolute harness home.
 * @returns absolute music directory.
 */
export function resolveMusicDir(raw, dshHome) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return join(dshHome, 'little-icon', 'music')
  if (value === '~') return join(homedir(), 'little-icon', 'music')
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return isAbsolute(value) ? value : resolve(dshHome, value)
}

/**
 * Whether a path is inside a directory tree, both being absolute and already
 * resolved. Used to refuse a music directory inside the checkout, where the files
 * would be committed; the comparison is case-insensitive because Windows is.
 * @param path - the candidate path.
 * @param root - the directory that must not contain it.
 * @returns the answer, false when either argument is empty.
 */
export function isInside(path, root) {
  if (typeof path !== 'string' || typeof root !== 'string' || path === '' || root === '') return false
  const left = resolve(path).toLowerCase()
  const right = resolve(root).toLowerCase().replace(/[\\/]+$/u, '')
  return left === right || left.startsWith(`${right}\\`) || left.startsWith(`${right}/`)
}

/**
 * The link list as the library works with it: trimmed, non-empty, and in the order
 * the settings hold.
 * @param rows - the configured `musicLinks` value.
 * @returns the usable links.
 */
export function resolveMusicLinks(rows) {
  const links = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const text = typeof row === 'string' ? row.trim() : ''
    if (text !== '') links.push(text)
  }
  return links
}

/**
 * Keep an MP4 payload starting at its first box. Bilibili sometimes serves the
 * stream with a leading box whose size field is zeroed, which the demuxer reads as
 * a truncated file; the audio itself starts at the `ftyp` box, so the payload is
 * cut back to that box — including its four-byte size, without which the file
 * would be malformed in a different way.
 * @param buffer - the response body.
 * @returns the payload to write.
 */
export function audioPayload(buffer) {
  if (buffer.length > 8 && buffer.toString('latin1', 4, 8) === 'ftyp') return buffer
  const at = buffer.indexOf('ftyp')
  return at >= 4 ? buffer.subarray(at - 4) : buffer
}

/**
 * One entry of the library index, as the settings card and the pet's menu read it.
 * @typedef {object} MusicEntry
 * @property {string} id - index key (`BV…` or `av…`, with `-pN` for a part).
 * @property {string} source - the link text this entry was downloaded from.
 * @property {string} url - canonical watch address of the video.
 * @property {string} title - video title.
 * @property {string} owner - uploader name.
 * @property {number} durationMs - video duration in milliseconds.
 * @property {string} file - file name inside the music directory.
 * @property {number} size - file size in bytes.
 * @property {string} addedAt - ISO timestamp of the download.
 */

/**
 * The library a machine holds: files in one directory, and an index naming them.
 *
 * Every method that touches the network reports instead of throwing, because the
 * host turns a failure into a line in the settings card rather than into a crash.
 */
export class MusicLibrary {
  /**
   * @param options - library location and collaborators.
   * @param options.dataDir - this machine's plugin data directory.
   * @param options.dir - absolute music directory.
   * @param options.logger - host logger; only `warn` is used.
   * @param options.fetchImpl - fetch implementation; the global one, resolved per
   *   request, unless a caller supplies its own.
   * @param options.onChange - called whenever the library or sync progress moved.
   */
  constructor({ dataDir, dir, logger, fetchImpl, onChange = () => {} }) {
    /** Absolute directory the audio files live in. */
    this.dir = dir
    /** Where the index is written; machine-local, like the files it names. */
    this.indexFile = join(dataDir, 'music-index.json')
    /** @type {Record<string, MusicEntry>} entries by id. */
    this.entries = {}
    this.logger = logger
    // Resolved at each request rather than captured here, so a replaced global fetch
    // — a test double, or a deployment that installs its own — is honoured by a
    // library that was already built.
    this.fetchImpl = fetchImpl ?? ((...args) => globalThis.fetch(...args))
    this.onChange = onChange
    /** Progress of the running sync, or of the last one that ran. */
    this.progress = { running: false, done: 0, total: 0, current: '', added: 0, failed: [] }
    /** File names a download in flight has claimed but not written yet. */
    this.reserved = new Set()
    /** The download chain: one at a time, in arrival order. */
    this.queue = Promise.resolve()
    this.indexStamp = -1
    this.load()
  }

  /**
   * Read the index from disk when it changed since the last look. The settings card
   * and the pet both ask repeatedly about a directory a download writes, so the
   * file's own modification time decides whether that read is needed.
   */
  load() {
    let stamp = -1
    try {
      stamp = statSync(this.indexFile).mtimeMs
    } catch {
      // No index yet: an empty library is the honest answer.
      this.entries = {}
      this.indexStamp = -1
      return
    }
    if (stamp === this.indexStamp) return
    this.indexStamp = stamp
    try {
      const parsed = JSON.parse(readFileSync(this.indexFile, 'utf8'))
      const rows = parsed?.version === MUSIC_INDEX_VERSION && parsed.entries !== null && typeof parsed.entries === 'object'
        ? parsed.entries
        : {}
      this.entries = rows
    } catch (error) {
      // A half-written or hand-edited index costs the library, not the host: the
      // files stay on disk and the next download re-records them.
      this.logger?.warn('little-icon music: could not read %s: %s', this.indexFile, String(error))
      this.entries = {}
    }
  }

  /** Write the index through a temporary neighbour, then tell the host it moved. */
  save() {
    const text = `${JSON.stringify({ version: MUSIC_INDEX_VERSION, entries: this.entries }, null, 2)}\n`
    const temporary = `${this.indexFile}.tmp`
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(temporary, text, 'utf8')
      renameSync(temporary, this.indexFile)
      this.indexStamp = statSync(this.indexFile).mtimeMs
    } catch (error) {
      rmSync(temporary, { force: true })
      this.logger?.warn('little-icon music: could not write %s: %s', this.indexFile, String(error))
    }
    this.onChange()
  }

  /**
   * Absolute path of an entry's audio file, or undefined when the entry is unknown
   * or its file is gone (a person cleaning the folder by hand).
   * @param id - index key.
   * @returns the path, or undefined.
   */
  filePath(id) {
    const entry = this.entries[id]
    if (entry === undefined) return undefined
    const path = join(this.dir, entry.file)
    return existsSync(path) ? path : undefined
  }

  /**
   * Every entry that is recorded but whose file is missing, so the menu and the
   * card can offer the download again.
   * @returns the ids.
   */
  missingFiles() {
    return Object.values(this.entries).filter(entry => !existsSync(join(this.dir, entry.file))).map(entry => entry.id)
  }

  /**
   * Whether a link is already downloaded, by whichever identity it carries: its own
   * parsed id, or the link text an entry was downloaded from (a short address).
   * @param link - the link text.
   * @returns the entry, or undefined.
   */
  entryForLink(link) {
    const ref = parseBilibiliRef(link)
    if (ref !== undefined) {
      const entry = this.entries[musicEntryId(ref)]
      if (entry !== undefined) return entry
    }
    return Object.values(this.entries).find(entry => entry.source === link)
  }

  /**
   * Download one link's audio into the music directory and record it.
   *
   * Refused while a fill-in runs: that one is downloading the same list, and two
   * downloads naming their file at the same time would pick the same name from
   * `uniqueFileName`, which only sees files that are already on disk. The settings
   * card says so instead of starting work that would overwrite a file.
   * @param raw - link text, or a bare `BV`/`av` id.
   * @returns `{ ok: true, id, title, size }`, `{ ok: true, duplicate: true, … }`, or
   *   `{ ok: false, reason, message? }` where reason is one the card localizes:
   *   `empty`, `running`, `unrecognized`, `video`, `audio`, `no-audio`, `network`,
   *   `write`.
   */
  async download(raw) {
    if (this.progress.running) return { ok: false, reason: 'running' }
    // One at a time, and this one waits for whatever is in front of it: two requests
    // for the same video would both fetch it, and the second would record its own
    // entry over the first, leaving the first file unclaimed. Waiting is what turns
    // the second into the duplicate answer it should have been all along.
    const previous = this.queue
    const run = (async () => {
      await previous
      return await this.downloadNow(raw)
    })()
    this.queue = run.then(() => undefined, () => undefined)
    return await run
  }

  /**
   * The download itself, without the fill-in guard, for callers that own the
   * library while they run — the fill-in does.
   * @param raw - link text, or a bare `BV`/`av` id.
   * @returns the same answers {@link MusicLibrary#download} gives.
   */
  async downloadNow(raw) {
    const link = typeof raw === 'string' ? raw.trim() : ''
    if (link === '') return { ok: false, reason: 'empty' }
    let ref = parseBilibiliRef(link)
    if (ref === undefined) {
      const resolved = await this.followLink(link)
      if (!resolved.ok) return resolved
      ref = resolved.ref
    }
    const id = musicEntryId(ref)
    const known = this.entries[id]
    if (known !== undefined && existsSync(join(this.dir, known.file))) {
      return { ok: true, duplicate: true, id, title: known.title, size: known.size }
    }
    const info = await this.videoInfo(ref)
    if (!info.ok) return info
    const stream = await this.audioStream(ref, info.cid)
    if (!stream.ok) return stream
    let body
    try {
      const response = await this.fetchImpl(stream.url, { headers: BILIBILI_HEADERS, signal: AbortSignal.timeout(MUSIC_TIMEOUT_MS) })
      if (!response.ok) return { ok: false, reason: 'network', message: `HTTP ${response.status}` }
      body = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      return { ok: false, reason: 'network', message: String(error?.message ?? error) }
    }
    const data = audioPayload(body)
    const file = this.uniqueFileName(sanitizeFileStem(info.title, id))
    // Named and written with no await between them: two downloads that got this far
    // cannot both name the same file, because the first reserves it here.
    this.reserved.add(file)
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(join(this.dir, file), data)
    } catch (error) {
      return { ok: false, reason: 'write', message: String(error?.message ?? error) }
    } finally {
      this.reserved.delete(file)
    }
    /** @type {MusicEntry} */
    const entry = {
      id,
      source: link,
      url: info.url,
      title: info.title,
      owner: info.owner,
      durationMs: info.durationMs,
      file,
      size: data.length,
      addedAt: new Date().toISOString(),
    }
    this.entries[id] = entry
    this.save()
    return { ok: true, id, title: info.title, size: data.length }
  }

  /**
   * Download every link that has no file yet, one at a time. A second call while
   * one runs is refused rather than queued: the settings card and the pet's menu
   * are two ways to ask for the same work.
   * @param links - the link list, in the order to download.
   * @returns the finished progress record, or why nothing started.
   */
  async sync(links) {
    if (this.progress.running) return { ok: false, reason: 'running' }
    // Claimed before waiting for the queue, so a single download arriving now is
    // refused rather than waiting behind a fill-in that may take minutes.
    this.progress = { running: true, done: 0, total: 0, current: '', added: 0, failed: [] }
    this.onChange()
    const previous = this.queue
    const run = (async () => {
      await previous
      return await this.syncNow(links)
    })()
    this.queue = run.then(() => undefined, () => undefined)
    return await run
  }

  /**
   * The fill-in itself, for the caller that has already claimed the library.
   * @param links - the link list, in the order to download.
   * @returns the finished progress record.
   */
  async syncNow(links) {
    const pending = links.filter((link) => {
      const entry = this.entryForLink(link)
      return entry === undefined || !existsSync(join(this.dir, entry.file))
    })
    this.progress = { running: true, done: 0, total: pending.length, current: '', added: 0, failed: [] }
    this.onChange()
    for (const link of pending) {
      this.progress.current = link
      this.onChange()
      const result = await this.downloadNow(link)
      if (result.ok) {
        if (result.duplicate !== true) this.progress.added += 1
      } else {
        this.progress.failed.push({ link, reason: result.reason, message: result.message ?? '' })
      }
      this.progress.done += 1
      this.onChange()
      if (this.progress.done < this.progress.total) await new Promise(done => setTimeout(done, MUSIC_SYNC_GAP_MS))
    }
    this.progress = { ...this.progress, running: false, current: '' }
    this.onChange()
    return { ok: true, ...this.progress }
  }

  /**
   * Forget one entry and delete the file it names. A file the pet is playing is
   * held open by Windows, so a refusal is reported rather than forced: the entry
   * stays, and the person switches song and removes it again.
   * @param id - index key.
   * @returns `{ ok: true }`, or `{ ok: false, reason: 'unknown' | 'busy' , message? }`.
   */
  remove(id) {
    const entry = this.entries[id]
    if (entry === undefined) return { ok: false, reason: 'unknown' }
    const path = join(this.dir, entry.file)
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch (error) {
        return { ok: false, reason: 'busy', message: String(error?.message ?? error) }
      }
    }
    delete this.entries[id]
    this.save()
    return { ok: true }
  }

  /**
   * A file name no entry uses yet, `_2`, `_3` and so on for a title that is already
   * there — two videos may carry the same title, and neither may overwrite the
   * other's audio.
   * @param stem - the sanitized title.
   * @returns the file name.
   */
  uniqueFileName(stem) {
    let file = `${stem}${MUSIC_AUDIO_EXTENSION}`
    let count = 2
    while (existsSync(join(this.dir, file)) || this.reserved.has(file)) {
      file = `${stem}_${count}${MUSIC_AUDIO_EXTENSION}`
      count += 1
    }
    return file
  }

  /**
   * Turn a short `b23.tv` address (or any address that redirects) into a video
   * reference by following it to the watch page.
   * @param link - the address as typed.
   * @returns `{ ok: true, ref }`, or an `unrecognized`/`network` failure.
   */
  async followLink(link) {
    let address
    try {
      address = new URL(/^[a-z][a-z0-9+.-]*:/iu.test(link) ? link : `https://${link}`)
    } catch {
      return { ok: false, reason: 'unrecognized' }
    }
    if (address.protocol !== 'http:' && address.protocol !== 'https:') return { ok: false, reason: 'unrecognized' }
    try {
      const response = await this.fetchImpl(address.href, {
        redirect: 'follow',
        headers: BILIBILI_HEADERS,
        signal: AbortSignal.timeout(MUSIC_TIMEOUT_MS),
      })
      const ref = parseBilibiliRef(response.url)
      if (ref === undefined) return { ok: false, reason: 'unrecognized' }
      return { ok: true, ref }
    } catch (error) {
      return { ok: false, reason: 'network', message: String(error?.message ?? error) }
    }
  }

  /**
   * The video's own facts, and the `cid` of the part the link asked for.
   * @param ref - parsed reference.
   * @returns `{ ok: true, title, owner, durationMs, cid, url }` or a `video` failure.
   */
  async videoInfo(ref) {
    const query = ref.kind === 'bvid' ? `bvid=${encodeURIComponent(ref.id)}` : `aid=${encodeURIComponent(ref.id)}`
    let payload
    try {
      const response = await this.fetchImpl(`${VIEW_API}?${query}`, { headers: BILIBILI_HEADERS, signal: AbortSignal.timeout(MUSIC_TIMEOUT_MS) })
      payload = await response.json()
    } catch (error) {
      return { ok: false, reason: 'network', message: String(error?.message ?? error) }
    }
    if (payload?.code !== 0 || payload.data === null || typeof payload.data !== 'object') {
      return { ok: false, reason: 'video', message: String(payload?.message ?? '') }
    }
    const data = payload.data
    // A multi-part video holds one cid per part, and `data.cid` is only the first
    // of them; the page number in the link is what says which one was meant.
    const pages = Array.isArray(data.pages) ? data.pages : []
    const page = pages[ref.page - 1]
    const cid = page?.cid ?? data.cid
    if (!Number.isSafeInteger(cid)) return { ok: false, reason: 'video', message: 'no cid' }
    const title = typeof page?.part === 'string' && page.part.trim() !== '' && pages.length > 1
      ? `${String(data.title ?? '')} - ${page.part.trim()}`
      : String(data.title ?? '')
    return {
      ok: true,
      title,
      owner: String(data.owner?.name ?? ''),
      durationMs: Number.isFinite(page?.duration) ? page.duration * 1000 : Number(data.duration ?? 0) * 1000,
      cid,
      url: `https://www.bilibili.com/video/${ref.kind === 'bvid' ? ref.id : `av${ref.id}`}${ref.page > 1 ? `?p=${ref.page}` : ''}`,
    }
  }

  /**
   * The best audio stream this video offers, in the order `MUSIC_QUALITY_ORDER`
   * names. Nothing is transcoded: whichever stream is chosen is written as it came.
   * @param ref - parsed reference.
   * @param cid - the part's cid.
   * @returns `{ ok: true, url }` or an `audio`/`no-audio`/`network` failure.
   */
  async audioStream(ref, cid) {
    const query = ref.kind === 'bvid' ? `bvid=${encodeURIComponent(ref.id)}` : `aid=${encodeURIComponent(ref.id)}`
    let payload
    try {
      const response = await this.fetchImpl(`${PLAYURL_API}?${query}&cid=${cid}&fnval=16`, { headers: BILIBILI_HEADERS, signal: AbortSignal.timeout(MUSIC_TIMEOUT_MS) })
      payload = await response.json()
    } catch (error) {
      return { ok: false, reason: 'network', message: String(error?.message ?? error) }
    }
    if (payload?.code !== 0) return { ok: false, reason: 'audio', message: String(payload?.message ?? '') }
    const streams = Array.isArray(payload.data?.dash?.audio) ? payload.data.dash.audio : []
    if (streams.length === 0) return { ok: false, reason: 'no-audio' }
    for (const quality of MUSIC_QUALITY_ORDER) {
      const chosen = streams.find(stream => stream.id === quality && typeof stream.baseUrl === 'string')
      if (chosen !== undefined) return { ok: true, url: chosen.baseUrl }
    }
    const fallback = streams.find(stream => typeof stream.baseUrl === 'string')
    if (fallback === undefined) return { ok: false, reason: 'no-audio' }
    return { ok: true, url: fallback.baseUrl }
  }
}

/**
 * The library as the settings card reads it: one row per configured link, with
 * whatever this machine knows about it, plus the files that are here without a
 * link (a link removed by hand leaves its audio behind) and the pet's own playback
 * state when it has one.
 *
 * The rows are built from the links first and the index second, so a link the
 * index does not know is reported as missing rather than dropped; a row carrying
 * both is the normal case.
 * @param options - what the view needs.
 * @param options.links - the configured link list.
 * @param options.entries - index entries by id.
 * @param options.dir - absolute music directory.
 * @param options.warning - what is wrong with that directory, if anything.
 * @param options.volume - configured volume, 0-100.
 * @param options.sync - sync progress.
 * @param options.player - the pet's playback state, when it reported one.
 * @param options.exists - file-existence check, injectable for tests.
 * @returns the view's JSON payload.
 */
export function musicView({ links, entries, dir, warning = '', volume, sync, player, exists = existsSync }) {
  const rows = []
  const claimed = new Set()
  // A link the last fill-in could not download is reported as failed rather than as
  // one nobody has tried yet: they look the same on disk and mean different things.
  // The one being downloaded right now is reported as that, so a long fill-in shows
  // which row it is on rather than leaving every row looking untouched.
  const failures = new Map()
  for (const item of Array.isArray(sync?.failed) ? sync.failed : []) failures.set(item.link, item)
  const running = sync?.running === true
  const stateOf = (link, ready) => ready
    ? 'ready'
    : running && sync.current === link
      ? 'downloading'
      : failures.has(link) ? 'failed' : 'missing'
  for (const link of links) {
    const ref = parseBilibiliRef(link)
    const byId = ref === undefined ? undefined : entries[musicEntryId(ref)]
    const entry = byId ?? Object.values(entries).find(candidate => candidate.source === link)
    if (entry === undefined) {
      const failure = failures.get(link)
      rows.push({
        link,
        id: ref === undefined ? '' : musicEntryId(ref),
        state: stateOf(link, false),
        title: '',
        owner: '',
        durationMs: 0,
        size: 0,
        reason: failure?.reason ?? '',
      })
      continue
    }
    claimed.add(entry.id)
    const ready = exists(join(dir, entry.file))
    rows.push({
      link,
      id: entry.id,
      state: stateOf(link, ready),
      title: entry.title,
      owner: entry.owner,
      durationMs: entry.durationMs,
      size: entry.size,
      url: entry.url,
      file: entry.file,
      reason: failures.get(link)?.reason ?? '',
    })
  }
  const extras = Object.values(entries)
    .filter(entry => !claimed.has(entry.id))
    .map(entry => ({
      link: entry.source,
      id: entry.id,
      state: exists(join(dir, entry.file)) ? 'ready' : 'missing',
      title: entry.title,
      owner: entry.owner,
      durationMs: entry.durationMs,
      size: entry.size,
      url: entry.url,
      file: entry.file,
    }))
  return {
    dir,
    warning,
    volume,
    sync,
    player: player ?? { playing: false, id: '', title: '', positionMs: 0, error: '' },
    entries: rows,
    extras,
    missing: rows.filter(row => row.state !== 'ready').length,
  }
}
