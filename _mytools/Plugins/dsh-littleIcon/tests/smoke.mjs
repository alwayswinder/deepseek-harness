/**
 * Keyless smoke test for the little-icon plugin: drives the host half's state
 * machine with fake `agents`/`jobs` services, checks that every state has its
 * animation frames, and (on Windows) runs `pet/pet.ps1 -SelfTest` so a broken
 * pet script fails here instead of at the next DSH start.
 *
 * Run: node tests/smoke.mjs           static checks and the pet script self test
 *      node tests/smoke.mjs --pet     also apply() the host half against a
 *                                     temporary DSH_HOME: it spawns a real pet
 *                                     window for a few seconds and asserts the
 *                                     disposer ends that process
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const { internals, apply } = await import('../index.js')
const {
  sampleState, createTimeline, sampleWork, shouldTuck, withMusic, clampVolume, MUSIC_STATE, STATES, ACTIVITY_PATH, COMMANDS_PATH,
  GIT_PATH, GIT_DIFF_PATH, GIT_COMMIT_PATH, GIT_COMMITS_PATH, GIT_REMOTE_PATH, GIT_PULL_PATH,
  GIT_DISCARD_PATH, OPEN_PATH,
  MUSIC_PATH, MUSIC_SYNC_PATH, MUSIC_DOWNLOAD_PATH, MUSIC_EXPAND_PATH, MUSIC_ADDED_PATH,
  MUSIC_REMOVE_PATH, MUSIC_COMMAND_PATH,
  GIT_DIFF_MAX_CHARS, GIT_DISCARD_MAX_BYTES, GIT_LOG_PAGE,
  parseGitStatus, parseGitLog, parseGitAuthors, parseGitCommitFiles,
  readGitRepository, readGitCommits, readGitRemoteStatus,
  pullGitRepository, discardGitChanges, readGitDiff, readGitCommit,
  openWorkingDirectory, resolveShotDir, resolveSites, StateFileWriter,
  coopRoleFor, coopPortFor, coopAutoAction,
} = internals
const {
  MusicLibrary, musicView, parseBilibiliRef, musicEntryId, sanitizeFileStem,
  resolveMusicDir, resolveMusicLinks, isInside, audioPayload,
  videoLink, expandVideoLinks, playlistOf, playlistOfEntry, playlistDirName,
} = await import('../music.js')

const root = fileURLToPath(new URL('..', import.meta.url))

// ---- music library ----------------------------------------------------------
//
// The library holds what one machine derived from the link list: the audio files in
// the configured directory, and the index naming them. The link list itself is config
// and travels; nothing here does. These checks run the resolution rules first, then
// the download pipeline against a fetch double, so no test reaches Bilibili.

// One video has many spellings and they all have to name the same entry: a watch
// address with its part number, a bare id, an `av` id, and nothing at all. Whether the
// text named a part itself matters, because a bare link means the whole set.
assert.deepEqual(parseBilibiliRef('https://www.bilibili.com/video/BV1GJ411x7h7?p=3&t=1'),
  { kind: 'bvid', id: 'BV1GJ411x7h7', page: 3, named: true })
assert.deepEqual(parseBilibiliRef('BV1GJ411x7h7'), { kind: 'bvid', id: 'BV1GJ411x7h7', page: 1, named: false })
assert.deepEqual(parseBilibiliRef('https://www.bilibili.com/video/BV1GJ411x7h7?p=1'),
  { kind: 'bvid', id: 'BV1GJ411x7h7', page: 1, named: true },
  'a link that names the first part is still a link that named a part')
assert.deepEqual(parseBilibiliRef('av12345'), { kind: 'aid', id: '12345', page: 1, named: false })
assert.equal(parseBilibiliRef('https://example.com/watch?v=abc'), undefined)
assert.equal(parseBilibiliRef('   '), undefined)
assert.equal(musicEntryId({ kind: 'bvid', id: 'BV1GJ411x7h7', page: 1 }), 'BV1GJ411x7h7')
assert.equal(musicEntryId({ kind: 'bvid', id: 'BV1GJ411x7h7', page: 2 }), 'BV1GJ411x7h7-p2',
  'two parts of one video are two entries, because they are two audio streams')

// What one link stands for. A bare link covers the whole set it belongs to — every
// part of a multi-part video, or the episodes of the collection it is in — and a link
// that names a part stays that one part, which is the escape hatch from a set of a
// hundred songs. This is what makes a collection one paste instead of a hundred.
assert.deepEqual(videoLink({ kind: 'bvid', id: 'BV1GJ411x7h7', page: 1 }), 'https://www.bilibili.com/video/BV1GJ411x7h7')
assert.deepEqual(videoLink({ kind: 'aid', id: '12345', page: 4 }), 'https://www.bilibili.com/video/av12345?p=4')
assert.deepEqual(expandVideoLinks(parseBilibiliRef('BV1GJ411x7h7'), { pages: 3 }),
  ['https://www.bilibili.com/video/BV1GJ411x7h7',
    'https://www.bilibili.com/video/BV1GJ411x7h7?p=2',
    'https://www.bilibili.com/video/BV1GJ411x7h7?p=3'],
  'a bare link to a multi-part video covers every part')
assert.deepEqual(expandVideoLinks(parseBilibiliRef('BV1GJ411x7h7?p=2'), { pages: 3 }),
  ['https://www.bilibili.com/video/BV1GJ411x7h7?p=2'],
  'a link that names a part stays that part')
assert.deepEqual(expandVideoLinks(parseBilibiliRef('BV1GJ411x7h7'), { pages: 1 }),
  ['https://www.bilibili.com/video/BV1GJ411x7h7'], 'a single video is only itself')
assert.deepEqual(expandVideoLinks(parseBilibiliRef('BV1GJ411x7h7'),
  { pages: 2, season: { title: '专辑', episodes: [{ id: 'BV1xx411c7mD', title: '一' }, { id: 'BV1yy411c7mE', title: '二' }] } }),
  ['https://www.bilibili.com/video/BV1xx411c7mD', 'https://www.bilibili.com/video/BV1yy411c7mE'],
  'a video in a collection stands for the collection\'s episodes, not its own parts')

// One link is one playlist: an episode belongs to its collection, everything else to its
// own video — so a part's playlist is its video, and the folder is named after whichever
// it is. This is what the card groups by and what the picker offers.
assert.deepEqual(playlistOf({ kind: 'bvid', id: 'BV1GJ411x7h7', page: 3, named: true }, { title: '专辑 - 三' }),
  { id: 'BV1GJ411x7h7', title: '专辑' }, 'a part belongs to its video, named without the part')
assert.deepEqual(playlistOf({ kind: 'bvid', id: 'BV1GJ411x7h7', page: 1, named: false }, { title: '一首歌' }),
  { id: 'BV1GJ411x7h7', title: '一首歌' }, 'a video of one part is named by its own title')
// A part's own name may hold a separator of its own, which is why the video is what is
// left of the FIRST one: stripping the last would give one playlist per part.
assert.deepEqual(playlistOf({ kind: 'bvid', id: 'BV1many00000', page: 5, named: true },
  { title: '一百首 - 005. 歌名 - 歌手' }),
{ id: 'BV1many00000', title: '一百首' }, 'a part named with an artist still belongs to its video')
assert.deepEqual(playlistOf({ kind: 'bvid', id: 'BV1many00000', page: 5, named: true },
  { title: '一百首 - 005. 歌名 - 歌手', videoTitle: '一百首' }),
{ id: 'BV1many00000', title: '一百首' }, 'and the video title the answer carried is exact')
assert.deepEqual(playlistOfEntry({ id: 'BV1many00000-p5', title: '一百首 - 005. 歌名 - 歌手' }),
  { id: 'BV1many00000', title: '一百首' },
  'an entry recorded earlier is named the same way, or one video becomes a hundred folders')
assert.deepEqual(playlistOf({ kind: 'bvid', id: 'BV1ep000000', page: 1, named: false },
  { title: '第一集', season: { id: 4210, title: '整套合集', episodes: [] } }),
{ id: 'season-4210', title: '整套合集' }, 'an episode belongs to its collection, not to itself')
assert.deepEqual(playlistDirName({ id: 'BV1GJ411x7h7', title: '专辑/名: 字' }), '专辑_名_ 字',
  'a playlist folder is a safe file name')
assert.deepEqual(playlistDirName({ id: 'BV1GJ411x7h7', title: '' }), 'BV1GJ411x7h7',
  'and a playlist with no readable name falls back to its id')
assert.deepEqual(playlistOfEntry({ id: 'BV1o-p7', title: 'Old Video - 7' }), { id: 'BV1o', title: 'Old Video' },
  'an entry recorded before playlists existed is named from the title it holds')
assert.deepEqual(playlistOfEntry({ id: 'BV1o', title: 'Kept', playlist: 'season-9', playlistTitle: '合集' }),
  { id: 'season-9', title: '合集' }, 'and one that recorded its playlist keeps it')

// File names: Windows refuses some characters, a title can be longer than a file name
// should be, and a title of nothing but those characters still has to leave a name.
assert.equal(sanitizeFileStem('a/b:c*d?e"f<g>h|i'), 'a_b_c_d_e_f_g_h_i')
assert.equal(sanitizeFileStem('   '), 'bilibili')
assert.equal(sanitizeFileStem('trailing dots...'), 'trailing dots')
assert.equal(sanitizeFileStem('x'.repeat(200)).length, 80)

// The directory: blank is the harness home, `~` is the user directory, and a relative
// path resolves there too rather than against whatever this process was started in.
assert.equal(resolveMusicDir('', 'D:\\dsh'), join('D:\\dsh', 'little-icon', 'music'))
assert.equal(resolveMusicDir('   ', 'D:\\dsh'), join('D:\\dsh', 'little-icon', 'music'))
assert.equal(resolveMusicDir('E:\\media', 'D:\\dsh'), 'E:\\media')
assert.equal(resolveMusicDir('media', 'D:\\dsh'), resolve('D:\\dsh', 'media'))
assert.equal(resolveMusicDir('~/media', 'D:\\dsh'), join(homedir(), 'media'))

// A music directory inside the checkout would put the audio in the repository, which
// is the one thing this feature must not do; the check is what the card reports on.
assert.equal(isInside('E:\\AI\\DSH\\_mytools\\music', 'E:\\AI\\DSH'), true)
assert.equal(isInside('E:\\AI\\DSH', 'E:\\AI\\DSH'), true)
assert.equal(isInside('E:\\AI\\DSH2\\music', 'E:\\AI\\DSH'), false)
assert.equal(isInside('E:\\media', 'E:\\AI\\DSH'), false)

// The link list: blank rows are not links, and the order the settings hold is the
// order the pet plays.
assert.deepEqual(resolveMusicLinks(['  BV1  ', '', '   ', 'av2']), ['BV1', 'av2'])
assert.deepEqual(resolveMusicLinks(undefined), [])

// A payload whose leading box is not the media box is cut back to the `ftyp` box —
// its own size field included, or the file would be malformed in a different way.
const ledPayload = Buffer.concat([
  Buffer.from([0, 0, 0, 0]), Buffer.from('junk', 'latin1'),
  Buffer.from([0, 0, 0, 20]), Buffer.from('ftypmp42body', 'latin1'),
])
assert.deepEqual(audioPayload(ledPayload),
  Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypmp42body', 'latin1')]))
const cleanPayload = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypmp42body', 'latin1')])
assert.deepEqual(audioPayload(cleanPayload), cleanPayload)

// The view: one row per configured link, in order; a link with no file is missing; a
// file with no link is kept apart rather than silently listed as one; and only files
// that are there count as ready.
const viewEntries = {
  BV1: { id: 'BV1', source: 'BV1', url: 'u', title: 'One', owner: 'o', durationMs: 1000, file: 'one.m4a', size: 10 },
  BV9: { id: 'BV9', source: 'BV9', url: 'u', title: 'Orphan', owner: 'o', durationMs: 1000, file: 'orphan.m4a', size: 10 },
}
const view = musicView({
  links: ['BV1', 'BV2'],
  entries: viewEntries,
  dir: join(tmpdir(), 'little-icon-music-view'),
  warning: '',
  volume: 55,
  sync: { running: false, done: 0, total: 0, current: '', added: 0, failed: [] },
  player: undefined,
  exists: (path) => path.endsWith('one.m4a'),
})
assert.deepEqual(view.entries.map(row => [row.link, row.state, row.title]),
  [['BV1', 'ready', 'One'], ['BV2', 'missing', '']])
assert.deepEqual(view.extras.map(row => row.id), ['BV9'])
assert.equal(view.missing, 1)
assert.equal(view.volume, 55)
assert.equal(view.player.playing, false, 'a pet that never reported one is shown as not playing')
// A link the last fill-in could not download is reported as failed rather than as one
// nobody has tried yet, and it still counts as missing.
const failedView = musicView({
  links: ['BV1', 'BV2'],
  entries: viewEntries,
  dir: join(tmpdir(), 'little-icon-music-view'),
  volume: 55,
  sync: { running: false, done: 1, total: 1, current: '', added: 0, failed: [{ link: 'BV2', reason: 'video', message: '稿件不可见' }] },
  exists: (path) => path.endsWith('one.m4a'),
})
assert.deepEqual(failedView.entries.map(row => [row.link, row.state, row.reason]),
  [['BV1', 'ready', ''], ['BV2', 'failed', 'video']])
assert.equal(failedView.missing, 1, 'a failed link is still one to fill in')
// The row a running fill-in is on says so, so a long list shows where it got to.
const runningView = musicView({
  links: ['BV1', 'BV2'],
  entries: viewEntries,
  dir: join(tmpdir(), 'little-icon-music-view'),
  volume: 55,
  sync: { running: true, done: 1, total: 2, current: 'BV2', added: 0, failed: [] },
  exists: (path) => path.endsWith('one.m4a'),
})
assert.deepEqual(runningView.entries.map(row => [row.link, row.state]), [['BV1', 'ready'], ['BV2', 'downloading']])

// The download pipeline. The view API, the playurl API, the short address, and the
// audio body are all answered here, so these checks cover what this half does with
// them: which stream is taken, where the file lands, what the index records, and what
// happens when the same video is added again or cannot be read at all.
const audioBody = Buffer.concat([Buffer.alloc(4, 0), Buffer.from('ftypmp42audio-bytes', 'latin1')])
const musicCalls = []
const musicFetch = async (url) => {
  const text = String(url)
  musicCalls.push(text)
  const video = /bvid=([^&]+)/u.exec(text)?.[1] ?? ''
  if (text.includes('/x/web-interface/view')) {
    if (video === 'BV1fail00000') return { ok: true, status: 200, json: async () => ({ code: -404, message: '稿件不可见' }) }
    const short = video === 'BV1short0000'
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          title: short ? 'Short Song' : 'Song One',
          owner: { name: 'Uploader' },
          duration: 12,
          cid: 99,
          pages: [{ cid: 99, duration: 12, part: 'P1' }],
        },
      }),
    }
  }
  if (text.includes('/x/player/playurl')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { dash: { audio: [
        { id: 30216, baseUrl: 'https://audio.example/low.m4a' },
        { id: 30280, baseUrl: 'https://audio.example/best.m4a' },
      ] } } }),
    }
  }
  if (text.startsWith('https://audio.example/')) {
    return { ok: true, status: 200, arrayBuffer: async () => audioBody.buffer.slice(audioBody.byteOffset, audioBody.byteOffset + audioBody.byteLength) }
  }
  if (text.startsWith('https://b23.tv/')) {
    return { ok: true, status: 200, url: 'https://www.bilibili.com/video/BV1short0000' }
  }
  return { ok: true, status: 200, url: text }
}

const musicHome = mkdtempSync(join(tmpdir(), 'little-icon-music-'))
const musicDir = join(musicHome, 'audio')
const musicLogger = { warns: [], warn(...args) { this.warns.push(args.join(' ')) } }
const library = new MusicLibrary({ dataDir: musicHome, dir: musicDir, logger: musicLogger, fetchImpl: musicFetch })
const firstLink = 'https://www.bilibili.com/video/BV1GJ411x7h7'
const downloaded = await library.download(firstLink)
assert.equal(downloaded.ok, true)
assert.equal(downloaded.title, 'Song One')
assert.ok(musicCalls.includes('https://audio.example/best.m4a'), 'the 30280 stream is the one taken')
assert.equal(readFileSync(join(musicDir, 'Song One', 'Song One.m4a'), 'latin1'), audioBody.toString('latin1'),
  'the payload lands in the playlist folder under the title')
const entry = library.entries[downloaded.id]
assert.equal(entry.owner, 'Uploader')
assert.equal(entry.durationMs, 12_000)
assert.equal(entry.file, 'Song One/Song One.m4a', 'and the index names the path inside that folder')
assert.equal(entry.playlist, 'BV1GJ411x7h7', 'the video is the playlist this song came from')
assert.equal(entry.playlistTitle, 'Song One', 'and the playlist is named after it')
assert.equal(entry.source, firstLink, 'the link text is kept, because that is what a short address has to match on')
assert.equal(existsSync(join(musicHome, 'music-index.json')), true, 'and the index names the file')

// The same video through a different spelling is a duplicate, not a second file.
assert.deepEqual(await library.download('BV1GJ411x7h7'), { ok: true, duplicate: true, id: downloaded.id, title: 'Song One', size: audioBody.length })

// A short address is followed to the video it names, and the entry remembers the
// address it was downloaded from so the link list can still find it.
const short = await library.download('https://b23.tv/abcdefg')
assert.equal(short.ok, true)
assert.equal(short.id, 'BV1short0000')
assert.equal(library.entryForLink('https://b23.tv/abcdefg').id, 'BV1short0000')

// A link this half cannot recognize, and a video it can read but whose stream fails,
// are reported as reasons the card localizes rather than as thrown errors.
assert.equal((await library.download('')).reason, 'empty')
assert.equal((await library.download('https://example.com/nothing')).reason, 'unrecognized')
assert.equal((await library.download('BV1fail00000')).reason, 'video')
assert.equal((await library.download('BV1fail00000')).message, '稿件不可见')

// Removing an entry deletes its file and its record; an id nobody recorded is
// refused rather than silently accepted.
assert.deepEqual(library.remove(downloaded.id), { ok: true })
assert.equal(existsSync(join(musicDir, 'Song One', 'Song One.m4a')), false)
assert.equal(library.entries[downloaded.id], undefined)
assert.deepEqual(library.remove('BV1nope'), { ok: false, reason: 'unknown' })

// A library recorded before playlists existed keeps its files: they move into the
// playlist folder on the next look, with no audio copied and the index naming the new
// path, and one whose file is already gone is left for the next download to place.
const legacyHome = mkdtempSync(join(tmpdir(), 'little-icon-music-legacy-'))
const legacyDir = join(legacyHome, 'audio')
mkdirSync(legacyDir, { recursive: true })
writeFileSync(join(legacyDir, 'Old Song.m4a'), 'audio')
writeFileSync(join(legacyHome, 'music-index.json'), `${JSON.stringify({
  version: 1,
  entries: {
    BV1old000000: {
      id: 'BV1old000000', source: 'BV1old000000', url: '', title: 'Old Song', owner: '',
      durationMs: 0, file: 'Old Song.m4a', size: 5, addedAt: '2026-01-01T00:00:00.000Z',
    },
    BV1gone00000: {
      id: 'BV1gone00000', source: 'BV1gone00000', url: '', title: 'Gone Song', owner: '',
      durationMs: 0, file: 'Gone Song.m4a', size: 5, addedAt: '2026-01-01T00:00:00.000Z',
    },
  },
}, null, 2)}\n`, 'utf8')
const migrated = new MusicLibrary({ dataDir: legacyHome, dir: legacyDir, logger: musicLogger, fetchImpl: musicFetch })
assert.equal(existsSync(join(legacyDir, 'Old Song', 'Old Song.m4a')), true,
  'a file recorded before playlists existed moves into its playlist folder')
assert.equal(existsSync(join(legacyDir, 'Old Song.m4a')), false, 'and is not left behind as a copy')
assert.equal(migrated.entries.BV1old000000.file, 'Old Song/Old Song.m4a', 'the index names where it went')
assert.equal(migrated.entries.BV1old000000.playlist, undefined, 'an old entry is named from what it holds')
assert.equal(migrated.filePath('BV1old000000'), join(legacyDir, 'Old Song', 'Old Song.m4a'),
  'and the library serves it from there')
assert.equal(migrated.entries.BV1gone00000.file, 'Gone Song.m4a', 'a file that is already gone is left alone')

// The one-click fill-in of a machine that pulled the link list: the links it has no
// file for are downloaded, one whose video cannot be read is reported and does not
// stop the rest, and the progress ends where it started — not running.
const fillHome = mkdtempSync(join(tmpdir(), 'little-icon-music-fill-'))
const fillLibrary = new MusicLibrary({ dataDir: fillHome, dir: join(fillHome, 'audio'), logger: musicLogger, fetchImpl: musicFetch })
const fillLinks = ['BV1GJ411x7h7', 'BV1fail00000', 'https://b23.tv/abcdefg']
const filled = await fillLibrary.sync(fillLinks)
assert.equal(filled.ok, true)
assert.equal(filled.total, 3)
assert.equal(filled.added, 2, 'every readable video is downloaded')
assert.deepEqual(filled.failed.map(item => item.link), ['BV1fail00000'], 'and the one that could not be is named')
assert.equal(filled.running, false, 'the progress is not left running')
assert.equal(fillLibrary.missingFiles().length, 0, 'every record it kept has its file')
// Asking again retries only what is still missing: a link with a file is not
// downloaded twice, and one whose download failed is offered again.
const again = await fillLibrary.sync(fillLinks)
assert.equal(again.total, 1, 'a second fill-in finds only the one that never arrived')
assert.deepEqual(again.failed.map(item => item.link), ['BV1fail00000'])

// A single download is refused while the fill-in owns the library. Two downloads
// naming their file at the same time would pick the same name — uniqueFileName only
// sees files that are already on disk — and the second would overwrite the first.
const busyHome = mkdtempSync(join(tmpdir(), 'little-icon-music-busy-'))
const busyLibrary = new MusicLibrary({ dataDir: busyHome, dir: join(busyHome, 'audio'), logger: musicLogger, fetchImpl: musicFetch })
const runningSync = busyLibrary.sync(['BV1GJ411x7h7'])
assert.deepEqual(await busyLibrary.download('https://b23.tv/abcdefg'), { ok: false, reason: 'running' },
  'a single download must not run beside the fill-in')
await runningSync

// Downloads run one at a time, in arrival order, so two requests for the same video
// become one download and one duplicate answer rather than two downloads recording
// the same entry (the first file would be left unclaimed).
const chainHome = mkdtempSync(join(tmpdir(), 'little-icon-music-chain-'))
const chainViews = new Map()
const chainFetch = async (url) => {
  const text = String(url)
  const video = /bvid=([^&]+)/u.exec(text)?.[1] ?? ''
  if (text.includes('/x/web-interface/view')) {
    chainViews.set(video, (chainViews.get(video) ?? 0) + 1)
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { title: 'Chain Song', owner: { name: 'o' }, duration: 1, cid: 7, pages: [] } }) }
  }
  if (text.includes('/x/player/playurl')) {
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { dash: { audio: [{ id: 30280, baseUrl: 'https://audio.example/chain.m4a' }] } } }) }
  }
  if (text.startsWith('https://audio.example/')) {
    return { ok: true, status: 200, arrayBuffer: async () => audioBody.buffer.slice(audioBody.byteOffset, audioBody.byteOffset + audioBody.byteLength) }
  }
  return { ok: true, status: 200, url: text }
}
const chainLibrary = new MusicLibrary({ dataDir: chainHome, dir: join(chainHome, 'audio'), logger: musicLogger, fetchImpl: chainFetch })
const chained = await Promise.all([chainLibrary.download('BV1chain0001'), chainLibrary.download('BV1chain0001')])
assert.deepEqual(chained.map(result => result.ok), [true, true])
assert.equal(chained[0].duplicate, undefined, 'the first request downloads')
assert.equal(chained[1].duplicate, true, 'the second lands on the entry the first recorded')
assert.deepEqual([...chainViews.entries()], [['BV1chain0001', 1]], 'and the video is read once')
assert.equal(Object.keys(chainLibrary.entries).length, 1, 'one video is one entry, however often it is asked for')
rmSync(chainHome, { recursive: true, force: true })

// Two videos that carry the same title still get one file each. The chain above
// serializes the public entry point, so this drives the two downloads past it — the
// last line of defence is the name being claimed for the write rather than looked up
// twice, and both bodies are held until each download is ready to name its file.
const raceHome = mkdtempSync(join(tmpdir(), 'little-icon-music-race-'))
const bodyCalls = { count: 0 }
const bothBodies = Promise.withResolvers()
const bodyGate = Promise.withResolvers()
const raceFetch = async (url) => {
  const text = String(url)
  const video = /bvid=([^&]+)/u.exec(text)?.[1] ?? ''
  if (text.includes('/x/web-interface/view')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: { title: 'Same Title', owner: { name: 'o' }, duration: 1, cid: video === 'BV1race00001' ? 11 : 22, pages: [] },
      }),
    }
  }
  if (text.includes('/x/player/playurl')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { dash: { audio: [{ id: 30280, baseUrl: `https://audio.example/${video}.m4a` }] } } }),
    }
  }
  if (text.startsWith('https://audio.example/')) {
    bodyCalls.count += 1
    if (bodyCalls.count === 2) bothBodies.resolve()
    await bodyGate.promise
    return { ok: true, status: 200, arrayBuffer: async () => audioBody.buffer.slice(audioBody.byteOffset, audioBody.byteOffset + audioBody.byteLength) }
  }
  return { ok: true, status: 200, url: text }
}
const raceLibrary = new MusicLibrary({ dataDir: raceHome, dir: join(raceHome, 'audio'), logger: musicLogger, fetchImpl: raceFetch })
const raceFirst = raceLibrary.downloadNow('BV1race00001')
const raceSecond = raceLibrary.downloadNow('BV1race00002')
await bothBodies.promise
bodyGate.resolve()
const raced = await Promise.all([raceFirst, raceSecond])
assert.deepEqual(raced.map(result => result.ok), [true, true])
const racedFiles = Object.values(raceLibrary.entries).map(entry => entry.file).sort()
// Two videos that happen to share a title also share the folder that title names, which
// is why the file name itself still has to be unique.
assert.deepEqual(racedFiles, ['Same Title/Same Title.m4a', 'Same Title/Same Title_2.m4a'],
  'two videos with one title must not be written over one another')
assert.deepEqual(racedFiles.map(file => existsSync(join(raceHome, 'audio', file))), [true, true])
assert.deepEqual(Object.values(raceLibrary.entries).map(entry => entry.playlist).sort(),
  ['BV1race00001', 'BV1race00002'], 'and each stays in its own playlist')

// Asking for the same video twice in a row is a duplicate rather than an error: the
// card says "already in the list" and nothing is downloaded again.
assert.deepEqual(await raceLibrary.download('BV1race00001'), {
  ok: true, duplicate: true, id: 'BV1race00001', title: 'Same Title', size: audioBody.length,
})
rmSync(raceHome, { recursive: true, force: true })
rmSync(busyHome, { recursive: true, force: true })

rmSync(musicHome, { recursive: true, force: true })
rmSync(fillHome, { recursive: true, force: true })
console.log('little-icon smoke: music library ok')

// ---- multi-machine side and port --------------------------------------------

// Which side a machine takes is read off its own adapters, so one address shared by
// both machines decides it: the machine that carries the IP hosts, the other dials
// in. The loopback address stands in for "an adapter this machine has" and a
// documentation address for one it does not, so the answer is the same everywhere.
const adapters = { lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }
assert.equal(coopRoleFor('127.0.0.1:15180', adapters), 'host', 'the machine carrying the address hosts')
assert.equal(coopRoleFor('203.0.113.9:15180', adapters), 'agent', 'a machine without it dials in')
assert.equal(coopRoleFor('', adapters), 'agent', 'a blank address leaves no host side to take')
assert.equal(coopRoleFor('127.0.0.1', adapters), 'host', 'a missing port does not change the side')
assert.equal(coopPortFor('192.168.1.3:15180'), '15180', 'the configured port is the listened one')
assert.equal(coopPortFor('192.168.1.3:9999'), '9999', 'a host on another port is honoured')
assert.equal(coopPortFor('192.168.1.3'), '15180', 'a missing port falls back to MouseShare default')
assert.equal(coopPortFor('192.168.1.3:abc'), '15180', 'an unusable port falls back too')
// Only the switch's own transition touches the link: a write to another field
// must not restart what the menu stopped, and turning the switch off must end it.
assert.equal(coopAutoAction(true, false), 'start', 'turning the switch on starts the link')
assert.equal(coopAutoAction(false, true), 'stop', 'turning it off ends the link')
assert.equal(coopAutoAction(true, true), 'none', 'a write while it is on leaves a stopped link stopped')
assert.equal(coopAutoAction(false, false), 'none', 'and one while it is off starts nothing')

// ---- busy predicate ---------------------------------------------------------

/** @param {object} options - which services exist and what they report. */
function fakeContext({ running = false, queued = false, stepped = false, jobs = [] } = {}) {
  const services = {
    agents: {
      list: () => [{
        id: 'agent-1',
        status: running ? 'running' : 'idle',
        inbox: { nextTurn: queued ? [{}] : [], nextStep: stepped ? [{}] : [] },
      }],
    },
    // The real registry scopes by owner: an omitted caller sees only unowned
    // jobs, so the same double must not answer for both or every job counts twice.
    jobs: { list: (owner) => (owner === undefined ? [] : jobs) },
  }
  return { get: (name) => services[name] }
}

const noWaiting = new Set()
assert.deepEqual(sampleWork(fakeContext(), noWaiting), {
  busy: false,
  waiting: false,
  reason: { agents: 0, jobs: 0, queued: 0 },
})
assert.equal(sampleWork(fakeContext({ running: true }), noWaiting).busy, true, 'a running agent is work')
// A job is real work, but it does not drive the face: every tool call's
// subprocess is a job, and one whose child outlives the call — a dev server left
// running, a detached helper — stays `running` long after the turn ended. It is
// still reported, so the state file says what is going on.
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'running' }] }), noWaiting).busy, false,
  'a running job does not hold the pet on "working"')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'running' }] }), noWaiting).reason.jobs, 1,
  'but it is reported in the published reason')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'stopping' }] }), noWaiting).busy, false,
  'a stopping job does not hold it either')
assert.equal(sampleWork(fakeContext({ jobs: [{ status: 'completed' }] }), noWaiting).busy, false)
assert.equal(sampleWork({ get: () => undefined }, noWaiting).busy, false, 'a profile without agents or jobs is never busy')
// Input waiting in an inbox is not work: a settled job's completion notice is
// injected as a next-step message and, under a quiet delivery or a spent wake
// budget, waits there while nothing runs. Counting it kept the pet on "working"
// long after the task it belonged to had finished — the reason the published
// state carries `reason`, so the file explains itself.
assert.equal(sampleWork(fakeContext({ queued: true }), noWaiting).busy, false, 'queued input is not work')
assert.equal(sampleWork(fakeContext({ stepped: true }), noWaiting).busy, false, 'an injected step notice is not work')
assert.deepEqual(sampleWork(fakeContext({ stepped: true, queued: true }), noWaiting).reason,
  { agents: 0, jobs: 0, queued: 2 }, 'the published reason counts what is waiting')
assert.equal(sampleWork(fakeContext({ running: true, stepped: true }), noWaiting).busy, true,
  'a running agent stays busy whatever is queued behind it')
// An agent waiting for the user is not working: the loop is blocked on the person,
// so a question on screen — or input queued behind it — must not read as work.
const askedWork = sampleWork(fakeContext({ running: true }), new Set(['agent-1']))
assert.equal(askedWork.busy, false, 'an agent waiting for the user is not work')
assert.equal(askedWork.waiting, true, 'and it is reported as waiting, which the pet shows as surprise')
assert.equal(sampleWork(fakeContext({ queued: true }), new Set(['agent-1'])).busy, false,
  'input queued while an agent waits for the user is not work either')
assert.equal(sampleWork(fakeContext({ running: true }), new Set(['another-agent'])).busy, true,
  'a different agent keeps working while one waits')
assert.equal(sampleWork(fakeContext({ running: true }), new Set(['another-agent'])).waiting, false,
  'a question for one agent is not reported for another')
assert.equal(sampleWork(fakeContext({ running: true, jobs: [{ status: 'running' }] }), new Set(['agent-1'])).busy, false,
  'a waiting agent is not work, and a job does not change that')

const DEFAULTS = {
  size: 160,
  idleOpacity: 0.45,
  frameMs: 600,
  happyMs: 3000,
  boredEverySeconds: 60,
  boredMs: 5000,
  sleepAfterSeconds: 600,
  topmost: true,
  clickAction: 'toggle',
  autoHide: true,
  autoHideSeconds: 0,
}

const start = 1_000_000

/** Work in flight, nobody waiting on the person. */
const working = { busy: true, waiting: false }
/** The model blocked on an answer: the pet asks for the decision instead. */
const waiting = { busy: false, waiting: true }
/** Nothing under way. */
const quietWork = { busy: false, waiting: false }

// One run reads as work, surprise while it waits for the person, joy when it ends,
// then idle — then boredom now and then, and sleep once nothing has happened for
// the configured stretch.
let timeline = createTimeline(start)
const quiet = (now) => sampleState(quietWork, start, timeline, DEFAULTS, now)

assert.equal(quiet(start), 'idle', 'a fresh pet idles')
assert.equal(sampleState(working, start, timeline, DEFAULTS, start + 100), 'working',
  'a task starts working directly, with no startle first')
// A question parks the run on the person, and the surprise lasts as long as the
// question is unanswered — the whole point of the expression.
const asked = start + 5000
assert.equal(sampleState(waiting, start, timeline, DEFAULTS, asked), 'alert', 'waiting for the answer startles')
assert.equal(sampleState(waiting, start, timeline, DEFAULTS, asked + DEFAULTS.happyMs), 'alert',
  'the startle does not time out while the question stands')
assert.equal(sampleState(working, start, timeline, DEFAULTS, asked + 6000), 'working',
  'the answer puts the pet straight back to work')
const busyEnd = start + 40_000
assert.equal(sampleState(quietWork, start, timeline, DEFAULTS, busyEnd), 'happy', 'work ends happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs - 1), 'happy')
assert.equal(quiet(busyEnd + DEFAULTS.happyMs), 'idle')

// Boredom follows the idle agent rather than the mouse: moving the pointer while
// nothing runs must not postpone it.
const boredAt = busyEnd + DEFAULTS.boredEverySeconds * 1000
assert.equal(quiet(boredAt - 1), 'idle')
const wiggle = busyEnd + 30_000
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, wiggle), 'idle')
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, boredAt), 'bored', 'activity while idle must not postpone boredom')
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, boredAt + DEFAULTS.boredMs), 'idle')

// Sleep follows activity instead, on the timer the caller puts in force.
const asleep = wiggle + DEFAULTS.sleepAfterSeconds * 1000
assert.equal(sampleState(quietWork, wiggle, timeline, DEFAULTS, asleep), 'sleep')
assert.equal(sampleState(quietWork, asleep, timeline, DEFAULTS, asleep + 500), 'idle', 'activity wakes the pet')
assert.equal(sampleState(quietWork, asleep + 500, timeline, DEFAULTS, asleep + 500 + DEFAULTS.boredEverySeconds * 1000 - 1),
  'idle', 'waking restarts the boredom clock rather than showing boredom at once')
// Tucked away the host passes the much shorter timer, and the same rule applies.
const tucked = { ...DEFAULTS, sleepAfterSeconds: 20 }
assert.equal(sampleState(quietWork, asleep + 500, timeline, tucked, asleep + 500 + 19_000), 'idle')
assert.equal(sampleState(quietWork, asleep + 500, timeline, tucked, asleep + 500 + 20_000), 'sleep')

// Movement of the pet itself is activity too, and a run starting again works at once.
const moved = asleep + 500 + 20_000
assert.equal(sampleState(quietWork, moved, timeline, DEFAULTS, moved + 200), 'idle')
assert.equal(sampleState(working, moved, timeline, DEFAULTS, moved + 1000), 'working')

// Listening is layered on the sampled expression rather than sampled itself: the
// pet's player is the input, so it plays over the idle family and never over a task
// in flight.
assert.equal(withMusic('idle', true), MUSIC_STATE, 'music plays over idle')
assert.equal(withMusic('bored', true), MUSIC_STATE, 'music plays over a bored interruption')
assert.equal(withMusic('sleep', true), MUSIC_STATE, 'music plays over sleep')
assert.equal(withMusic('happy', true), 'happy', 'the end-of-run celebration keeps its own frames')
assert.equal(withMusic('working', true), 'working', 'a running task keeps its own frames')
assert.equal(withMusic('alert', true), 'alert', 'waiting for an answer keeps the startle')
assert.equal(withMusic('idle', false), 'idle', 'silence leaves the sampled expression alone')
assert.equal(withMusic('working', false), 'working', 'and it never invents a state of its own')

// A volume the menu asked for is a whole percent inside the range; anything that is
// not a number at all is dropped rather than clamped into a value nobody asked for.
assert.equal(clampVolume(35), 35, 'a menu volume is kept as asked')
assert.equal(clampVolume(35.4), 35, 'and rounded to the step the slider and the card use')
assert.equal(clampVolume(-5), 0, 'below silence is silence')
assert.equal(clampVolume(140), 100, 'and above full is full')
assert.equal(clampVolume('80'), 80, 'a number written as text still counts')
assert.equal(clampVolume('loud'), undefined, 'a value that is not a number changes nothing')

// Tucking DSH away follows what is in front rather than the activity clock: DSH
// itself in front is never tucked away, and another application in front is what
// asks for the tuck after the configured stretch — zero by default, so it lands on
// the next sample. Only the pet can hide a window, so the decision stays a fact.
const behindAt = moved + 200
const behind = { visible: true, foreground: false, behindSince: behindAt }
const inFront = { visible: true, foreground: true, behindSince: undefined }
assert.equal(shouldTuck(inFront, DEFAULTS, behindAt + 3_600_000), false,
  'DSH in front is never tucked away, however long nothing is touched')
assert.equal(shouldTuck(behind, DEFAULTS, behindAt), true, 'with no delay it goes on the sample it went behind')
assert.equal(shouldTuck({ visible: false, foreground: false, behindSince: behindAt }, DEFAULTS, behindAt + 1000), false,
  'a hidden DSH has nothing to tuck')
assert.equal(shouldTuck({ visible: true, foreground: false, behindSince: undefined }, DEFAULTS, behindAt + 1000), false,
  'a window that never went behind has no tuck clock')
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHide: false }, behindAt + 60_000), false,
  'the switch turns the tuck off')
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHideSeconds: 30 }, behindAt + 29_999), false)
assert.equal(shouldTuck(behind, { ...DEFAULTS, autoHideSeconds: 30 }, behindAt + 30_000), true,
  'a configured stretch counts from going behind, not from the last input')

// Every state the host can publish has frames on disk, and the generator's
// frames.json agrees with the files: the art decides the count per state (the
// working sheet holds six figures, the others four), and the pet probes it. The
// listening frames are counted here too: the sampler never returns them, but the
// host publishes them while the pet plays, so they must exist like the rest.
const frameCounts = JSON.parse(readFileSync(join(root, 'assets', 'frames.json'), 'utf8'))
assert.deepEqual(Object.keys(frameCounts).sort(), [...STATES, MUSIC_STATE].sort())
for (const state of [...STATES, MUSIC_STATE]) {
  const count = frameCounts[state]
  assert.ok(Number.isInteger(count) && count >= 2, `frames.json has no frame count for ${state}`)
  for (let frame = 1; frame <= count; frame += 1) {
    const file = join(root, 'assets', state, `${frame}.png`)
    assert.ok(existsSync(file), `missing pet frame ${file}`)
  }
  assert.ok(!existsSync(join(root, 'assets', state, `${count + 1}.png`)),
    `${state} has more frames on disk than frames.json records`)
}
assert.ok(existsSync(join(root, 'pet', 'pet.ps1')), 'missing pet/pet.ps1')

// The pet script stays ASCII: Windows PowerShell 5.1 decodes a .ps1 without a
// BOM as ANSI, and the mojibake that follows can swallow quotes. Localized tray
// text therefore lives in labels.json.
const petSource = readFileSync(join(root, 'pet', 'pet.ps1'), 'utf8')
const firstNonAscii = [...petSource].findIndex((character) => character.codePointAt(0) > 127)
assert.equal(firstNonAscii, -1, `pet/pet.ps1 must stay ASCII; found ${JSON.stringify(petSource.slice(firstNonAscii, firstNonAscii + 20))}`)
// PowerShell takes the last definition and says nothing, so a helper edited into
// the script twice would silently drop the first copy's behaviour.
const petFunctions = [...petSource.matchAll(/^function ([\w-]+)/gm)].map((match) => match[1])
assert.deepEqual(petFunctions.filter((name, index) => petFunctions.indexOf(name) !== index), [],
  `pet/pet.ps1 defines a function twice: ${petFunctions.join(', ')}`)

const labels = JSON.parse(readFileSync(join(root, 'pet', 'labels.json'), 'utf8'))
assert.equal(labels.QuitDsh, '退出 DSH', 'the menu entry that ends DSH')
assert.equal(labels.RestartDsh, '重启 DSH', 'the menu entry that ends DSH and starts it again')
assert.equal(labels.UpdateDsh, '更新 DSH', 'the menu entry that builds the current checkout')
assert.equal(labels.OpenCwd, '打开工作目录', 'the menu entry that opens the working directory')
assert.equal(labels.Settings, '设置', 'the menu entry that opens the plugin settings page')
assert.equal(labels.Games, '小游戏', 'the menu entry the mini games hang under')
assert.equal(labels.Aquarium, '玻璃鱼缸', 'the mini game entry that opens the aquarium')
assert.equal(labels.Shot, '截图', 'the menu entry that captures a region of the screen')
assert.equal(labels.Sites, '常用网站', 'the menu entry the configured sites hang under')
assert.equal(labels.Music, '听歌', 'the menu entry the music hangs under')
assert.equal(labels.MusicPlay, '开始', 'the music entry that starts playing')
assert.equal(labels.MusicPause, '暂停', 'the music entry that pauses')
assert.equal(labels.MusicNext, '换歌', 'the music entry that steps to the next song')
assert.equal(labels.System, '系统', 'the menu entry the DSH lifecycle entries hang under')
for (const key of ['PetName', 'Chat', 'Git', 'OpenCwd', 'OpenCwdNoCwd', 'OpenCwdNoDir', 'OpenCwdFailed',
  'Settings', 'Sites', 'SitesEmpty', 'SitesManage', 'Games', 'Aquarium', 'Shot', 'ShotHint', 'ShotSaved',
  'ShotSavedNoClipboard', 'ShotFailed', 'System',
  'UpdateDsh', 'UpdateDshConfirm', 'UpdateDshUnavailable', 'UpdateDshFailed', 'UpdateDshBuildFailed',
  'UpdateDshFailedStep', 'UpdateDshLog',
  'Music', 'MusicPlay', 'MusicPause', 'MusicNext', 'MusicPrev', 'MusicNowPlaying', 'MusicPaused',
  'MusicReady', 'MusicEmpty', 'MusicEmptyHint', 'MusicMissing', 'MusicSync', 'MusicSyncCount',
  'MusicSyncing', 'MusicSyncNone', 'MusicSynced', 'MusicSyncRunning', 'MusicOpenDir', 'MusicOpenFailed',
  'MusicFailed',
  'RestartDsh', 'RestartDshConfirm', 'RestartDshUnavailable', 'RestartDshFailed', 'QuitDsh', 'QuitDshConfirm']) {
  assert.ok(typeof labels[key] === 'string' && labels[key].length > 0, `labels.json is missing ${key}`)
}
// Every music label in the pet's fallback must exist in labels.json too, or a
// missing file would silently mix English into a Chinese menu.
for (const key of Object.keys(labels).filter(name => name.startsWith('Music'))) {
  assert.match(petSource, new RegExp(`^\\s+${key}\\s+=`, 'm'),
    `pet/pet.ps1 has no English fallback for ${key}`)
}
// The mini-games submenu is drawn by the pet process, so the two halves only meet
// on the command id: the pet must send the one the page carries out.
assert.match(petSource, /Send-MenuCommand 'aquarium'/, 'the pet menu must send the aquarium command')
// A configured site is the same handshake plus the address the entry named, and
// the submenu is rebuilt at every open rather than fixed at startup: the list is
// the settings card's, and editing it must not need a restarted pet.
assert.match(petSource, /Send-MenuCommand 'site' \$Site\.Url/, 'the pet menu must send the site command with its address')
assert.match(petSource, /add_DropDownOpening/, 'the sites submenu must rebuild itself when it opens')
assert.match(petSource, /function Update-SiteMenu/, 'the sites submenu needs its rebuild step')
assert.match(petSource, /\$SCRIPT:Sites = Get-SiteList \$State/, 'the published sites must reach the submenu')
assert.match(petSource, /case "globe":/, 'the sites entry needs its icon, like every other entry')
// The three entries that act on the running application share one parent rather
// than sitting at the top level, so the divider opens a submenu.
assert.match(petSource, /Add-PetMenuItem \$systemItem\.DropDownItems \$SCRIPT:Labels\.UpdateDsh/,
  'the update entry must belong to the system submenu')
assert.match(petSource, /Add-PetMenuItem \$systemItem\.DropDownItems \$SCRIPT:Labels\.RestartDsh/,
  'and so must the restart entry')
assert.match(petSource, /Add-PetMenuItem \$systemItem\.DropDownItems \$SCRIPT:Labels\.QuitDsh/,
  'and so must the quit entry')
assert.match(petSource, /case "system":/, 'the system submenu needs its own icon')
assert.match(petSource, /--detached --restart/, 'the update entry must restart only through the detached Desktop build')
// The pet has no quit entry of its own any more: the plugin's enable switch owns
// its lifetime, and the freed entry ends DSH instead.
assert.equal(labels.Quit, undefined, 'the pet must not offer to quit itself')
// Nor does the menu carry the window utilities any more: clicking the pet is the
// tuck route (DSH's own tray icon is the other), and the position only ever moves
// by dragging the pet.
assert.equal(labels.ToggleShown, undefined, 'the menu must not offer to tuck DSH away')
assert.equal(labels.ToggleHidden, undefined, 'the menu must not offer to show DSH either')
assert.equal(labels.Reset, undefined, 'the menu must not offer to move the pet home')

// ---- screenshot folder ------------------------------------------------------

// What the pet is told is an absolute path or nothing at all. A blank setting means
// "no choice", which leaves the pet on its own directory; `~` and a relative path
// resolve against the user directory, never against wherever DSH happened to be
// started, because the pet is handed a directory rather than a rule for finding one.
assert.equal(resolveShotDir('   '), undefined, 'a blank setting is no choice at all')
assert.equal(resolveShotDir('~'), homedir())
assert.equal(resolveShotDir('~/pics'), join(homedir(), 'pics'), 'a leading ~ expands to the user directory')
assert.equal(resolveShotDir(join('pics', 'dsh')), join(homedir(), 'pics', 'dsh'),
  'a relative path is relative to the user directory, not to this process')
const absoluteShotDir = join(homedir(), 'somewhere', 'shots')
assert.equal(resolveShotDir(absoluteShotDir), absoluteShotDir, 'an absolute path is kept as it is')
assert.equal(resolveShotDir(`${absoluteShotDir}${sep}`), absoluteShotDir,
  'a trailing separator is normalized away, so one folder has one spelling')

// ---- menu sites -------------------------------------------------------------

// The sites the menu offers are resolved once, here: a row counts only when the
// in-app Browser tab could open its address, a scheme the person did not type is
// completed the way a browser's address bar completes one, and a row that left the
// note blank is named by its host so no entry reads as an empty line.
assert.deepEqual(resolveSites(undefined), [], 'nothing configured is nothing to offer')
assert.deepEqual(resolveSites([]), [], 'an empty list is nothing to offer')
assert.deepEqual(resolveSites([{ name: 'Chat', url: 'https://chat.deepseek.com' }]),
  [{ name: 'Chat', url: 'https://chat.deepseek.com/' }], 'a stored address is offered as it stands')
assert.deepEqual(resolveSites([{ name: '', url: 'example.com' }]),
  [{ name: 'example.com', url: 'https://example.com/' }], 'a bare host is completed, and names itself')
assert.deepEqual(resolveSites([{ name: '  Docs  ', url: ' http://example.com/a?b=1 ' }]),
  [{ name: 'Docs', url: 'http://example.com/a?b=1' }], 'the note and the address are both trimmed')
assert.deepEqual(resolveSites([
  { name: 'second', url: 'https://b.test' },
  { name: 'first', url: 'https://a.test' },
]).map(site => site.name), ['second', 'first'], 'the menu keeps the order the card was written in')
// A row the Browser tab cannot open is left out rather than offered as an entry
// that opens nothing: the same rule refuses it again when the pet sends it back.
for (const row of [
  { name: 'no address' },
  { name: 'empty address', url: '' },
  { name: 'blank address', url: '   ' },
  { name: 'local file', url: 'file:///C:/notes.txt' },
  { name: 'script', url: 'javascript:alert(1)' },
  { name: 'credentials', url: 'https://user:secret@example.com' },
  { name: 'no host', url: 'http://' },
]) {
  assert.deepEqual(resolveSites([row]), [], `a row that cannot open must not be offered: ${JSON.stringify(row)}`)
}
// A row that cannot open does not take its neighbours with it.
assert.deepEqual(resolveSites([
  { name: 'kept', url: 'kept.test' }, { name: 'dropped', url: 'mailto:someone@example.com' },
]).map(site => site.url), ['https://kept.test/'], 'one unusable row must not cost the others')

// ---- state writer -----------------------------------------------------------

// Windows refuses to replace a file another process holds open — the pet reads
// state.json every 200 ms, so this happens for real. A write that cannot be placed
// reports and keeps the last snapshot the pet can still read: it runs in the
// sampling timer, and an uncaught exception there exits the whole DSH host.
const writerDir = mkdtempSync(join(tmpdir(), 'little-icon-state-'))
const stateFile = join(writerDir, 'state.json')
const writeFailures = []
const writer = new StateFileWriter(stateFile, 60_000, (error) => writeFailures.push(error))
assert.equal(writer.write({ state: 'idle', updatedAt: 1 }), true, 'the first snapshot is written')
assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).state, 'idle')
assert.equal(writer.write({ state: 'idle', updatedAt: 2 }), false, 'unchanged content writes nothing')
assert.equal(writer.write({ state: 'working', updatedAt: 3 }), true, 'changed content is written')

if (process.platform === 'win32') {
  // The obstruction the crash had: an open handle on the state file. Only Windows
  // refuses the replacement, and that is the platform the pet runs on.
  const holder = openSync(stateFile, 'r')
  try {
    const started = Date.now()
    assert.equal(writer.write({ state: 'happy', updatedAt: 4 }), true,
      'a refused replacement still lands in place')
    // Attempts, not duration, are what matter; the floor only proves the retry loop
    // ran instead of falling back to the in-place write immediately.
    assert.ok(Date.now() - started >= 40, 'the replacement was retried before falling back')
    assert.equal(writeFailures.length, 0, 'a snapshot that landed in place is not a failure')
    assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).state, 'happy',
      'the pet reads the new snapshot')
  } finally {
    closeSync(holder)
  }
} else {
  console.log('skipping the held-open state file case: only Windows refuses the replacement')
}

// A snapshot that cannot be placed at all — here the path names a directory —
// returns false and reports, instead of throwing into the sampling timer that
// exits the whole DSH host.
const blocked = join(writerDir, 'blocked')
mkdirSync(blocked)
const blockedWriter = new StateFileWriter(blocked, 60_000, (error) => writeFailures.push(error))
assert.equal(blockedWriter.write({ state: 'idle', updatedAt: 7 }), false, 'a write that cannot land returns false')
assert.equal(writeFailures.length, 1, 'and it reports its error')
assert.equal(blockedWriter.write({ state: 'working', updatedAt: 8 }), false, 'a repeated failure does not throw')
assert.equal(writeFailures.length, 1, 'a failing stretch reports once, not once per tick')
rmSync(writerDir, { recursive: true, force: true })

// ---- pet script -------------------------------------------------------------

if (process.platform === 'win32') {
  // The self test exits before it touches these; a temp directory keeps a stray
  // failure from dropping state files into the repository.
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const probeDir = mkdtempSync(join(tmpdir(), 'little-icon-selftest-'))
  const selfTest = spawnSync(powershell, [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'pet', 'pet.ps1'),
    '-AssetDir', join(root, 'assets'),
    '-StateFile', join(probeDir, 'state.json'),
    '-PositionFile', join(probeDir, 'position.json'),
    '-SelfTest',
  ], { encoding: 'utf8' })
  rmSync(probeDir, { recursive: true, force: true })
  assert.equal(selfTest.status, 0, `pet.ps1 -SelfTest failed: ${selfTest.stderr}`)
  // The self test counts frames by probing the directories, so its output is the
  // pet's own view; it must agree with what the generator recorded.
  for (const state of [...STATES, MUSIC_STATE]) assert.match(selfTest.stdout, new RegExp(`${state}=${frameCounts[state]}`))
  // The self test prints the labels it loaded from labels.json, so this proves
  // Windows PowerShell read that UTF-8 file as UTF-8.
  assert.match(selfTest.stdout, /Git 改动/, 'the self test must report the Git menu entry too')
  assert.match(selfTest.stdout, /打开工作目录/, 'the self test must report the open-directory entry too')
  assert.match(selfTest.stdout, /设置/, 'the self test must report the settings entry too')
  assert.match(selfTest.stdout, /系统/, 'the self test must report the system entry too')
  assert.match(selfTest.stdout, /小游戏/, 'the self test must report the mini-games entry too')
  assert.match(selfTest.stdout, /玻璃鱼缸/, 'the self test must report the aquarium entry too')
  assert.match(selfTest.stdout, /截图/, 'the self test must report the capture entry too')
  assert.match(selfTest.stdout, /更新 DSH/, 'the self test must report the update entry too')
  assert.match(selfTest.stdout, /重启 DSH/, 'the self test must report the restart entry too')
  assert.match(selfTest.stdout, /常用网站/, 'the self test must report the sites entry too')
  assert.match(selfTest.stdout, /特殊功能/, 'the self test must report the Special submenu too')
  assert.match(selfTest.stdout, /多机协同/, 'the self test must report the multi-machine entry too')
  // Bringing DSH back is not one command: SW_RESTORE also returns a maximized or
  // fullscreen window to the size it had before, so a window this pet hid is shown
  // and only a minimized one is restored. Getting this backwards drops DSH out of
  // fullscreen every time the pet tucks it away and brings it back.
  assert.match(selfTest.stdout, /show-commands: minimized=9 hidden=5/,
    'a hidden window must be shown and a minimized one restored')
  // A click means "let me look at DSH", so it may only tuck away a window that is
  // already in front. Deciding on visibility alone made a click while working in
  // another application hide DSH, which is the opposite of what it asked for.
  assert.match(selfTest.stdout, /click-intent: front=hide behind=show hidden=show minimized=show/,
    'a click must hide only an in-front window and raise every other one')
  // The sites submenu is the menu's only part built from configuration, so the
  // self test builds it for an empty list and for a list of two and prints what
  // each turned into: what an entry reads, the address it carries, and the two
  // entries an empty list still needs.
  const siteMenu = /site-menu: (.*)/.exec(selfTest.stdout)
  assert.ok(siteMenu !== null, 'the self test must report the sites submenu')
  const [emptyList, twoSites, clickedEntry, published] = siteMenu[1].trim().split(' >> ')
  assert.equal(emptyList,
    `ToolStripMenuItem=${labels.SitesEmpty}|ToolStripSeparator=|ToolStripMenuItem=${labels.SitesManage}`,
    'an empty list says so and still offers the way to fill it')
  assert.equal(twoSites,
    ['Chat@https://chat.deepseek.com/', 'Docs@https://docs.example.com/', '@', `${labels.SitesManage}@`].join('|'),
    'each configured site is one entry carrying its own address, then the way to manage them')
  // Firing one entry is what proves the handler carries *that* entry's address: a
  // handler reading the wrong scope still shows the right text and tooltip, and
  // still writes a command — just with no address in it.
  assert.equal(clickedEntry, 'click=site|https://chat.deepseek.com/',
    'clicking a site entry must write its own command and address')
  assert.equal(published, ['Chat=https://chat.deepseek.com/', 'https://bare.test/=https://bare.test/'].join('|'),
    'a published row is the entry, and a row with no note is named by its address')
  // Multi-machine is the other submenu rebuilt at every open: its three states are
  // rendered, and what the toggle writes is fired for the one that offers a start.
  // No status file exists beside a self-test state file, so the two running states
  // must read as "not connected yet" — that is the file, not a guess, being read.
  const coopMenu = /coop-menu: (.*)/.exec(selfTest.stdout)
  assert.ok(coopMenu !== null, 'the self test must report the multi-machine submenu')
  const [coopOff, coopHost, coopClient, coopClicked] = coopMenu[1].trim().split(' >> ')
  assert.equal(coopOff.split('|')[0], `ToolStripMenuItem=${labels.CoopOff}`,
    'an idle submenu says so, and only then does it offer to start')
  assert.ok(coopOff.includes(`ToolStripMenuItem=${labels.CoopStart}`),
    'the idle submenu offers the start entry')
  assert.ok(coopHost.includes(`ToolStripMenuItem=${labels.CoopHostWaiting}`),
    'the host side with nothing connected yet waits for the other computer')
  assert.ok(coopClient.includes(`ToolStripMenuItem=${labels.CoopAgentWaiting}`),
    'the client side with nothing connected yet reports reconnecting')
  assert.ok(coopHost.includes(`ToolStripMenuItem=${labels.CoopStop}`),
    'a running submenu offers the stop entry instead')
  assert.equal(coopClicked, 'click=coop-start', 'clicking the start entry writes its command')
  // Music is the third submenu rebuilt at every open, and the odd one out: the
  // transport entries act on this process (the pet owns the audio, so it keeps
  // playing while DSH is tucked away), while filling the library in and opening its
  // folder need the host and the settings page is DSH's own. What each library turns
  // into is what this checks: the status line, the three transport entries, the
  // download entry's count, and the two commands that leave this process.
  const musicMenu = /music-menu: (.*)/.exec(selfTest.stdout)
  assert.ok(musicMenu !== null, 'the self test must report the music submenu')
  const [musicReady, musicPlaying, musicSyncing, musicMissing, musicEmpty, musicFolder, musicSyncClick, musicVolume, musicSlider, musicSliderCommit, musicSliderLabel, musicPresetCommit, musicShuffle, musicOrder] =
    musicMenu[1].trim().split(' >> ')
  assert.equal(musicReady.split('|')[0], `ToolStripMenuItem=${labels.MusicReady.replace('{0}', 'Song A')}[False]`,
    'a track that has not been started says which one it is and that it is ready')
  assert.ok(musicReady.includes(`ToolStripMenuItem=${labels.MusicPlay}[True]`), 'and offers to start it')
  assert.ok(musicReady.includes(`ToolStripMenuItem=${labels.MusicNext}[True]`), 'the next entry is offered')
  assert.ok(musicReady.includes(`ToolStripMenuItem=${labels.MusicPrev}[True]`), 'and so is the previous one')
  assert.ok(musicReady.includes(`ToolStripMenuItem=${labels.MusicSyncCount.replace('{0}', '2')}[True]`),
    'a machine missing two of them offers to fill them in')
  assert.ok(musicPlaying.includes(`${labels.MusicNowPlaying.replace('{0}', 'Song A')}`),
    'playing changes the status line')
  assert.ok(musicPlaying.includes(`${labels.MusicPause}[True]`),
    'and the transport entry becomes the pause one')
  assert.ok(musicSyncing.includes(`${labels.MusicSyncing.replace('{0}', '1').replace('{1}', '3')}[False]`),
    'a download in flight is a disabled progress line')
  assert.ok(musicMissing.includes(`${labels.MusicMissing.replace('{0}', '3')}`),
    'nothing downloaded yet is reported as that many links to fill in')
  assert.ok(musicMissing.includes(`${labels.MusicEmptyHint}[False]`),
    'and the empty submenu says where songs come from')
  assert.ok(musicEmpty.includes(`${labels.MusicSyncNone}[False]`),
    'a library with nothing missing says so instead of offering a download')
  assert.equal(musicFolder, 'folder=music-open-dir', 'the folder entry asks the host to open it')
  assert.equal(musicSyncClick, 'sync=music-sync', 'and the fill-in entry asks the host to download')
  // Volume and the link entry are configuration, so they are checked as such: the
  // volume row is a hosted track bar with the number beside it, its presets move that
  // same slider, and a move reaches the host as one number once the drag settles; the
  // link entry needs a modal box and the clipboard, so it is asserted by its presence
  // rather than fired.
  assert.equal(musicVolume, 'volume=[True],[True],0%[True],25%[True],50%[True],75%[True],100%[True]',
    'the volume submenu hosts its row and keeps the presets under it')
  assert.equal(musicSlider, 'slider=TrackBar:0-100:25:tick=25',
    'the hosted row is a track bar covering the range, at the value in force')
  assert.equal(musicSliderCommit, 'slider-commit=music-volume:55',
    'a moved slider reaches the host as one number')
  assert.equal(musicSliderLabel, 'slider-label=55%', 'and the row shows the value it is on')
  assert.equal(musicPresetCommit, 'preset-commit=music-volume:0',
    'a preset moves the same slider and is written the same way')
  // Shuffled, "next" draws a song rather than stepping to one, and never the song
  // already playing; unshuffled the same two presses walk the list in order. Both are
  // read from the picker, because a probe must not open a file it does not have.
  assert.equal(musicShuffle, 'shuffle=read=on:1,0 changed=True',
    'a shuffled playlist is read from the host and its next song is never the current one')
  assert.equal(musicOrder, 'order=1,0', 'and without shuffle the list is walked in order')
  // Adding and removing links belongs to the settings card, where a text field and a
  // list can be shown; the pet's submenu carries playback and the volume only, so the
  // entry and the label it needed are both gone.
  assert.equal(Object.keys(labels).includes('MusicAddLink'), false,
    'the submenu must offer no way to add a link')
  assert.equal(Object.keys(labels).includes('MusicAddPrompt'), false,
    'and no box to type one in')
  // An ended media only moves the list on when it is the one that opened: a replaced
  // media reports an end of its own, and acting on that would skip a song and start
  // playing one nobody asked for.
  assert.match(selfTest.stdout, /music-ended: opened=True replaced=False empty=False/,
    'only a track that really opened may advance the list when it ends')
  // The pet keeps playing across a restart of DSH, so the pieces that make that work
  // are pinned here: the file the host publishes is read at every open, the library
  // is applied without interrupting the current track, and the state the next start
  // resumes from is stored on the way out.
  assert.match(petSource, /function Update-MusicMenu/, 'the music submenu needs its rebuild step')
  assert.match(petSource, /Read-MusicLibrary|if \(Read-MusicLibrary\)/, 'and it reads the published library')
  assert.match(petSource, /function Apply-MusicLibrary/, 'and applies it without restarting the track')
  assert.match(petSource, /MediaPlayer/, 'the audio itself is played by this process')
  assert.match(petSource, /Save-MusicPlayerState/, 'and what it is playing is stored for the next start')
  assert.match(petSource, /\$SCRIPT:MusicFile = Join-Path/, 'the library file sits beside the state file')
  assert.match(petSource, /Add-PetMenuItem \$menu\.Items \$SCRIPT:Labels\.Music 'music'/,
    'the music submenu hangs off the pet menu')
  assert.match(petSource, /case "music":/, 'the music submenu needs its own icon, like every other entry')
  // A capture lands beside the state file, in the harness home rather than the
  // repository, and its name is what tells two captures in one second apart.
  const shotFile = /shot-file: (.*)/.exec(selfTest.stdout)
  assert.ok(shotFile !== null, 'the self test must report where a capture lands')
  assert.match(shotFile[1].trim(), /shots[\\/]shot-\d{8}-\d{6}-\d{3}\.png$/,
    'a capture lands in shots/ beside the state file')
  // A drag that runs up and to the left selects the same rectangle as one that
  // runs down and to the right, which is what the bitmap is cut with.
  assert.match(selfTest.stdout, /shot-rect: 10,20 20x20/, 'the drag rectangle is rebuilt from its corners')
  // The settings may name the folder captures go to; a blank setting and no
  // setting at all are the same thing, which is the plugin's own directory.
  const shotDirs = /shot-dirs: (.*)/.exec(selfTest.stdout)
  assert.ok(shotDirs !== null, 'the self test must report where a capture would go')
  const [configuredDir, blankDir, missingDir] = shotDirs[1].trim().split(' / ')
  assert.equal(configuredDir, 'C:\\shots', 'a configured folder is used as it is')
  assert.equal(blankDir, missingDir, 'a blank setting and no setting are the same directory')
  assert.equal(blankDir, join(probeDir, 'shots'), 'and both are the plugin\'s own shots directory')
  assert.ok(selfTest.stdout.includes(`build-result: ${join(probeDir, '..', 'build', 'last-build.json')}`),
    'the detached build result is read from the harness home beside little-icon data')
  // A failed open is reported in the pet's own words, which only happens if the
  // reason the host sends is one this mapping knows.
  assert.ok(selfTest.stdout.includes(
    `open-failure: ${labels.OpenCwdNoCwd} / ${labels.OpenCwdNoDir} / ${labels.OpenCwdFailed}`),
  'every reason the host can report must have its own line in the pet')
  // Restarting ends DSH, so the self test reports what it would run instead: the
  // directory the replacement starts in is the application directory quoted in the
  // launcher's command line, and the waiter waits for DSH, waits out its shutdown,
  // and lets cmd expand the variable the command line travels in.
  const relaunchDir = /relaunch-dir: (.*)/.exec(selfTest.stdout)
  assert.ok(relaunchDir !== null, 'the self test must report the relaunch directory')
  assert.equal(relaunchDir[1].trim(), join(root, 'assets'), 'the last quoted directory wins over the executable')
  const relaunchScript = /relaunch-script: (.*)/.exec(selfTest.stdout)
  assert.ok(relaunchScript !== null, 'the self test must report the waiter script')
  assert.match(relaunchScript[1], /Get-Process -Id 4321/)
  assert.match(relaunchScript[1], /Start-Sleep -Seconds 4/, 'the next instance must wait out the shutdown')
  // Without this the replacement is an Electron that boots as Node, because this
  // pet inherits ELECTRON_RUN_AS_NODE=1 from the Host it was started by.
  assert.match(relaunchScript[1], /Remove-Item Env:ELECTRON_RUN_AS_NODE/)
  assert.match(relaunchScript[1], /Set-Location -LiteralPath 'C:\\somewhere'/)
  assert.match(relaunchScript[1], /'\/d','\/s','\/c','%DSH_RELAUNCH_CMD%'/, 'cmd expands the launcher line')
  assert.match(relaunchScript[1], /-WindowStyle Hidden/)
  // Arming is what broke silently in Windows PowerShell (`$env[$name]` cannot be
  // assigned), and it happens before DSH is ended, so the self test reads back the
  // value the waiter's cmd is meant to expand.
  assert.match(selfTest.stdout, /relaunch-variable: relaunch probe/,
    'the command the waiter expands must be readable back out of the environment')
  const buildScript = /build-script: (.*)/.exec(selfTest.stdout)
  assert.ok(buildScript !== null, 'the self test must report the Desktop build script')
  assert.equal(buildScript[1].trim(), join(root, '..', '..', '..', '_mytools', 'build', 'build-desktop.bat'),
    'the running apps/desktop directory must resolve back to this checkout build')
  // A restart from the menu replays the Electron command line rather than going
  // through the launcher, so it has to run the settings merge itself; the same
  // apps/desktop anchor is what finds that tool.
  const settingsSync = /settings-sync: (.*)/.exec(selfTest.stdout)
  assert.ok(settingsSync !== null, 'the self test must report the settings sync script')
  assert.equal(settingsSync[1].trim(), join(root, '..', '..', '..', '_mytools', 'settings', 'sync-settings.mjs'),
    'a checkout whose apps/desktop is running must resolve its settings tool too')

  // The capture itself, taken for real: the sheet is not drawn and nobody drags, so
  // what is left under test is the screen read, the encoder, and the directory. A
  // machine whose screen cannot be read fails here rather than at the first drag.
  const shotDir = mkdtempSync(join(tmpdir(), 'little-icon-shot-'))
  const shotProbe = spawnSync(powershell, [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'pet', 'pet.ps1'),
    '-AssetDir', join(root, 'assets'),
    '-StateFile', join(shotDir, 'state.json'),
    '-PositionFile', join(shotDir, 'position.json'),
    '-ShotProbe',
  ], { encoding: 'utf8' })
  assert.equal(shotProbe.status, 0, `pet.ps1 -ShotProbe failed: ${shotProbe.stderr}`)
  const shotPath = /shot-probe: (.*)/.exec(shotProbe.stdout)
  assert.ok(shotPath !== null, 'the capture probe must report the file it wrote')
  const shotBytes = readFileSync(shotPath[1].trim())
  rmSync(shotDir, { recursive: true, force: true })
  assert.deepEqual([...shotBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'a capture is a PNG')
  // The bitmap is cut to the rectangle it was given: a capture that came back at
  // another size would mean the selection and the shutter disagree about units.
  assert.equal(shotBytes.readUInt32BE(16), 320, 'the capture is as wide as the rectangle it was given')
  assert.equal(shotBytes.readUInt32BE(20), 200, 'the capture is as tall as the rectangle it was given')
  const shotReported = /shot-probe-bytes: (\d+)/.exec(shotProbe.stdout)
  assert.ok(shotReported !== null, 'the capture probe must report the bytes it wrote')
  assert.equal(Number(shotReported[1]), shotBytes.length, 'the reported size is the file that landed')

  // The audio path on its own, with no window, no menu, and no library: what is
  // under test is the media player, the decoder, and one file. A file that is not
  // there must come back as a reported failure rather than as a crash, which is the
  // half of this probe a keyless test can check — whether a sound device exists is
  // the machine's business, and the real file is what the live check plays.
  const musicProbeDir = mkdtempSync(join(tmpdir(), 'little-icon-music-probe-'))
  const musicProbe = spawnSync(powershell, [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'pet', 'pet.ps1'),
    '-AssetDir', join(root, 'assets'),
    '-StateFile', join(musicProbeDir, 'state.json'),
    '-PositionFile', join(musicProbeDir, 'position.json'),
    '-MusicProbe', join(musicProbeDir, 'not-here.m4a'),
  ], { encoding: 'utf8' })
  assert.equal(musicProbe.status, 1, 'a file that is not there must be reported, not played')
  assert.match(musicProbe.stdout, /music-probe: failed error=/, 'and the probe must say so in one line')
  rmSync(musicProbeDir, { recursive: true, force: true })
} else {
  console.log('skipping pet.ps1 -SelfTest: the pet window is Windows-only')
}

// ---- git readers ------------------------------------------------------------

// Real `git status --porcelain=v1 -z` output, one record per shape the list must
// survive: an unstaged edit, a staged add, an unstaged delete, an untracked file,
// and a rename, whose source path rides in the record after its own.
const STATUS_FIXTURE = [
  ' M kept.txt',
  'A  staged new file.txt',
  ' D gone.txt',
  '?? untracked.txt',
  'R  moved-new.txt',
  'moved-old.txt',
  '',
].join('\0')
assert.deepEqual(parseGitStatus(STATUS_FIXTURE), [
  { path: 'kept.txt', status: ' M' },
  { path: 'staged new file.txt', status: 'A ' },
  { path: 'gone.txt', status: ' D' },
  { path: 'untracked.txt', status: '??' },
  { path: 'moved-new.txt', status: 'R ', from: 'moved-old.txt' },
])
assert.deepEqual(parseGitStatus(''), [], 'an empty status is no changes, not one entry')
// A path keeps its own leading space: trimming it would misname the file.
assert.deepEqual(parseGitStatus(' M  spaced name.txt\0'), [{ path: ' spaced name.txt', status: ' M' }])

const FIELD = '\u001f'
const LOG_FIXTURE = [
  `abc${FIELD}abc1234${FIELD}Ada${FIELD}2026-01-02T03:04:05+08:00${FIELD}first subject`,
  `def${FIELD}def5678${FIELD}Bob${FIELD}2026-01-01T00:00:00+00:00${FIELD}second subject`,
  '',
].join('\0')
assert.deepEqual(parseGitLog(LOG_FIXTURE), [
  { hash: 'abc', short: 'abc1234', author: 'Ada', date: '2026-01-02T03:04:05+08:00', subject: 'first subject' },
  { hash: 'def', short: 'def5678', author: 'Bob', date: '2026-01-01T00:00:00+00:00', subject: 'second subject' },
])
assert.deepEqual(parseGitLog(''), [])

// A path that is not a directory and a directory outside every repository are
// different answers: the page says different things about them. Both are cheap,
// so they run even without git.
const missingDir = await readGitRepository(join(tmpdir(), 'little-icon-no-such-directory'))
assert.deepEqual(missingDir, { ok: false, reason: 'no-dir' })
assert.deepEqual(await readGitRemoteStatus(join(tmpdir(), 'little-icon-no-such-directory')),
  { ok: false, reason: 'no-dir' })
// The detail readers answer the same four reasons as the listing, so a page that
// asks about a directory that is gone is told that rather than that Git failed.
assert.deepEqual(await readGitDiff(join(tmpdir(), 'little-icon-no-such-directory'), 'a.txt'),
  { ok: false, reason: 'no-dir' })
assert.deepEqual(await readGitCommit(join(tmpdir(), 'little-icon-no-such-directory'), 'HEAD'),
  { ok: false, reason: 'no-dir' })

// `git diff-tree --name-status -z` records: the status, then the path, and for a
// rename or copy two paths with the source first.
const TREE_FIXTURE = ['M', 'kept.txt', 'A', 'staged.txt', 'D', 'gone.txt',
  'R100', 'old.txt', 'new.txt', 'C075', 'copy-src.txt', 'copy-dst.txt', ''].join('\0')
assert.deepEqual(parseGitCommitFiles(TREE_FIXTURE), [
  { status: 'M', path: 'kept.txt' },
  { status: 'A', path: 'staged.txt' },
  { status: 'D', path: 'gone.txt' },
  { status: 'R100', path: 'new.txt', from: 'old.txt' },
  { status: 'C075', path: 'copy-dst.txt', from: 'copy-src.txt' },
])
// An empty commit wrote no records at all, which is no files rather than one.
assert.deepEqual(parseGitCommitFiles(''), [])

// ---- opening the working directory ------------------------------------------

// The menu's open entry is the mirror of the Git reads: the page names one
// directory and the Host hands it to the file manager. Which directory, and
// whether there is still one to open, is decided before anything is started; the
// file manager itself belongs to the caller, so the smoke test watches the
// hand-off instead of putting an Explorer window on the desktop.
const launched = []
assert.deepEqual(openWorkingDirectory('', path => launched.push(path)),
  { ok: false, reason: 'no-cwd' }, 'a Session with no directory has nothing to open')
const goneDir = join(tmpdir(), 'little-icon-no-such-directory')
assert.deepEqual(openWorkingDirectory(goneDir, path => launched.push(path)),
  { ok: false, reason: 'no-dir' }, 'a directory that is gone is its own answer, not a shell dialog')
const openDir = mkdtempSync(join(tmpdir(), 'little-icon-open-'))
assert.deepEqual(openWorkingDirectory(openDir, path => launched.push(path)),
  { ok: true, path: openDir }, 'an existing directory opens')
assert.deepEqual(launched, [openDir], 'the directory the page named is the one handed over')
assert.deepEqual(openWorkingDirectory(openDir, () => { throw new Error('no shell') }),
  { ok: false, reason: 'failed', message: 'no shell' }, 'a file manager that will not start is reported')
assert.deepEqual(launched, [openDir], 'a refused start hands over nothing')
rmSync(openDir, { recursive: true, force: true })

// The route around that reader, and the state it publishes for the pet. The pet
// is switched off here, so this runs anywhere and leaves no folder window and no
// message box on the desktop of whoever runs the suite — which is why the
// `--pet` run below does not exercise this route at all.
{
  const home = mkdtempSync(join(tmpdir(), 'little-icon-open-host-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const disposers = []
  const routes = []
  const hostCtx = {
    // No `agents`, no `jobs`, no `connection`: all three are optional to this half.
    get: () => undefined,
    logger: { info: () => {}, warn: () => {} },
    on: () => () => {},
    effect: (factory) => { disposers.push(factory()) },
    inject: (_services, callback) => callback({
      effect: (factory) => { disposers.push(factory()) },
      settings: { configure: () => () => {} },
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    }),
  }
  const fixed = (value) => ({ get: () => value })
  const config = {
    enabled: fixed(false), size: fixed(160), translucent: fixed(true), idleOpacity: fixed(0.5),
    frameMs: fixed(600), pollMs: fixed(200), happyMs: fixed(3000), boredEverySeconds: fixed(60),
    boredMs: fixed(5000), sleepAfterSeconds: fixed(600), sleepWhenHiddenSeconds: fixed(20),
    autoHide: fixed(true), autoHideSeconds: fixed(0), topmost: fixed(true), clickAction: fixed('toggle'),
    gitPullTimeoutMs: fixed(60_000), shotDir: fixed(''),
    // One usable row and one the Browser tab cannot open: what reaches the pet is
    // the resolved list, so an unusable row never becomes a menu entry.
    sites: fixed([
      { name: 'Chat', url: 'chat.deepseek.com' },
      { name: 'Local', url: 'file:///C:/notes.txt' },
    ]),
    // Multi-machine would start a process; this stub keeps the run in the loopback
    // address space where the role rule takes the client side, and the link off.
    coopAddress: fixed('192.168.1.3:15180'),
    coopHotkey: fixed('ctrl+alt+f12'),
    coopAutoStart: fixed(false),
  }
  try {
    apply(hostCtx, config)
    const route = routes.find((entry) => entry.path === OPEN_PATH)
    assert.ok(route !== undefined, 'apply() must register the open route')
    const ask = (method, url) => {
      const response = { status: 0, body: '', writeHead(code) { this.status = code }, end(chunk) { this.body = chunk ?? '' } }
      route.handler({ method, url, on: () => {} }, response)
      return response
    }
    // Opening a folder is the one thing here with an effect outside the page, so
    // it is the one surface a re-read must not reach.
    assert.equal(ask('GET', OPEN_PATH).status, 405, 'opening a folder is a POST')
    assert.deepEqual(JSON.parse(ask('POST', OPEN_PATH).body), { ok: false, reason: 'no-cwd' },
      'a Session with no directory is answered, not attempted')
    const goneDir = join(home, 'gone')
    assert.deepEqual(JSON.parse(ask('POST', `${OPEN_PATH}?cwd=${encodeURIComponent(goneDir)}`).body),
      { ok: false, reason: 'no-dir' }, 'a directory that is gone is answered too')
    // The person clicked on the pet, so the pet is what says the folder did not
    // open; the last failure rides in the state file with the timestamp that
    // keeps a pet which already showed it from showing it again.
    const statePath = join(home, 'little-icon', 'state.json')
    const notice = () => JSON.parse(readFileSync(statePath, 'utf8')).notice
    const untilNoticed = Date.now() + 4000
    while (notice() === undefined && Date.now() < untilNoticed) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(notice()?.reason, 'no-dir', 'the failed open must reach the pet')
    assert.ok(typeof notice()?.at === 'number', 'the pet tells a new failure from one it has shown')

    // The menu's site entries travel to the pet in the same file, resolved: the pet
    // draws what it is handed, so a row the Browser tab could not open is not a row
    // it can offer, and a bare host has already become the address to open.
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).sites,
      [{ name: 'Chat', url: 'https://chat.deepseek.com/' }], 'the pet is told the sites it may offer')

    // A chosen entry comes back the other way: the pet writes the command and the
    // address it named, and this half relays both to every listening page. The
    // address is checked here too — a file is a file, whatever wrote it.
    const frames = []
    const ended = []
    const streamRoute = routes.find((entry) => entry.path === COMMANDS_PATH)
    streamRoute.handler({ method: 'GET', url: COMMANDS_PATH, on: () => {} }, {
      writeHead: () => {}, write: (frame) => frames.push(frame), on: () => {},
      end: () => { ended.push(true) },
    })
    assert.equal(frames[0], ': little-icon menu commands\n\n', 'a subscriber hears the stream open')
    const commandPath = join(home, 'little-icon', 'command.json')
    const command = (payload) => writeFileSync(commandPath, `${JSON.stringify(payload)}\n`, 'utf8')
    const untilFramed = async (predicate) => {
      const deadline = Date.now() + 4000
      while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25))
      assert.ok(predicate(), `the command never reached the page: ${frames.join(' | ')}`)
    }
    command({ command: 'site', url: 'https://example.com/docs', at: 1 })
    await untilFramed(() => frames.some((frame) => frame.includes('"site"')))
    assert.deepEqual(frames.filter((frame) => frame.startsWith('data: ')),
      ['data: {"command":"site","url":"https://example.com/docs"}\n\n'],
      'the address the entry named must travel with its command')
    // The same command carrying an address nothing may open arrives without one:
    // the page then has no tab to open rather than one to a refused address.
    command({ command: 'site', url: 'javascript:alert(1)', at: 2 })
    await untilFramed(() => frames.some((frame) => frame.includes('"site"') && !frame.includes('example.com')))
    assert.deepEqual(frames.filter((frame) => frame.startsWith('data: ')).at(-1),
      'data: {"command":"site"}\n\n', 'an address that may not open must not reach the page')
  } finally {
    for (const disposer of disposers.splice(0)) disposer()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
}

if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0) {
  const repo = mkdtempSync(join(tmpdir(), 'little-icon-repo-'))
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  try {
    git('init', '-q')
    git('config', 'user.email', 'smoke@example.test')
    git('config', 'user.name', 'smoke')
    writeFileSync(join(repo, 'kept.txt'), 'one\n')
    git('add', '.')
    git('commit', '-q', '-m', 'first commit')
    writeFileSync(join(repo, 'kept.txt'), 'two\n')
    writeFileSync(join(repo, 'untracked.txt'), 'new\n')
    const read = await readGitRepository(repo)
    assert.equal(read.ok, true)
    assert.equal(read.branch, git('branch', '--show-current').stdout.trim())
    assert.deepEqual(read.changes.map(change => [change.status, change.path]),
      [[' M', 'kept.txt'], ['??', 'untracked.txt']])
    assert.deepEqual(read.commits.map(commit => commit.subject), ['first commit'])
    assert.match(read.commits[0].hash, /^[0-9a-f]{40}$/)
    assert.deepEqual(await readGitRemoteStatus(repo), { ok: false, reason: 'no-upstream' },
      'a local branch without an upstream says that instead of claiming it is current')

    // One file's diff. The reader looks the path's own status up instead of
    // trusting the caller, so an unstaged edit is compared against the index and
    // an untracked file against the null device — `git diff` alone would show
    // nothing for the file the person just added.
    const edited = await readGitDiff(repo, 'kept.txt')
    assert.equal(edited.ok, true, JSON.stringify(edited))
    assert.match(edited.text, /^-one$/m)
    assert.match(edited.text, /^\+two$/m)
    assert.equal(edited.truncated, false)
    const added = await readGitDiff(repo, 'untracked.txt')
    assert.equal(added.ok, true, JSON.stringify(added))
    assert.match(added.text, /^\+new$/m)
    assert.match(added.text, /^--- \/dev\/null$/m)
    // A staged change is compared against the index, which is also what works in
    // a repository whose first commit has not been made yet: `HEAD` would not
    // resolve there.
    writeFileSync(join(repo, 'staged.txt'), 'staged\n')
    git('add', 'staged.txt')
    const staged = await readGitDiff(repo, 'staged.txt')
    assert.equal(staged.ok, true, JSON.stringify(staged))
    assert.match(staged.text, /^\+staged$/m)
    // A path Git has nothing to report about is an empty diff, not a failure:
    // that is also what a refresh sees once the change was committed.
    assert.deepEqual(await readGitDiff(repo, 'committed-elsewhere.txt'),
      { ok: true, text: '', truncated: false })

    // A diff past the cap is cut and says so, rather than being laid out line by
    // line in the page: one generated file can be tens of megabytes.
    const wide = Array.from({ length: 5000 }, (_, index) => `line ${index} ${'x'.repeat(60)}`).join('\n')
    writeFileSync(join(repo, 'wide.txt'), `${wide}\n`)
    git('add', 'wide.txt')
    git('commit', '-q', '-m', 'wide file')
    writeFileSync(join(repo, 'wide.txt'), `${wide.replace(/x/g, 'y')}\n`)
    const capped = await readGitDiff(repo, 'wide.txt')
    assert.equal(capped.ok, true)
    assert.equal(capped.truncated, true, 'a diff past the cap must be reported as cut')
    assert.equal(capped.text.length, GIT_DIFF_MAX_CHARS)

    // One commit's files. The reader asks Git for the commit's parents instead of
    // assuming them: the first commit has none, and `diff-tree` lists nothing at
    // all for it without `--root`.
    const firstHash = git('rev-list', '--max-parents=0', 'HEAD').stdout.trim()
    assert.deepEqual(await readGitCommit(repo, firstHash),
      { ok: true, files: [{ status: 'A', path: 'kept.txt' }] }, 'the first commit is read against the empty tree')
    // Everything staged at the time goes into that commit, so it lists both files.
    assert.deepEqual(await readGitCommit(repo, git('rev-parse', 'HEAD').stdout.trim()),
      { ok: true, files: [{ status: 'A', path: 'staged.txt' }, { status: 'A', path: 'wide.txt' }] })
    // A commit Git does not have is the reader's failure, with Git's own words.
    const unknownCommit = await readGitCommit(repo, 'deadbeef')
    assert.equal(unknownCommit.ok, false)
    assert.equal(unknownCommit.reason, 'failed')
    assert.match(unknownCommit.message, /unknown revision|ambiguous argument/)
    // A rename is one row carrying the path it came from; an empty commit has no
    // files at all, which is an answer rather than a failure. The rename moves a
    // file nothing else has touched, so Git scores it as one.
    writeFileSync(join(repo, 'move-me.txt'), 'move\n')
    git('add', 'move-me.txt')
    git('commit', '-q', '-m', 'add move-me')
    git('mv', 'move-me.txt', 'moved.txt')
    git('commit', '-q', '-m', 'rename it')
    assert.deepEqual(await readGitCommit(repo, git('rev-parse', 'HEAD').stdout.trim()),
      { ok: true, files: [{ status: 'R100', path: 'moved.txt', from: 'move-me.txt' }] })
    git('commit', '-q', '--allow-empty', '-m', 'nothing at all')
    assert.deepEqual(await readGitCommit(repo, git('rev-parse', 'HEAD').stdout.trim()), { ok: true, files: [] })

    // A merge commit is read against its first parent, because `diff-tree` given
    // only the merge itself lists nothing — "the files this commit touched" for a
    // merge is what it brought in. Its own repository keeps the working tree above
    // out of the picture.
    const forked = mkdtempSync(join(tmpdir(), 'little-icon-merge-'))
    try {
      const side = (...args) => spawnSync('git', args, { cwd: forked, encoding: 'utf8' })
      side('init', '-q', '-b', 'main')
      side('config', 'user.email', 'smoke@example.test')
      side('config', 'user.name', 'smoke')
      writeFileSync(join(forked, 'base.txt'), 'base\n')
      side('add', '.')
      side('commit', '-q', '-m', 'base')
      side('checkout', '-q', '-b', 'side')
      writeFileSync(join(forked, 'side.txt'), 'side\n')
      side('add', 'side.txt')
      side('commit', '-q', '-m', 'side work')
      side('checkout', '-q', 'main')
      writeFileSync(join(forked, 'main.txt'), 'main\n')
      side('add', 'main.txt')
      side('commit', '-q', '-m', 'main work')
      side('merge', '-q', '--no-ff', 'side', '-m', 'merge side')
      const merged = await readGitCommit(forked, side('rev-parse', 'HEAD').stdout.trim())
      assert.deepEqual(merged, { ok: true, files: [{ status: 'A', path: 'side.txt' }] },
        'a merge lists what it brought in, not nothing')
    } finally {
      rmSync(forked, { recursive: true, force: true })
    }

    // A repository whose first commit has not been made yet answers with no
    // commits rather than failing: `git log` errors there.
    const empty = mkdtempSync(join(tmpdir(), 'little-icon-unborn-'))
    try {
      spawnSync('git', ['init', '-q'], { cwd: empty })
      const unborn = await readGitRepository(empty)
      assert.equal(unborn.ok, true, `an unborn HEAD is still a repository: ${JSON.stringify(unborn)}`)
      assert.deepEqual(unborn.commits, [])
      assert.equal(unborn.branch !== '', true, 'the branch is known before the first commit')
      assert.deepEqual(await readGitRemoteStatus(empty), { ok: false, reason: 'no-upstream' })
      // The diff reader names no revision either, so a staged file in a repository
      // without a first commit still has a diff to show.
      writeFileSync(join(empty, 'first.txt'), 'first\n')
      spawnSync('git', ['add', 'first.txt'], { cwd: empty })
      const unbornDiff = await readGitDiff(empty, 'first.txt')
      assert.equal(unbornDiff.ok, true, JSON.stringify(unbornDiff))
      assert.match(unbornDiff.text, /^\+first$/m)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }

  // The history column is read a page at a time, and one author at a time. The
  // repository carries one commit more than a page plus a second author whose
  // address is full of regular-expression punctuation, which is the case that
  // tells an escaped `--author` pattern from one Git reads as a quantifier.
  const historyRepo = mkdtempSync(join(tmpdir(), 'little-icon-history-'))
  try {
    const history = (...args) => spawnSync('git', args, { cwd: historyRepo, encoding: 'utf8' })
    history('init', '-q', '-b', 'main')
    history('config', 'user.email', 'first@example.test')
    history('config', 'user.name', 'First Author')
    for (let index = 0; index < GIT_LOG_PAGE + 3; index += 1) {
      writeFileSync(join(historyRepo, `file-${index}.txt`), `${index}\n`)
      history('add', '.')
      history('commit', '-q', '-m', `commit ${index}`)
    }
    writeFileSync(join(historyRepo, 'theirs.txt'), 'theirs\n')
    history('add', 'theirs.txt')
    // `-c` belongs before the subcommand: this commit is written by a second
    // identity, which is what the filter has to tell apart from the first.
    spawnSync('git', ['-c', 'user.name=Second+Author', '-c', 'user.email=second+tag@example.test',
      'commit', '-q', '-m', 'a second author'], { cwd: historyRepo, encoding: 'utf8' })

    const firstPage = await readGitRepository(historyRepo)
    assert.equal(firstPage.ok, true, JSON.stringify(firstPage))
    assert.equal(firstPage.commits.length, GIT_LOG_PAGE, 'the listing carries one page of history')
    assert.equal(firstPage.hasMoreCommits, true, 'and says the history continues past it')
    assert.deepEqual(firstPage.commits[0].subject, 'a second author', 'the newest commit leads the page')
    assert.deepEqual(firstPage.authors.map(author => [author.name, author.email, author.commits]), [
      ['First Author', 'first@example.test', GIT_LOG_PAGE + 3],
      ['Second+Author', 'second+tag@example.test', 1],
    ], 'every author of the history is offered, with how many commits each wrote')
    assert.ok(firstPage.authors.every(author => author.id === `${author.name} <${author.email}>`),
      'the identity the filter matches on is the one Git spells')

    // The second page carries what the first left, and the end of the history
    // says so rather than offering a page that would be empty.
    const secondPage = await readGitCommits(historyRepo, GIT_LOG_PAGE)
    assert.equal(secondPage.ok, true, JSON.stringify(secondPage))
    assert.deepEqual(secondPage.commits.map(commit => commit.subject),
      ['commit 3', 'commit 2', 'commit 1', 'commit 0'],
      'the next page starts where the first stopped')
    assert.equal(secondPage.hasMore, false, 'the last page does not offer another one')
    assert.deepEqual(await readGitCommits(historyRepo, 999),
      { ok: true, root: secondPage.root, commits: [], hasMore: false },
      'past the end is an empty page, which is what scrolling a short history shows')

    // One author's history is that author's rows only, and its pages line up with
    // the filtered list rather than with the whole one.
    const second = firstPage.authors.find(author => author.commits === 1)
    const onlyTheirs = await readGitCommits(historyRepo, 0, second.id)
    assert.deepEqual(onlyTheirs.commits.map(commit => commit.subject), ['a second author'],
      'an address with a plus sign in it is matched literally, not as a quantifier')
    assert.equal(onlyTheirs.hasMore, false)
    const firstAuthor = firstPage.authors.find(author => author.commits === GIT_LOG_PAGE + 3)
    const theirFirstPage = await readGitCommits(historyRepo, 0, firstAuthor.id)
    assert.equal(theirFirstPage.commits.length, GIT_LOG_PAGE)
    assert.equal(theirFirstPage.hasMore, true, 'a filtered history pages like the unfiltered one')
    const theirSecondPage = await readGitCommits(historyRepo, GIT_LOG_PAGE, firstAuthor.id)
    assert.deepEqual(theirSecondPage.commits.map(commit => commit.subject),
      ['commit 2', 'commit 1', 'commit 0'], 'and its last page holds what is left of that author')
    // A pattern nothing matches is an empty page rather than a failure: the
    // column keeps its rows and offers the way back.
    assert.deepEqual(await readGitCommits(historyRepo, 0, 'Nobody <nobody@example.test>'),
      { ok: true, root: secondPage.root, commits: [], hasMore: false })
    // The page routes answer the listing's own reasons before they run Git.
    assert.deepEqual(await readGitCommits(join(tmpdir(), 'little-icon-no-such-directory')),
      { ok: false, reason: 'no-dir' })
  } finally {
    rmSync(historyRepo, { recursive: true, force: true })
  }

  // The filter reads the identity as a fixed string, which is what the address
  // above pins end to end: `+` is a quantifier to `--author`'s own pattern
  // reader. The listing's author rows are parsed without Git for the same reason
  // the other parsers are.
  assert.deepEqual(parseGitAuthors('   12\tAda Lovelace <ada@example.test>\n    3\tNo Address\n'),
    [
      { id: 'Ada Lovelace <ada@example.test>', name: 'Ada Lovelace', email: 'ada@example.test', commits: 12 },
      { id: 'No Address', name: 'No Address', email: '', commits: 3 },
    ])
  assert.deepEqual(parseGitAuthors(''), [], 'a repository with no history offers no authors')

  // A private file:// remote keeps the mutation test keyless and isolated from
  // network state. Two simultaneous page requests join one fast-forward, then a
  // second pull observes that the local branch is already current.
  const pullWorld = mkdtempSync(join(tmpdir(), 'little-icon-pull-'))
  try {
    const remote = join(pullWorld, 'remote.git')
    const upstream = join(pullWorld, 'upstream')
    const local = join(pullWorld, 'local')
    const run = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
    const must = (cwd, ...args) => {
      const outcome = run(cwd, ...args)
      assert.equal(outcome.status, 0, `git ${args.join(' ')} failed: ${outcome.stderr}`)
      return outcome
    }
    must(pullWorld, 'init', '--bare', '-q', '--initial-branch=main', remote)
    must(pullWorld, 'clone', '-q', remote, upstream)
    must(upstream, 'config', 'user.email', 'smoke@example.test')
    must(upstream, 'config', 'user.name', 'smoke')
    writeFileSync(join(upstream, 'shared.txt'), 'one\n')
    must(upstream, 'add', 'shared.txt')
    must(upstream, 'commit', '-q', '-m', 'initial')
    must(upstream, 'push', '-q', '-u', 'origin', 'main')
    must(pullWorld, 'clone', '-q', remote, local)

    writeFileSync(join(upstream, 'shared.txt'), 'two\n')
    must(upstream, 'commit', '-q', '-am', 'remote update')
    must(upstream, 'push', '-q')
    const [behind, joinedBehind] = await Promise.all([
      readGitRemoteStatus(local, 10_000),
      readGitRemoteStatus(local, 10_000),
    ])
    assert.deepEqual(behind, { ok: true, relation: 'behind', ahead: 0, behind: 1 },
      'the status check fetches the current upstream before comparing it')
    assert.deepEqual(joinedBehind, behind, 'simultaneous tabs join one upstream check')
    const [first, joined] = await Promise.all([
      pullGitRepository(local, 10_000),
      pullGitRepository(local, 10_000),
    ])
    assert.equal(first.ok, true, JSON.stringify(first))
    assert.equal(joined.ok, true, JSON.stringify(joined))
    assert.equal(first.updated, true, 'the first pull must move HEAD to the remote commit')
    assert.equal(readFileSync(join(local, 'shared.txt'), 'utf8').replaceAll('\r\n', '\n'), 'two\n',
      'the working tree must receive the remote file')
    assert.equal(must(local, 'rev-parse', 'HEAD').stdout.trim(), must(upstream, 'rev-parse', 'HEAD').stdout.trim())
    const current = await pullGitRepository(local, 10_000)
    assert.equal(current.ok, true, JSON.stringify(current))
    assert.equal(current.updated, false, 'pulling an up-to-date branch must say HEAD did not move')
    assert.deepEqual(await readGitRemoteStatus(local, 10_000),
      { ok: true, relation: 'up-to-date', ahead: 0, behind: 0 })

    // `--ff-only` must leave both local history and the working tree alone once
    // the two sides diverge; fetching the remote ref is allowed, merging is not.
    must(local, 'config', 'user.email', 'smoke@example.test')
    must(local, 'config', 'user.name', 'smoke')
    writeFileSync(join(local, 'local.txt'), 'local\n')
    must(local, 'add', 'local.txt')
    must(local, 'commit', '-q', '-m', 'local update')
    const localHead = must(local, 'rev-parse', 'HEAD').stdout.trim()
    writeFileSync(join(upstream, 'remote.txt'), 'remote\n')
    must(upstream, 'add', 'remote.txt')
    must(upstream, 'commit', '-q', '-m', 'second remote update')
    must(upstream, 'push', '-q')
    assert.deepEqual(await readGitRemoteStatus(local, 10_000),
      { ok: true, relation: 'diverged', ahead: 1, behind: 1 },
      'a diverged branch reports both its local and unpulled commits')
    const diverged = await pullGitRepository(local, 10_000)
    assert.equal(diverged.ok, false)
    assert.equal(diverged.reason, 'failed')
    assert.equal(must(local, 'rev-parse', 'HEAD').stdout.trim(), localHead,
      'a diverged pull must not create a merge commit')
    assert.equal(existsSync(join(local, 'remote.txt')), false, 'a diverged pull must not update the working tree')

    must(local, 'checkout', '-q', '-b', 'local-only')
    assert.deepEqual(await readGitRemoteStatus(local, 10_000), { ok: false, reason: 'no-upstream' })
    assert.deepEqual(await pullGitRepository(local, 10_000), { ok: false, reason: 'no-upstream' })
    must(local, 'checkout', '-q', '--detach', 'main')
    assert.deepEqual(await readGitRemoteStatus(local, 10_000), { ok: false, reason: 'detached-head' })
    assert.deepEqual(await pullGitRepository(local, 10_000), { ok: false, reason: 'detached-head' })
  } finally {
    rmSync(pullWorld, { recursive: true, force: true })
  }

  // Discarding a selection is the one write the Git page performs on the working
  // tree, and what Git says about a path decides which command restores it: a
  // tracked edit goes back to what HEAD holds on both sides, a staged addition
  // and an untracked file are removed, a staged rename puts its old path back,
  // and a path someone else already cleaned is answered rather than acted on.
  const discardRepo = mkdtempSync(join(tmpdir(), 'little-icon-discard-'))
  try {
    const run = (...args) => spawnSync('git', args, { cwd: discardRepo, encoding: 'utf8' })
    const must = (...args) => {
      const outcome = run(...args)
      assert.equal(outcome.status, 0, `git ${args.join(' ')} failed: ${outcome.stderr}`)
      return outcome
    }
    must('init', '-q', '-b', 'main')
    must('config', 'user.email', 'smoke@example.test')
    must('config', 'user.name', 'smoke')
    writeFileSync(join(discardRepo, 'kept.txt'), 'one\n')
    writeFileSync(join(discardRepo, 'both.txt'), 'both\n')
    writeFileSync(join(discardRepo, 'gone.txt'), 'gone\n')
    writeFileSync(join(discardRepo, 'move-me.txt'), 'move\n')
    must('add', '.')
    must('commit', '-q', '-m', 'first commit')
    // One change of each kind, which is what the command is chosen by: an
    // unstaged edit, an edit staged and then edited again, a staged addition, an
    // untracked file, a deletion in the working tree, and a staged rename.
    writeFileSync(join(discardRepo, 'kept.txt'), 'two\n')
    writeFileSync(join(discardRepo, 'both.txt'), 'staged\n')
    must('add', 'both.txt')
    writeFileSync(join(discardRepo, 'both.txt'), 'staged then edited\n')
    writeFileSync(join(discardRepo, 'staged.txt'), 'staged\n')
    must('add', 'staged.txt')
    writeFileSync(join(discardRepo, 'untracked.txt'), 'new\n')
    rmSync(join(discardRepo, 'gone.txt'))
    must('mv', 'move-me.txt', 'moved.txt')
    const statusOf = (listing) => Object.fromEntries(listing.changes.map(change => [change.path, change.status]))
    const before = await readGitRepository(discardRepo)
    assert.equal(before.ok, true, JSON.stringify(before))
    assert.deepEqual(statusOf(before), {
      'both.txt': 'MM', 'gone.txt': ' D', 'kept.txt': ' M',
      'moved.txt': 'R ', 'staged.txt': 'A ', 'untracked.txt': '??',
    }, 'the fixture holds one change of every kind the discard has to answer')

    // An empty selection is refused before Git runs, and a directory that is not
    // a repository answers the listing's own reason.
    assert.deepEqual(await discardGitChanges(discardRepo, []), { ok: false, reason: 'no-paths' })
    assert.deepEqual(await discardGitChanges(join(tmpdir(), 'little-icon-no-such-directory'), [{ path: 'a.txt' }]),
      { ok: false, reason: 'no-dir' })

    const discarded = await discardGitChanges(discardRepo, [
      { path: 'kept.txt' },
      { path: 'both.txt' },
      { path: 'staged.txt' },
      { path: 'untracked.txt' },
      { path: 'gone.txt' },
      { path: 'moved.txt', from: 'move-me.txt' },
      { path: 'never-changed.txt' },
    ])
    assert.equal(discarded.ok, true, JSON.stringify(discarded))
    assert.deepEqual(discarded.discarded,
      ['kept.txt', 'both.txt', 'staged.txt', 'untracked.txt', 'gone.txt', 'moved.txt'],
      'every path the listing still held is discarded, in the order the page named them')
    assert.deepEqual(discarded.clean, ['never-changed.txt'],
      'a path with nothing left to discard is answered, not acted on')
    assert.deepEqual(discarded.changes, [], 'and the answer is the refreshed, now clean listing')
    const content = (name) => readFileSync(join(discardRepo, name), 'utf8').replaceAll('\r\n', '\n')
    assert.equal(content('kept.txt'), 'one\n', 'an edit is restored to what HEAD holds')
    assert.equal(content('both.txt'), 'both\n', 'and so is one that was staged and then edited again')
    assert.equal(existsSync(join(discardRepo, 'staged.txt')), false,
      'a path only the index held is dropped from it and deleted')
    assert.equal(existsSync(join(discardRepo, 'untracked.txt')), false, 'a path Git never tracked is deleted')
    assert.equal(content('gone.txt'), 'gone\n', 'a deletion in the working tree is restored')
    assert.equal(existsSync(join(discardRepo, 'moved.txt')), false, 'a rename is not left behind')
    assert.equal(content('move-me.txt'), 'move\n', 'and its old path is back with what HEAD holds')
    assert.equal(must('status', '--porcelain').stdout, '', 'the repository is as clean as the answer said')

    // A repository whose first commit has not been made yet holds staged
    // additions only, where `HEAD` resolves to nothing: discarding one drops it
    // from the index and deletes the file.
    const unborn = mkdtempSync(join(tmpdir(), 'little-icon-discard-unborn-'))
    try {
      spawnSync('git', ['init', '-q'], { cwd: unborn })
      writeFileSync(join(unborn, 'first.txt'), 'first\n')
      spawnSync('git', ['add', 'first.txt'], { cwd: unborn })
      const dropped = await discardGitChanges(unborn, [{ path: 'first.txt' }])
      assert.equal(dropped.ok, true, JSON.stringify(dropped))
      assert.deepEqual(dropped.discarded, ['first.txt'])
      assert.equal(existsSync(join(unborn, 'first.txt')), false, 'the staged addition is gone')
      assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: unborn, encoding: 'utf8' }).stdout, '')
    } finally {
      rmSync(unborn, { recursive: true, force: true })
    }
  } finally {
    rmSync(discardRepo, { recursive: true, force: true })
  }
  console.log('little-icon smoke: git readers ok')
} else {
  console.log('skipping the real-repository read: no git on PATH')
}

// ---- browser half -----------------------------------------------------------

/** Fake `window.__ModuleLoader__` plus the browser surface the activity ping uses. */
let loadedRecord = null
const windowListeners = new Map()
const documentListeners = new Map()
const pings = []
/** Addresses handed to the system browser, which is where `window.open` lands. */
const externalOpens = []
globalThis.window = {
  __ModuleLoader__: { load: (record) => { loadedRecord = record } },
  addEventListener: (name, handler) => { windowListeners.set(name, handler) },
  removeEventListener: (name) => { windowListeners.delete(name) },
  open: (url, target, features) => { externalOpens.push({ url, target, features }) },
}
globalThis.document = {
  visibilityState: 'visible',
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '' }),
  head: { appendChild() {} },
  addEventListener: (name, handler) => { documentListeners.set(name, handler) },
  removeEventListener: (name) => { documentListeners.delete(name) },
}
globalThis.fetch = (url, init) => {
  // A body is recorded only when the request carried one, so the calls that name
  // their arguments in the query are compared as they always were.
  pings.push({ url, method: init?.method, ...(init?.body === undefined ? {} : { body: init.body }) })
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, root: '/repo', branch: 'main', changes: [], commits: [] }) })
}
/** Event streams the page opens; the test dispatches the Host's frames itself. */
const eventSources = []
globalThis.EventSource = class {
  constructor(url) {
    this.url = url
    this.closed = false
    eventSources.push(this)
  }

  close() { this.closed = true }
}
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  // A component under test may seed the state its load effect would set; with
  // nothing seeded, `useState` returns its initial value as React does.
  useState: (initial) => [seeded.length > 0 ? seeded.shift() : initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
}
const requireStub = (specifier) => {
  if (specifier === 'react') return reactStub
  if (specifier === '@deepseek-ai/dsh-client-store') {
    return { createSnapshotStore: (initial) => {
      let state = initial
      return { getSnapshot: () => state, set: (next) => { state = next }, subscribe: () => () => {} }
    } }
  }
  throw new Error(`client.js required an unexpected module: ${specifier}`)
}

await import(pathToFileURL(join(root, 'client.js')).href)
assert.ok(loadedRecord !== null, 'client.js did not register a factory with __ModuleLoader__')
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
assert.equal(loadedRecord.id, packageName, 'the loader id must equal the package name')

const clientPlugin = loadedRecord.factory(requireStub)
assert.equal(typeof clientPlugin.apply, 'function')

/** Stand-in for the settings form the Host serves for this row. */
const formListeners = new Set()
const form = {
  snapshot: { status: 'ready', writable: true, revision: 7, value: {} },
  writes: [],
  getSnapshot() { return this.snapshot },
  subscribe(listener) { formListeners.add(listener); return () => formListeners.delete(listener) },
  mutate(ops, revision) { this.writes.push({ ops, revision }); return Promise.resolve(true) },
  /** Accept a new Host section, exactly as an accepted write does. */
  accept(value) {
    this.snapshot = { ...this.snapshot, value }
    for (const listener of formListeners) listener()
  },
}
/**
 * The row ui-chat owns. The pet's Chat and Sites entries read its "Open chat links
 * in" preference rather than keeping a copy of it, so the test drives that value
 * here; an absent value is the default the product itself falls back to.
 */
const chatForm = {
  snapshot: { status: 'ready', writable: true, revision: 3, value: {} },
  getSnapshot() { return this.snapshot },
  subscribe() { return () => {} },
  /** Accept a new Host section, as an accepted write on the Chat settings page does. */
  accept(value) { this.snapshot = { ...this.snapshot, value } },
}
const registrations = []
const dictionaries = new Map()
const clientDisposers = []
/** One render's seeded component state, consumed by that render's next `useState`. */
const seeded = []
/** The two optional services the menu commands reach for, plus the calls they make. */
const openedTabs = []
/** Tab types the page registers with the right Sidebar's registry. */
const registeredTypes = []
const clientServices = {
  sidebarRight: { openTab: (kind, options) => { openedTabs.push({ kind, options }) } },
  sidebarRightTabs: {
    register: (definition) => { registeredTypes.push(definition); return () => {} },
    get: (kind) => registeredTypes.find(definition => definition.kind === kind)
      ?? (kind === 'browser' ? { id: 'browser' } : undefined),
  },
}
/** The plugin's context; `inject` hands the same services to an optional dependency's scope. */
const clientCtx = {
  effect: (factory) => { clientDisposers.push(factory()) },
  get: (name) => clientServices[name],
  inject: (_names, callback) => { callback(clientCtx) },
  locale: { register: (ns, dict) => { dictionaries.set(ns, dict) }, bind: (ns) => (key, params) => {
    // The real binding reads the language in force at call time; the test runs in
    // Chinese, which is also how the copy assertions below read it.
    const text = dictionaries.get(ns).zh[key]
    assert.ok(typeof text === 'string', `the page asked for missing copy: ${key}`)
    return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
  } },
  // `get` answers for any row id, which is what lets the menu read the Chat row.
  configForms: { get: (id) => (id === 'ui-chat' ? chatForm : form) },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  // Cordis exposes an injected service as a property of the scope it injected
  // into; the plugin reads the tab registry that way.
  sidebarRightTabs: clientServices.sidebarRightTabs,
}
clientPlugin.apply(clientCtx)
// The plugin registers the settings card and, once the right Sidebar's registry
// is there, the Git page's body; the Git type itself is registered on that
// registry rather than through a slot.
assert.equal(registrations.length, 2, 'the browser half must register the card and the Git body')
const [registration] = registrations.filter(entry => entry.options.name === 'plugins.bundle.config')
const [gitBody] = registrations.filter(entry => entry.options.name === 'sidebar.right.pane.tab')
assert.ok(registration !== undefined && gitBody !== undefined, 'both registrations must be present')
// The card belongs on the bundle's own page: the Plugins list is where a person
// looks, and the row page behind it is one click too deep.
assert.equal(registration.options.name, 'plugins.bundle.config')
assert.equal(registration.options.key, packageName)

// Input reports itself to the Host so the pet can tell "nobody is there" from
// "no task is running"; it is throttled, so a mouse move is not a request.
assert.deepEqual([...windowListeners.keys()].sort(), ['keydown', 'pointerdown', 'pointermove', 'wheel'])
assert.equal(documentListeners.has('visibilitychange'), true)
assert.deepEqual(pings[0], { url: ACTIVITY_PATH, method: 'POST' }, 'the page reports activity when it loads')
windowListeners.get('pointermove')()
assert.equal(pings.length, 1, 'activity pings must be throttled')

// The pet's menu is drawn by another process, so its commands arrive here on a
// Host-held event stream and this half performs them: "chat" opens the DeepSeek
// chat site and "git" opens this plugin's own Git page beside the conversation.
// Where "chat" lands is the person's own chat-link preference; with nobody having
// chosen one it is the in-app Browser tab, which is where a chat link goes too.
assert.equal(eventSources.length, 1, 'the page must listen for menu commands')
assert.equal(eventSources[0].url, COMMANDS_PATH)
const [commands] = eventSources
const warned = []
const realWarn = console.warn
console.warn = (...args) => { warned.push(args.join(' ')) }
try {
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.equal(openedTabs.length, 1, 'the chat command must open one tab')
  assert.deepEqual(openedTabs[0], { kind: 'browser', options: { params: { url: 'https://chat.deepseek.com' } } })
  assert.equal(externalOpens.length, 0, 'the default preference keeps the chat site inside DSH')
  commands.onmessage({ data: '{"command":"git"}' })
  assert.equal(openedTabs.length, 2, 'the git command must open one tab')
  assert.deepEqual(openedTabs[1], { kind: 'little-icon-git', options: undefined },
    'the Git page is page content of this plugin, opened by kind alone')
  // Unknown or malformed frames are ignored rather than thrown at the user.
  commands.onmessage({ data: '{"command":"nonsense"}' })
  commands.onmessage({ data: 'not json' })
  assert.equal(openedTabs.length, 2, 'only known commands open anything')
  // The menu's volume is configuration, and the Host cannot write configuration from
  // its own timer: the settings service refuses a write made inside an HMR transaction.
  // The page writes it instead, at the revision it read, the way the card writes every
  // other field. Links are not in this menu at all: the card owns the list.
  const formBefore = form.snapshot
  form.snapshot = { ...form.snapshot, revision: 7, value: { musicLinks: [firstLink] } }
  form.writes.length = 0
  commands.onmessage({ data: '{"command":"music-volume","value":33}' })
  assert.deepEqual(form.writes[0], { ops: [{ op: 'set', path: ['musicVolume'], value: 33 }], revision: 7 },
    'a volume the menu set is written to the configuration the way the card writes it')
  commands.onmessage({ data: `{"command":"music-add-link","link":"${firstLink}"}` })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(form.writes.length, 1, "a link command is no longer this half's to act on")
  // A frame that names no volume is refused here rather than written as a number
  // nothing can use.
  commands.onmessage({ data: '{"command":"music-volume","value":"loud"}' })
  assert.equal(form.writes.length, 1, 'a volume that is not a number changes nothing')
  // The card's own writes are counted from the first one, so this probe leaves the
  // form as it found it.
  form.snapshot = formBefore
  form.writes.length = 0
  // A Web profile may leave the Browser tab disabled and a build without the right
  // Sidebar provides no service at all. The preference still asked for the in-app
  // tab, so the address goes to the system browser — the same fallback ui-chat's
  // own chat links take — the click says why, and the card stays registered either
  // way.
  clientServices.sidebarRightTabs.get = () => undefined
  commands.onmessage({ data: '{"command":"chat"}' })
  commands.onmessage({ data: '{"command":"git"}' })
  assert.equal(openedTabs.length, 2, 'without a registered type no tab may open')
  assert.deepEqual(externalOpens[0], { url: 'https://chat.deepseek.com', target: '_blank', features: 'noopener,noreferrer' },
    'a missing Browser type hands the address to the system browser')
  clientServices.sidebarRightTabs.get = (kind) => registeredTypes.find(definition => definition.kind === kind)
    ?? (kind === 'browser' ? { id: 'browser' } : undefined)
  clientServices.sidebarRight = undefined
  commands.onmessage({ data: '{"command":"chat"}' })
  commands.onmessage({ data: '{"command":"git"}' })
  assert.equal(openedTabs.length, 2, 'without the Sidebar service no tab may open')
  assert.equal(externalOpens.length, 2, 'a missing Sidebar service falls back the same way')
  // "Settings" is cross-plugin navigation rather than a page of this plugin's own:
  // the card is rendered on the plugin manager's page, so the service that page
  // provides is what selects this bundle, and a build without that page must say
  // so instead of quietly doing nothing.
  const openedBundles = []
  clientServices.pluginNavigation = { openBundle: (name) => { openedBundles.push(name) } }
  commands.onmessage({ data: '{"command":"settings"}' })
  assert.deepEqual(openedBundles, [packageName], 'settings must select this bundle on the Plugins page')
  clientServices.pluginNavigation = undefined
  commands.onmessage({ data: '{"command":"settings"}' })
  assert.deepEqual(openedBundles, [packageName], 'without the Plugins page nothing may be selected')
  // "Aquarium" is the mini-games entry, and the tank belongs to another plugin:
  // the menu names that plugin's service instead of reaching into its overlay, so
  // a profile without it must say so rather than opening a blank screen.
  const openedAquariums = []
  clientServices.aquarium3d = { open: () => { openedAquariums.push('open') } }
  commands.onmessage({ data: '{"command":"aquarium"}' })
  assert.deepEqual(openedAquariums, ['open'], 'the aquarium command must open the other plugin\'s tank')
  clientServices.aquarium3d = undefined
  commands.onmessage({ data: '{"command":"aquarium"}' })
  assert.deepEqual(openedAquariums, ['open'], 'without the aquarium plugin nothing may open')
} finally {
  console.warn = realWarn
  clientServices.sidebarRight = { openTab: (kind, options) => { openedTabs.push({ kind, options }) } }
}
// One unknown command, the retired link command the card now owns, a volume frame
// naming no number, the two refusals above in each of their two forms, the settings
// entry with no Plugins page to reach, and the aquarium entry with no aquarium plugin
// installed.
assert.equal(warned.length, 9, `a command that cannot run must say so: ${warned.join(' | ')}`)

// The "sites" entry is the one menu command that carries its own address: the
// frame names it, and the page opens it where the chat entry would open one. A
// frame with nothing openable opens nothing rather than a blank tab, and an
// address that got past the Host is checked once more here, at the last point
// before a tab is handed it.
const siteWarnings = []
const realSiteWarn = console.warn
console.warn = (...args) => { siteWarnings.push(args.join(' ')) }
try {
  clientServices.sidebarRight = { openTab: (kind, options) => { openedTabs.push({ kind, options }) } }
  const openedBeforeSites = openedTabs.length
  commands.onmessage({ data: '{"command":"site","url":"https://example.com/docs"}' })
  assert.deepEqual(openedTabs.at(-1),
    { kind: 'browser', options: { params: { url: 'https://example.com/docs' } } },
    'the site entry opens the address it named, in the in-app Browser tab')
  assert.equal(externalOpens.length, 2, 'the default preference keeps a site inside DSH')
  // What the Host refuses arrives with no address at all; what it let through can
  // still be unopenable here if the frame was written by something else.
  commands.onmessage({ data: '{"command":"site"}' })
  commands.onmessage({ data: '{"command":"site","url":"javascript:alert(1)"}' })
  commands.onmessage({ data: '{"command":"site","url":"https://user:secret@example.com"}' })
  assert.equal(openedTabs.length, openedBeforeSites + 1, 'an address that may not open opens nothing')
  assert.equal(externalOpens.length, 2, 'an address that may not open reaches no browser either')
  // A Web profile may leave the Browser tab disabled, and a build without the
  // right Sidebar provides no service at all: the address then follows the same
  // fallback the chat entry takes rather than being dropped.
  clientServices.sidebarRight = undefined
  commands.onmessage({ data: '{"command":"site","url":"https://example.com/docs"}' })
  assert.equal(openedTabs.length, openedBeforeSites + 1, 'without the Sidebar service no tab may open')
  assert.deepEqual(externalOpens.at(-1),
    { url: 'https://example.com/docs', target: '_blank', features: 'noopener,noreferrer' },
    'without the Sidebar service the address goes to the system browser')
  // A frame naming a property of Object.prototype is not one of this plugin's
  // entries, however the dispatched table is written.
  commands.onmessage({ data: '{"command":"constructor"}' })
  assert.equal(openedTabs.length, openedBeforeSites + 1, 'an inherited property is not a menu command')
} finally {
  console.warn = realSiteWarn
  clientServices.sidebarRight = { openTab: (kind, options) => { openedTabs.push({ kind, options }) } }
}
assert.equal(siteWarnings.length, 5, `every site entry that could not open must say so: ${siteWarnings.join(' | ')}`)

// "Default Browser" is the other value of the Chat row's preference, and it moves
// both entries at once: the page hands the address to the system browser and opens
// no tab, which is where the Desktop shell's `window.open` handler sends an HTTP(S)
// address. The value is read at the click, so a change on the Chat settings page
// reaches the very next menu choice without a restart.
const preferenceWarnings = []
const realPreferenceWarn = console.warn
console.warn = (...args) => { preferenceWarnings.push(args.join(' ')) }
try {
  chatForm.accept({ linkOpening: 'new-tab' })
  const tabsBeforePreference = openedTabs.length
  const externalBeforePreference = externalOpens.length
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.deepEqual(externalOpens.at(-1),
    { url: 'https://chat.deepseek.com', target: '_blank', features: 'noopener,noreferrer' },
    'the chat entry follows "Default Browser"')
  commands.onmessage({ data: '{"command":"site","url":"https://example.com/docs"}' })
  assert.deepEqual(externalOpens.at(-1),
    { url: 'https://example.com/docs', target: '_blank', features: 'noopener,noreferrer' },
    'the sites entry follows the same preference')
  assert.equal(openedTabs.length, tabsBeforePreference, 'no tab may open while the preference says otherwise')
  assert.equal(externalOpens.length, externalBeforePreference + 2, 'both entries reach the system browser')
  assert.equal(preferenceWarnings.length, 0, 'a build with no in-app tab is not the case here')
  // An unrecognized or missing value is the product's own default, not a third
  // destination: a row whose Chat plugin was never composed keeps the Browser tab.
  chatForm.accept({})
  commands.onmessage({ data: '{"command":"chat"}' })
  assert.equal(openedTabs.length, tabsBeforePreference + 1, 'an absent preference restores the in-app tab')
  assert.equal(externalOpens.length, externalBeforePreference + 2, 'and opens nothing externally')
} finally {
  console.warn = realPreferenceWarn
  chatForm.accept({})
}

// "Open working directory" is the one command this half only names: the folder
// belongs to the Session the main view holds — the same row the shipped
// workspace control opens — and starting a file manager is the Host's, so the
// page sends the directory and leaves the outcome to the pet, which is where the
// click happened. Without a main-view Session there is no directory to send.
const openedFor = (rows) => {
  clientServices.sessions = { list: { getSnapshot: () => ({ byId: rows }) } }
  const before = pings.length
  commands.onmessage({ data: '{"command":"open-cwd"}' })
  return pings[before]
}
assert.deepEqual(openedFor({ s1: { cwd: 'D:\\work\\proj', retainedBy: {} }, s2: { cwd: 'D:\\other', retainedBy: { mainView: 1 } } }),
  { url: `${OPEN_PATH}?cwd=D%3A%5Cother`, method: 'POST' },
  'the directory is the one the main view holds, escaped into the query')
assert.deepEqual(openedFor({ s1: { cwd: 'D:\\work\\proj', retainedBy: {} } }),
  { url: `${OPEN_PATH}?cwd=`, method: 'POST' },
  'no main-view Session means no directory to open, which the Host answers')
delete clientServices.sessions
assert.deepEqual(openedFor({}), { url: `${OPEN_PATH}?cwd=`, method: 'POST' },
  'a build without the sessions service still reaches the Host, which explains itself')
delete clientServices.sessions

// The Git page is a tab type of this plugin's own: the right Sidebar's registry
// carries the type, and its keyed seat carries the body that reads the Host.
assert.equal(registeredTypes.length, 1, 'the page must register exactly one tab type')
const [gitType] = registeredTypes
assert.equal(gitType.id, '@local/dsh-little-icon/git')
assert.equal(gitType.kind, 'little-icon-git')
assert.equal(gitType.title(), 'Git 改动', 'the chip reads the current language')
assert.equal(gitBody.options.key, gitType.id, 'the body registers under the type implementation id')
assert.equal(gitBody.options.locale, 'little-icon')

// The body never reads during render: it asks the Host for one directory and gets
// one JSON object, which is what the injected `load` is. The inject face is built
// for one Session, which is the one its `sendPrompt` addresses.
const gitFace = gitBody.options.inject('session')
const loaded = await gitFace.load('D:\\work\\proj', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_PATH}?cwd=D%3A%5Cwork%5Cproj`, method: undefined },
  'the directory travels as a query parameter, escaped')
assert.equal(loaded.ok, true)
const remoteStatus = await gitFace.loadRemote('D:\\work\\proj', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_REMOTE_PATH}?root=D%3A%5Cwork%5Cproj`, method: 'POST' },
  'the upstream check is an explicit POST naming the repository root')
assert.equal(remoteStatus.ok, true)
const pulled = await gitFace.pull('D:\\work\\proj', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_PULL_PATH}?cwd=D%3A%5Cwork%5Cproj`, method: 'POST' },
  'pull is an explicit POST naming the Session directory')
assert.equal(pulled.ok, true)
// The diff face names the repository root rather than the Session's directory,
// because the path it carries is relative to that root; the commit face is the
// same read for a history row, naming the hash instead of a path.
await gitFace.loadDiff('/repo', 'src/a.ts', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_DIFF_PATH}?root=%2Frepo&path=src%2Fa.ts`, method: undefined },
  'the diff read names the root and one path, both escaped')
await gitFace.loadCommit('/repo', 'abc123', undefined)
assert.deepEqual(pings.at(-1), { url: `${GIT_COMMIT_PATH}?root=%2Frepo&hash=abc123`, method: undefined },
  'the commit read names the root and one hash, both escaped')
// A page of history names the directory rather than the root, so the Host
// resolves the repository exactly as it did for the listing, and the author and
// the offset travel with it.
await gitFace.loadCommits('D:\\work\\proj', 0, '', undefined)
assert.deepEqual(pings.at(-1),
  { url: `${GIT_COMMITS_PATH}?cwd=D%3A%5Cwork%5Cproj&skip=0&author=`, method: undefined },
  'the first page names the directory, and no author')
await gitFace.loadCommits('D:\\work\\proj', 20, 'Ada Lovelace <ada@example.test>', undefined)
assert.deepEqual(pings.at(-1),
  { url: `${GIT_COMMITS_PATH}?cwd=D%3A%5Cwork%5Cproj&skip=20&author=Ada%20Lovelace%20%3Cada%40example.test%3E`, method: undefined },
  'a further page carries the offset and the author identity the Host listed')
// The discard face is the one Git request whose selection travels in the body: a
// list of paths cannot be a query parameter, and a path may hold any punctuation,
// so neither one value nor a joined one would name them. A rename carries both of
// its ends, because the Host restores the old path before removing the new one.
await gitFace.discard('/repo', [{ path: 'src/a.ts' }, { path: 'src/new.ts', from: 'src/old.ts' }], undefined)
assert.deepEqual(pings.at(-1), {
  url: GIT_DISCARD_PATH,
  method: 'POST',
  body: JSON.stringify({ root: '/repo', paths: [{ path: 'src/a.ts' }, { path: 'src/new.ts', from: 'src/old.ts' }] }),
}, 'the selection travels as a JSON body naming the repository and every picked entry')
const answerFetch = globalThis.fetch
globalThis.fetch = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
await assert.rejects(() => gitFace.load('/repo', undefined), /answered 500/)
await assert.rejects(() => gitFace.loadCommits('/repo', 0, '', undefined), /answered 500/)
await assert.rejects(() => gitFace.loadRemote('/repo', undefined), /answered 500/)
await assert.rejects(() => gitFace.loadDiff('/repo', 'a.txt', undefined), /answered 500/)
await assert.rejects(() => gitFace.loadCommit('/repo', 'abc123', undefined), /answered 500/)
await assert.rejects(() => gitFace.pull('/repo', undefined), /answered 500/)
await assert.rejects(() => gitFace.discard('/repo', [{ path: 'a.txt' }], undefined), /answered 500/)
globalThis.fetch = answerFetch

// The button's message is a real user turn: the page goes through the Session's
// own conversation face — the admission the composer uses — and reports what the
// Host said about it.
const sent = []
const reachable = (conversation) => ({
  scope: (id) => (id === 'session' ? { get: (name) => (name === 'conversation' ? conversation : undefined) } : undefined),
})
clientServices.sessions = reachable({ send: async (text) => { sent.push(text) } })
assert.deepEqual(await gitFace.sendPrompt('提交并推送'), { ok: true })
assert.deepEqual(sent, ['提交并推送'], 'the message reaches the conversation verbatim')
// A Session nobody holds has no conversation to put anything in, and an admission
// the Host refuses reports its own message rather than throwing at the button.
clientServices.sessions = { scope: () => undefined }
assert.deepEqual(await gitFace.sendPrompt('提交并推送'), { ok: false, reason: 'no-channel' })
clientServices.sessions = reachable({ send: async () => { throw new Error('inbox full') } })
assert.deepEqual(await gitFace.sendPrompt('提交并推送'), { ok: false, reason: 'failed', message: 'inbox full' })
clientServices.sessions = reachable({ send: async (text) => { sent.push(text) } })

const dictionary = dictionaries.get('little-icon')
assert.ok(dictionary?.zh !== undefined && dictionary?.en !== undefined, 'missing locale dictionaries')
assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.zh).sort(),
  'the English and Chinese dictionaries must cover the same keys')

/** Translate through the Chinese dictionary, failing on a key the page asks for but nobody wrote. */
const t = (key, params) => {
  const text = dictionary.zh[key]
  assert.ok(typeof text === 'string', `the page asked for missing copy: ${key}`)
  return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
}

/**
 * Every element in a rendered stub tree. Controls travel as props (`control`),
 * so props are walked too rather than only children.
 */
const flatten = (node, found = []) => {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, found)
    return found
  }
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (node.type !== undefined) found.push(node)
  for (const value of Object.values(node.props ?? {})) flatten(value, found)
  flatten(node.children, found)
  return found
}

const face = registration.options.inject()
/** The framework binds `use<Name>` hooks from the inject face's hooks compartment. */
const usePetSettings = (selector) => selector(face.hooks.petSettings.getSnapshot())
/** Directories the stub picker answers with, in order; an empty queue is a cancel. */
const picks = []
const render = (value) => {
  form.accept(value)
  return registration.component({
    t,
    view: 'page',
    usePetSettings,
    write: face.write,
    pickDirectory: () => Promise.resolve(picks.length === 0 ? null : picks.shift()),
  })
}

const summary = registration.component({ t, view: 'summary' })
assert.equal(summary.type, 'span')
assert.deepEqual(summary.children, [t('summary')], 'the summary view returns the one-liner')

const elements = flatten(render(undefined))
const sizeSlider = elements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.ok(sizeSlider !== undefined, 'the size slider is missing')
assert.equal(sizeSlider.props.max, 320)
assert.equal(sizeSlider.props.value, 160, 'the size slider must start from the schema default')
const translucent = elements.find(node => node.type === 'input' && node.props.type === 'checkbox' && node.props.checked === true)
assert.ok(translucent !== undefined, 'the translucency switch is missing')
const opacitySlider = elements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0.15)
assert.ok(opacitySlider !== undefined, 'the translucency degree slider is missing')
assert.notEqual(opacitySlider.props.disabled, true, 'the degree slider is enabled while translucency is on')

// With translucency off the degree slider follows.
const offElements = flatten(render({ translucent: false }))
const offSlider = offElements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0.15)
assert.equal(offSlider.props.disabled, true, 'the degree slider must be disabled while translucency is off')

// The auto-tuck switch starts on, and its delay is editable only while it is.
const tuckRow = elements.find(node => node.props?.label === t('autoHide'))
assert.ok(tuckRow !== undefined, 'the auto-tuck switch is missing')
assert.equal(tuckRow.props.control.props.checked, true, 'the auto-tuck switch is on by default')
const tuckSecondsRow = elements.find(node => node.props?.label === t('autoHideSeconds'))
assert.ok(tuckSecondsRow !== undefined, 'the auto-tuck delay is missing')
assert.equal(tuckSecondsRow.props.control.props.value, 0, 'DSH is tucked away as soon as it goes behind by default')
const noTuck = flatten(render({ autoHide: false }))
assert.equal(noTuck.find(node => node.props?.label === t('autoHideSeconds')).props.disabled, true,
  'the auto-tuck delay must be disabled while the switch is off')

// Controls start from the accepted Host section, not from the defaults.
const stored = flatten(render({ size: 240, translucent: false, clickAction: 'minimize', autoHideSeconds: 90 }))
const storedSlider = stored.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 96)
assert.equal(storedSlider.props.value, 240, 'the card must show the stored size')
assert.equal(stored.find(node => node.type === 'select').props.value, 'minimize', 'the card must show the stored click action')
assert.equal(stored.find(node => node.props?.label === t('autoHideSeconds')).props.control.props.value, 90,
  'the card must show the stored auto-tuck delay')

// A switch writes at once; a drag merges into one write. Both reach the form
// with the revision it was read at.
face.write({ translucent: false }, true)
assert.deepEqual(form.writes[0], { ops: [{ op: 'set', path: ['translucent'], value: false }], revision: 7 })
face.write({ size: 200 }, false)
face.write({ size: 208 }, false)
await new Promise((resolve) => setTimeout(resolve, 400))
assert.equal(form.writes.length, 2, 'a slider drag must merge into one write')
assert.deepEqual(form.writes[1].ops, [{ op: 'set', path: ['size'], value: 208 }])

// The screenshot folder is a path, not a slider: typing echoes locally and the
// setting is written once the field is left, so a path being spelled out is not
// one profile write per keystroke. The picker writes the folder it answered with,
// and a cancelled one changes nothing.
const shotElements = flatten(render({ shotDir: 'D:\\shots' }))
const shotField = shotElements.find(node => node.type === 'input' && node.props.type === 'text'
  && node.props.placeholder === t('shotDirPlaceholder'))
assert.ok(shotField !== undefined, 'the screenshot folder field is missing')
assert.equal(shotField.props.value, 'D:\\shots', 'the card must show the stored screenshot folder')
const writesBeforeTyping = form.writes.length
shotField.props.onChange({ target: { value: 'E:\\pics' } })
assert.equal(form.writes.length, writesBeforeTyping, 'typing a path must not write per keystroke')
shotField.props.onBlur({ target: { value: '  E:\\pics  ' } })
assert.deepEqual(form.writes.at(-1).ops, [{ op: 'set', path: ['shotDir'], value: 'E:\\pics' }],
  'leaving the field writes the trimmed path')
assert.equal(form.writes.at(-1).revision, 7, 'and it reaches the form at the revision it was read at')
const browseButton = shotElements.find(node => node.type === 'button' && node.children?.includes(t('shotDirBrowse')))
assert.ok(browseButton !== undefined, 'the folder-picking button is missing')
assert.deepEqual(browseButton.children, [t('shotDirBrowse')], 'the button carries its own label')
picks.push('F:\\picked')
await browseButton.props.onClick()
assert.deepEqual(form.writes.at(-1).ops, [{ op: 'set', path: ['shotDir'], value: 'F:\\picked' }],
  'choosing a folder stores it')
const writesAfterPicking = form.writes.length
await browseButton.props.onClick()
assert.equal(form.writes.length, writesAfterPicking, 'a cancelled picker changes nothing')

// The sites list is a list of records rather than one value, and the Host owns the
// whole array: an add, a remove, and an edited box all write the complete list, in
// the order the menu will show it. Typing echoes locally for the same reason a path
// does — one profile write per keystroke is one YAML line rewritten per character.
const noSites = flatten(render(undefined))
assert.equal(noSites.filter(node => node.props?.placeholder === t('siteNotePlaceholder')).length, 0,
  'a list nobody filled in has no rows')
assert.ok(noSites.some(node => node.type === 'button' && node.children?.includes(t('siteAdd'))),
  'and it still offers the way to add one')

const siteElements = flatten(render({
  sites: [{ name: 'Chat', url: 'chat.deepseek.com' }, { name: '', url: '' }],
}))
const noteBoxes = siteElements.filter(node => node.props?.placeholder === t('siteNotePlaceholder'))
const addressBoxes = siteElements.filter(node => node.props?.placeholder === t('siteAddressPlaceholder'))
assert.equal(noteBoxes.length, 2, 'one note box per configured site')
assert.equal(addressBoxes.length, 2, 'one address box per configured site')
assert.equal(noteBoxes[0].props.value, 'Chat', 'the card must show the stored note')
assert.equal(addressBoxes[0].props.value, 'chat.deepseek.com', 'the card must show the stored address')
assert.equal(noteBoxes[1].props.value, '', 'an empty row stays empty rather than being filled in for the person')

const writesBeforeSites = form.writes.length
addressBoxes[0].props.onChange({ target: { value: 'example.com/docs' } })
assert.equal(form.writes.length, writesBeforeSites, 'typing an address must not write per keystroke')
addressBoxes[0].props.onBlur({ target: { value: '  example.com/docs  ' } })
assert.deepEqual(form.writes.at(-1).ops, [{ op: 'set', path: ['sites'], value: [
  { name: 'Chat', url: 'example.com/docs' },
  { name: '', url: '' },
] }], 'leaving the box writes the trimmed address, with every other row as it was')
noteBoxes[0].props.onBlur({ target: { value: '  DeepSeek  ' } })
assert.deepEqual(form.writes.at(-1).ops[0].value[0], { name: 'DeepSeek', url: 'chat.deepseek.com' },
  'the note box writes the list too, and leaves the addresses alone')

const addSiteButton = siteElements.find(node => node.type === 'button' && node.children?.includes(t('siteAdd')))
assert.ok(addSiteButton !== undefined, 'the add button is missing')
addSiteButton.props.onClick()
assert.deepEqual(form.writes.at(-1).ops[0].value, [
  { name: 'Chat', url: 'chat.deepseek.com' }, { name: '', url: '' }, { name: '', url: '' },
], 'adding appends one empty row for the person to fill in')
const removeSiteButtons = siteElements.filter(node => node.type === 'button' && node.children?.includes(t('siteRemove')))
assert.equal(removeSiteButtons.length, 2, 'every row carries its own remove button')
removeSiteButtons[0].props.onClick()
assert.deepEqual(form.writes.at(-1).ops[0].value, [{ name: '', url: '' }],
  'removing drops exactly the row whose button was pressed')

// An address the Host would refuse is said on the row: the entry is simply absent
// from the menu, and a person who typed `file:///…` would otherwise be left
// wondering where it went.
const siteProblems = (value) => flatten(render({ sites: value }))
  .filter(node => node.type === 'div' && node.props?.className === 'dli-site-problem')
assert.deepEqual(siteProblems([{ name: 'Local', url: 'file:///C:/notes.txt' }]).map(node => node.children),
  [[t('siteBadAddress')]], 'a refused address is named on its own row')
assert.equal(siteProblems([{ name: 'ok', url: 'ok.test' }, { name: 'blank', url: '' }]).length, 0,
  'a usable address, and a row nobody filled in yet, are both left alone')

// The card's settings are grouped: nineteen rows in one column read as one setting each,
// so every group is named by a heading with a hairline above it, in the order a person
// reads them. The advanced group keeps its own collapsible summary instead.
const pageNodes = flatten(render({ musicLinks: ['BV1'] }))
assert.deepEqual(pageNodes
  .filter(node => node.props?.className === 'dli-section')
  .map(node => node.children[0].children[0].children[0]),
[t('groupPet'), t('groupSites'), t('groupMusic'), t('groupLook'), t('groupBehavior'), t('groupShot'), t('groupCoop')],
'the card names each group of settings')
assert.ok(pageNodes.some(node => node.props?.className === 'dli-details'),
  'and the advanced group is still a group of its own')

// ---- music section of the card ----------------------------------------------
//
// The section is a component of its own, so the card test above never runs it; it is
// called here with the props the card passes. Its rows come from the form (a link
// added or removed shows at once) and their state comes from the Host (downloaded
// means the file is on this machine), and every action that touches audio, the
// network, or a file goes through a route rather than through the page.
/** Every string a stub tree shows, including control props such as `title`. */
const strings = (node, found = []) => {
  if (typeof node === 'string') { found.push(node); return found }
  if (Array.isArray(node)) { for (const child of node) strings(child, found); return found }
  if (node === null || typeof node !== 'object') return found
  for (const value of Object.values(node.props ?? {})) strings(value, found)
  strings(node.children, found)
  return found
}
const musicSectionType = flatten(render({ musicLinks: ['BV1'] }))
  .find(node => typeof node.type === 'function' && node.props?.slider !== undefined)?.type
assert.equal(typeof musicSectionType, 'function', 'the card must render the music section')

const musicWrites = []
const musicFetches = []
const musicAnswers = []
const answeredFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  musicFetches.push({ url: String(url), method: options?.method ?? 'GET' })
  const answer = musicAnswers.length > 0 ? musicAnswers.shift() : { ok: true }
  return { ok: true, json: async () => answer }
}
/** One render of the section with the Host's answer and the form seeded, as above. */
const renderMusic = (library, draft, extra = {}) => {
  // In the order the component reads them: the library, the busy flag, its message,
  // the read error, the box being typed in, and which sets are unfolded.
  seeded.push(library, extra.busy ?? '', extra.message ?? '', extra.libraryError ?? '', extra.link ?? '', extra.openSets ?? {})
  return flatten(musicSectionType({
    t,
    editable: extra.editable ?? true,
    draft,
    write: (patch, immediate) => musicWrites.push({ patch, immediate }),
    slider: (field) => ({ className: 'dli-slider', type: 'range', value: draft[field] }),
    pickDirectory: () => Promise.resolve(null),
    echo: () => {},
  }))
}

const sampleLibrary = {
  dir: 'D:\\audio',
  warning: '',
  volume: 40,
  sync: { running: false, done: 0, total: 0, current: '', added: 0, failed: [] },
  player: { playing: false, id: '', title: '', positionMs: 0, error: '' },
  entries: [
    { link: 'BV1', id: 'BV1', state: 'ready', title: 'Song One', owner: 'Uploader', durationMs: 1000, size: 10 },
    { link: 'BV2', id: 'BV2', state: 'missing', title: '', owner: '', durationMs: 0, size: 0 },
  ],
  extras: [{ link: 'BV9', id: 'BV9', state: 'ready', title: 'Orphan', owner: '', durationMs: 0, size: 0 }],
  missing: 1,
}

// The volume and the folder are config fields like any other, so they are written
// the way the rest of the card writes them: the slider through the field writer, the
// path once the box is left, and the picker with what it answered.
const musicElements = renderMusic(sampleLibrary, { musicLinks: ['BV1', 'BV2'], musicDir: '', musicVolume: 40 })
const volumeSlider = musicElements.find(node => node.type === 'input' && node.props.type === 'range' && node.props.min === 0 && node.props.max === 100)
assert.ok(volumeSlider !== undefined, 'the volume slider is missing')
assert.equal(volumeSlider.props.value, 40, 'the slider starts from the stored volume')
const musicDirField = musicElements.find(node => node.type === 'input' && node.props.type === 'text'
  && node.props.placeholder === t('musicDirPlaceholder'))
assert.ok(musicDirField !== undefined, 'the music folder field is missing')
const writesBeforeMusicDir = musicWrites.length
musicDirField.props.onChange({ target: { value: 'E:\\songs' } })
assert.equal(musicWrites.length, writesBeforeMusicDir, 'typing a folder must not write per keystroke')
musicDirField.props.onBlur({ target: { value: '  E:\\songs  ' } })
assert.deepEqual(musicWrites.at(-1), { patch: { musicDir: 'E:\\songs' }, immediate: true },
  'leaving the folder box writes the trimmed path')

// One row per link, in the configured order, each named by its title when this
// machine has it and by the link when it does not; the state is the Host's answer.
const musicRows = musicElements.filter(node => node.props?.className === 'dli-music-row')
const rowText = (row) => row.children.map(child => child.children?.join('') ?? '')
assert.equal(musicRows.length, 3, 'one row per link, plus the file that has no link')
assert.deepEqual(rowText(musicRows[0]), ['Song One', t('musicReady'), t('musicRemove')],
  'a downloaded link shows its title, its state, and its remove button')
assert.deepEqual(rowText(musicRows[1]), ['BV2', t('musicMissing'), t('musicRemove')],
  'a link with no file is named by the link and reported as missing')
assert.deepEqual(rowText(musicRows[2]), ['Orphan', t('musicReady'), t('musicExtrasRemove')],
  'a file without a link is listed apart from the links')

// The transport buttons ask the pet, which is the half that owns the audio.
musicFetches.length = 0
await musicElements.filter(node => node.type === 'button' && node.children?.includes(t('musicNext')))[0].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 20))
/** The requests that are not the card re-reading the library, which every action also does. */
const askedUrls = () => musicFetches.filter(call => call.url !== MUSIC_PATH).map(call => call.url)
assert.deepEqual(askedUrls(), [`${MUSIC_COMMAND_PATH}?action=next`],
  'the next button asks the pet to step')
assert.equal(musicFetches.find(call => call.url !== MUSIC_PATH).method, 'POST')

// Removing a link writes the list without it and deletes this machine's file.
musicWrites.length = 0
musicFetches.length = 0
await musicRows[0].children.find(node => node.type === 'button').props.onClick()
assert.deepEqual(musicWrites.at(-1).patch, { musicLinks: ['BV2'] }, 'removing drops exactly that link')
assert.deepEqual(askedUrls(), [`${MUSIC_REMOVE_PATH}?id=BV1`],
  'and deletes the file the link names')

// A file no link claims is removed by its own id and leaves the link list alone, and
// a library that could not be read at all says that instead of an action's message.
musicWrites.length = 0
musicFetches.length = 0
await musicRows[2].children.find(node => node.type === 'button').props.onClick()
assert.deepEqual(musicWrites, [], 'removing a file that no link claims does not touch the link list')
assert.deepEqual(askedUrls(), [`${MUSIC_REMOVE_PATH}?id=BV9`], 'it deletes the file by its own id')
assert.ok(strings(renderMusic(sampleLibrary, { musicLinks: [] }, { libraryError: 'Failed to fetch' }))
  .includes(t('musicReadFailed', { message: 'Failed to fetch' })),
'a card that never read the library says so, with the reason')

// Adding a link asks the Host what it stands for first, writes the list, and then
// downloads it — one song here, because this link turned out to be one.
musicWrites.length = 0
musicFetches.length = 0
musicAnswers.push({ ok: true, title: 'Set', links: ['https://b23.tv/xyz'], fresh: ['https://b23.tv/xyz'], total: 1, known: 0 })
musicAnswers.push({ ok: true, id: 'BV3', title: 'Song Three' })
const addElements = renderMusic(sampleLibrary, { musicLinks: ['BV1', 'BV2'] }, { link: '  https://b23.tv/xyz  ' })
addElements.find(node => node.type === 'button' && node.children?.includes(t('musicAdd'))).props.onClick()
await new Promise((resolve) => setTimeout(resolve, 50))
assert.deepEqual(musicWrites.at(-1).patch, { musicLinks: ['BV1', 'BV2', 'https://b23.tv/xyz'] },
  'adding appends the trimmed link')
assert.deepEqual(askedUrls(), [
  `${MUSIC_EXPAND_PATH}?url=${encodeURIComponent('https://b23.tv/xyz')}`,
  `${MUSIC_DOWNLOAD_PATH}?url=${encodeURIComponent('https://b23.tv/xyz')}`,
], "so the link is resolved first and the one song it names is downloaded, because the file is this machine's")

// A link that stands for a set — a multi-part video, or a collection — is added whole
// and fetched by nobody yet: a hundred songs are one paste, and the fill-in button is
// what starts those downloads.
musicWrites.length = 0
musicFetches.length = 0
const setLink = 'https://www.bilibili.com/video/BV1BDk2YCEHF'
musicAnswers.push({ ok: true, title: 'Set', links: [setLink, `${setLink}?p=2`], fresh: [setLink, `${setLink}?p=2`], total: 2, known: 0 })
const setElements = renderMusic(sampleLibrary, { musicLinks: ['BV1', 'BV2'] }, { link: setLink })
setElements.find(node => node.type === 'button' && node.children?.includes(t('musicAdd'))).props.onClick()
await new Promise((resolve) => setTimeout(resolve, 50))
assert.deepEqual(musicWrites.at(-1).patch, { musicLinks: ['BV1', 'BV2', setLink, `${setLink}?p=2`] },
  'every part of the set joins the list in one write')
assert.deepEqual(askedUrls(), [
  `${MUSIC_EXPAND_PATH}?url=${encodeURIComponent(setLink)}`,
  `${MUSIC_ADDED_PATH}?count=2`,
], 'nothing is downloaded yet, and the pet is told how many songs arrived')

// Long lists stay readable: the parts of one video are folded into the set they came
// from — one line with how many songs it holds and how many are here — and its songs
// are behind the toggle. A single song is left as the line it always was.
const setLibrary = {
  ...sampleLibrary,
  // The files no link claims are covered above; here the list holds links only, so the
  // line count is the links' own.
  extras: [],
  entries: [
    { link: 'BV1', id: 'BV1', state: 'ready', title: '专辑 - 一', owner: 'up', durationMs: 1000, size: 10 },
    { link: 'BV1?p=2', id: 'BV1-p2', state: 'missing', title: '专辑 - 二', owner: 'up', durationMs: 0, size: 0 },
    { link: 'BV2', id: 'BV2', state: 'missing', title: '', owner: '', durationMs: 0, size: 0 },
  ],
}
const setLinks = { musicLinks: ['BV1', 'BV1?p=2', 'BV2'] }
const folded = renderMusic(setLibrary, setLinks)
const setLine = folded.find(node => node.props?.className === 'dli-music-set')
assert.ok(setLine !== undefined, 'a set of two songs is drawn as a set')
assert.equal(folded.filter(node => node.props?.className === 'dli-music-row').length, 2,
  'the set is one line and the single song is the other')
assert.equal(folded.some(node => node.props?.className === 'dli-music-row-child'), false,
  'a folded set shows none of its songs')
const setText = strings(setLine)
assert.ok(setText.includes('专辑'), 'the set is named by its own title, not by a part')
assert.ok(setText.includes(t('musicSetCount', { count: 2, ready: 1 })), 'and says how much of it is here')
assert.ok(setText.includes(t('musicSetOpen')), 'and offers to open it')

// Open, its songs are the rows they always were — and the set's own button drops all of
// them in one configuration write and one Host request, rather than a hundred.
musicWrites.length = 0
musicFetches.length = 0
const opened = renderMusic(setLibrary, setLinks, { openSets: { BV1: true } })
assert.equal(opened.filter(node => node.props?.className?.includes('dli-music-row-child')).length, 2,
  'an open set shows its songs')
const openText = strings(opened.find(node => node.props?.className === 'dli-music-set'))
assert.ok(openText.includes(t('musicSetClose')), 'and offers to fold it again')
await opened.find(node => node.props?.className === 'dli-music-set-buttons')
  .children.find(node => node.type === 'button' && strings(node).includes(t('musicSetRemoveFiles', { count: 1 })))
  .props.onClick()
await new Promise((resolve) => setTimeout(resolve, 20))
assert.deepEqual(musicWrites.at(-1).patch, { musicLinks: ['BV2'] },
  'removing a set drops every link of it')
assert.deepEqual(askedUrls(), [`${MUSIC_REMOVE_PATH}?ids=${encodeURIComponent('BV1,BV1-p2')}`],
  "and deletes this machine's files for the set in one request")

// The size this exists for: what one pasted link can bring is a hundred and fifty
// songs, and the card still shows one line for them.
const manyEntries = Array.from({ length: 150 }, (_row, index) => ({
  link: index === 0 ? 'BVbig' : `BVbig?p=${index + 1}`,
  id: index === 0 ? 'BVbig' : `BVbig-p${index + 1}`,
  state: 'missing', title: `专辑 - ${index + 1}`, owner: 'up', durationMs: 0, size: 0,
}))
const manyFolded = renderMusic({ ...sampleLibrary, extras: [], entries: manyEntries },
  { musicLinks: manyEntries.map(row => row.link) })
assert.equal(manyFolded.filter(node => node.props?.className === 'dli-music-row').length, 1,
  'a hundred and fifty parts of one video are one line')
assert.ok(strings(manyFolded).includes(t('musicSetCount', { count: 150, ready: 0 })),
  'and the line says how many songs the set holds and how many are here')

// The playlist picker and the shuffle switch: the picker offers All and one entry per
// playlist with its size, and each control writes through the form like every field.
const setupElements = renderMusic(sampleLibrary, { musicLinks: ['BV1', 'BV2'], musicPlaylist: '', musicShuffle: false })
const picker = setupElements.find(node => node.type === 'select')
assert.ok(picker !== undefined, 'the playlist picker is missing')
assert.equal(picker.props.value, '', 'it starts on All')
const pickerOptions = picker.children.flat()
assert.deepEqual(pickerOptions.map(option => option.props.value), ['', 'BV1', 'BV2'],
  'and offers All plus one entry per playlist')
assert.deepEqual(pickerOptions.map(option => option.children[0]), [
  t('musicPlaylistAll', { count: 2 }),
  t('musicPlaylistOption', { title: 'Song One', count: 1 }),
  t('musicPlaylistOption', { title: 'BV2', count: 1 }),
])
const shuffleBox = setupElements.find(node => node.type === 'input' && node.props.type === 'checkbox')
assert.ok(shuffleBox !== undefined, 'the shuffle switch is missing')
assert.equal(shuffleBox.props.checked, false, 'and starts unticked')
musicWrites.length = 0
picker.props.onChange({ target: { value: 'BV1' } })
assert.deepEqual(musicWrites.at(-1), { patch: { musicPlaylist: 'BV1' }, immediate: true },
  'picking a playlist writes it at once')
shuffleBox.props.onChange({ target: { checked: true } })
assert.deepEqual(musicWrites.at(-1), { patch: { musicShuffle: true }, immediate: true },
  'and ticking shuffle writes that')
// A selection whose playlist is no longer in the list shows All rather than a stale name,
// which is the same fallback the Host makes when it publishes the pet's list.
const staleElements = renderMusic(sampleLibrary, { musicLinks: ['BV1', 'BV2'], musicPlaylist: 'BVgone' })
assert.equal(staleElements.find(node => node.type === 'select').props.value, '',
  'a playlist that is gone falls back to All')

// A link that is already configured is refused without a request, and the one-click
// fill-in is offered only while something is missing.
musicFetches.length = 0
const duplicateElements = renderMusic(sampleLibrary, { musicLinks: ['BV1', 'BV2'] }, { link: 'BV1' })
duplicateElements.find(node => node.type === 'button' && node.children?.includes(t('musicAdd'))).props.onClick()
await new Promise((resolve) => setTimeout(resolve, 20))
assert.deepEqual(askedUrls(), [], 'a link already in the list is refused without asking the Host')
musicFetches.length = 0
await duplicateElements.find(node => node.type === 'button'
  && node.children?.includes(t('musicSync', { count: 1 }))).props.onClick()
assert.deepEqual(askedUrls(), [MUSIC_SYNC_PATH], 'the fill-in button asks the Host to sync')
assert.equal(musicFetches.find(call => call.url !== MUSIC_PATH).method, 'POST')

// A download in flight is reported as progress, and the button that started it is
// not offered again; what the pet is playing is the pet's own report.
const syncingElements = renderMusic({
  ...sampleLibrary,
  sync: { running: true, done: 2, total: 5, current: 'BV4', added: 1, failed: [] },
  player: { playing: true, id: 'BV1', title: 'Song One', positionMs: 1000, error: '' },
}, { musicLinks: ['BV1', 'BV2'] })
const syncButton = syncingElements.find(node => node.type === 'button'
  && node.children?.includes(t('musicSyncing', { done: 2, total: 5 })))
assert.ok(syncButton !== undefined, 'a running download is shown as its own progress')
assert.equal(syncButton.props.disabled, true, 'and it cannot be started twice')
assert.equal(syncingElements.find(node => node.type === 'button' && node.children?.includes(t('musicAdd'))).props.disabled,
  true, 'and nothing may be added while it owns the library')
assert.ok(strings(syncingElements).includes(t('musicPlaying', { title: 'Song One' })),
  'what the pet is playing comes from the pet')

// A folder inside the checkout, or one that cannot be written, is said on the card
// rather than obeyed: those files would be committed, and that download would fail.
assert.ok(strings(renderMusic({ ...sampleLibrary, warning: 'inside-checkout' }, { musicLinks: [] }))
  .includes(t('musicWarnInsideCheckout')), 'a folder inside the repository is reported')
assert.ok(strings(renderMusic({ ...sampleLibrary, warning: 'unwritable' }, { musicLinks: [] }))
  .includes(t('musicWarnUnwritable')), 'a folder that cannot be written is reported too')
globalThis.fetch = answeredFetch

// The Git page draws two columns from one Host answer. The load effect normally
// sets that answer; the test seeds it instead, so only the render is under test.
const commitPages = []
const discardRequests = []
/** A refusal a test wants the next discard to answer with, instead of the refreshed listing. */
let discardRefusal
const gitProps = {
  t,
  sessionId: 'session',
  useSessions: (select) => select({ byId: { session: { cwd: '/repo' } } }),
  useTabInfo: () => ({ tab: { navigation: { revision: 1 } } }),
  load: () => Promise.resolve({}),
  loadCommits: (cwd, skip, author) => {
    commitPages.push({ cwd, skip, author })
    return Promise.resolve({ ok: true, commits: [], hasMore: false })
  },
  loadRemote: () => Promise.resolve({}),
  pull: async (cwd) => { pullRequests.push(cwd); return { ...listing, updated: true } },
  discard: async (root, entries) => {
    discardRequests.push({ root, entries })
    return discardRefusal ?? {
      ...listing,
      changes: listing.changes.filter((change) => !entries.some((entry) => entry.path === change.path)),
      discarded: entries.map((entry) => entry.path),
      clean: [],
    }
  },
  loadDiff: () => Promise.resolve({}),
  loadCommit: () => Promise.resolve({}),
  sendPrompt: gitFace.sendPrompt,
}
const pullRequests = []
/** One render's seeded component state, consumed by the next `useState` call. */
const gitRender = () => {
  const view = gitBody.component(gitProps)
  const nodes = strings(view)
  return { view, nodes, section: flatten(view).filter(node => node.type === 'section').length }
}

/** The listing every seeded render below starts from. */
const listing = {
  ok: true,
  root: '/repo',
  branch: 'main',
  changes: [
    { path: 'src/a.ts', status: ' M' },
    { path: 'src/b.ts', status: 'A ' },
    { path: 'new file.txt', status: '??' },
    { path: 'src/old.ts', status: 'R ', from: 'src/older.ts' },
  ],
  commits: [{ hash: 'abc', short: 'abc1234', author: 'Ada', date: '2026-01-02T03:04:05+08:00', subject: 'first subject' }],
}
seeded.push({
  phase: 'settled',
  result: listing,
  remote: { phase: 'settled', result: { ok: true, relation: 'behind', ahead: 0, behind: 2 } },
})
const populated = gitRender()
assert.equal(populated.section, 2, 'the page is one column of changes beside one column of commits')
for (const text of [t('gitChanges'), t('gitCommits'), t('gitBranch', { name: 'main' }), t('gitRefresh'),
  t('gitPull'), t('gitRemoteBehind', { count: 2 }), t('gitModified'), t('gitAdded'), t('gitUntracked'),
  t('gitRenamed'), t('gitStaged'),
  'src/a.ts', 'new file.txt', 'abc1234', 'first subject']) {
  assert.ok(populated.nodes.includes(text), `the Git page must show ${text}`)
}
assert.equal(populated.nodes.filter(text => text === t('gitStaged')).length, 2,
  'the staged add and the staged rename carry the marker; the unstaged edit and the untracked file do not')
const remoteBadge = flatten(populated.view).find(node => node.props?.className === 'dli-git-remote')
assert.equal(remoteBadge.children[0], t('gitRemoteBehind', { count: 2 }),
  'the recent-commits heading says how many commits are waiting upstream')
assert.equal(remoteBadge.props['data-tone'], 'warn', 'unpulled commits use the warning treatment')

const renderRemote = (remote) => {
  seeded.push({ phase: 'settled', result: listing, remote })
  return gitRender()
}
const currentRemote = renderRemote({
  phase: 'settled', result: { ok: true, relation: 'up-to-date', ahead: 0, behind: 0 },
})
assert.ok(currentRemote.nodes.includes(t('gitRemoteCurrent')), 'a current branch says it is up to date')
const divergedRemote = renderRemote({
  phase: 'settled', result: { ok: true, relation: 'diverged', ahead: 1, behind: 3 },
})
assert.ok(divergedRemote.nodes.includes(t('gitRemoteDiverged', { count: 3 })),
  'a diverged branch still names the commits waiting upstream')
const noUpstream = renderRemote({ phase: 'settled', result: { ok: false, reason: 'no-upstream' } })
assert.ok(noUpstream.nodes.includes(t('gitRemoteNoUpstream')), 'a branch without an upstream does not claim freshness')

// A changed file opens its own diff, which is the one thing on this page a click
// does; the tooltip has to say so, since nothing about a row looks clickable.
const changeRow = flatten(populated.view).find(node => node.props?.className === 'dli-git-row')
assert.equal(typeof changeRow.props.onDoubleClick, 'function', 'a changed file opens its diff on a double-click')
assert.equal(changeRow.props.title, `src/a.ts\n${t('gitDiffHint')}`,
  'the row names the path it stands for and what a double-click does')
assert.equal(flatten(populated.view).filter(node => node.props?.className === 'dli-git-row').length, 4,
  'every changed file row opens a diff, not just the first')

// One commit reads top to bottom: the message, the number it names, then who
// wrote it and when. The message leads because it is what the reader scans for.
const commit = flatten(populated.view).find(node => node.props?.className === 'dli-git-commit')
assert.deepEqual(commit.children.map(line => line.props.className),
  ['dli-git-subject', 'dli-git-hash', 'dli-git-byline'])
assert.equal(commit.children[0].children[0], 'first subject')
assert.equal(commit.children[1].children[0], 'abc1234')
assert.equal(commit.children[2].children[0], `Ada · ${new Date('2026-01-02T03:04:05+08:00').toLocaleString()}`)
// A history row opens its own file list the same way a change row opens its diff.
assert.equal(typeof commit.props.onDoubleClick, 'function', 'a commit opens its files on a double-click')
assert.equal(commit.props.title, `first subject\n${t('gitCommitHint')}`,
  'the row says what a double-click does, and keeps the subject as its tooltip')

// The history column is one page of many: the listing says whether the rest
// continues, and the row at the end of the list is both what the scrollport
// watches and the way a pointer asks for the next page directly.
const paged = (extra) => {
  seeded.push({
    phase: 'settled',
    result: { ...listing, ...extra },
    remote: { phase: 'settled', result: { ok: true, relation: 'up-to-date', ahead: 0, behind: 0 } },
  })
  return gitRender()
}
const continuing = paged({ hasMoreCommits: true })
const moreButton = flatten(continuing.view).find(node => node.props?.className === 'dli-git-more-button')
assert.equal(moreButton.children[0], t('gitMore'), 'a history that continues offers the next page')
commitPages.length = 0
moreButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(commitPages, [{ cwd: '/repo', skip: 1, author: '' }],
  'the next page starts after the rows already on screen')
const ended = paged({ hasMoreCommits: false })
assert.ok(ended.nodes.includes(t('gitCommits')), 'the history column is still drawn')
assert.equal(flatten(ended.view).some(node => node.props?.className === 'dli-git-more'), false,
  'a history that ended keeps no way to ask for more')

// The author filter is the list of identities the Host read from this history.
// Choosing one reads that author's first page, not the next page of the list on
// screen: the filtered column is a different list.
const authors = [
  { id: 'Ada <ada@example.test>', name: 'Ada', email: 'ada@example.test', commits: 12 },
  { id: 'Bob <bob@example.test>', name: 'Bob', email: 'bob@example.test', commits: 3 },
]
const authorSelect = flatten(paged({ authors }).view).find(node => node.props?.className === 'dli-git-author')
const authorOptions = flatten(authorSelect).filter(node => node.type === 'option')
assert.equal(authorSelect.props.value, '', 'the column starts on every author')
assert.equal(authorSelect.props['aria-label'], t('gitAuthorFilter'), 'the control names what it filters by')
assert.deepEqual(authorOptions.map(option => option.children[0]),
  [t('gitAuthorAll'), t('gitAuthorOption', { name: 'Ada', count: 12 }), t('gitAuthorOption', { name: 'Bob', count: 3 })],
  'every author of the history is offered, with how many commits each wrote')
assert.deepEqual(authorOptions.slice(1).map(option => option.props.value), authors.map(author => author.id),
  'the identity Git spelled is what the filter sends back')
assert.equal(authorOptions[1].props.title, 'Ada <ada@example.test>',
  'the address rides the tooltip, which is what tells two people with one name apart')
commitPages.length = 0
authorSelect.props.onChange({ target: { value: authors[1].id } })
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(commitPages, [{ cwd: '/repo', skip: 0, author: authors[1].id }],
  'choosing an author reads that author from the top of their own history')
const unfiltered = paged({ authors: [] })
assert.equal(flatten(unfiltered.view).some(node => node.props?.className === 'dli-git-author'), false,
  'a history with no authors carries no filter to offer')
assert.ok(unfiltered.nodes.includes(t('gitCommits')), 'and the history column is drawn without it')

// The page carries the one action that writes something: it puts "commit and
// push" in the conversation and lets the agent do it. Clicking sends that text
// through the same face the composer uses — nothing in the page touches Git.
const sendButton = flatten(populated.view).find(node => node.props?.className === 'dli-git-send')
assert.equal(sendButton.children[0], t('gitCommitAndPush'), 'the button keeps its short label')
assert.notEqual(sendButton.props.disabled, true, 'a readable repository offers the button')
sent.length = 0
sendButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(sent, ['审查本地改动，没有问题就提交并推送吧'],
  'clicking the button sends the review and conditional push instruction into the conversation')
const pullButton = flatten(populated.view).find(node => node.props?.className === 'dli-git-pull')
assert.equal(pullButton.children[0], t('gitPull'), 'the pull button names its direct Git action')
assert.notEqual(pullButton.props.disabled, true, 'a readable repository can pull')
pullButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(pullRequests, ['/repo'], 'pull uses the current Session repository')

// The changes column is the one part of this page that acts on several rows at
// once: the heading's Select button turns the boxes on, a row (or the box in the
// heading) picks it, and "discard" restores the picked ones. The selection mode,
// the picked set, and the discard line are seeded here, because the stub's
// setters are no-ops: what is under test is what a render draws from the state
// the page can be in, in the order the component reads its own state.
const renderPicked = (pickedPaths, discard, picking) => {
  seeded.push(
    { phase: 'settled', result: listing, remote: { phase: 'settled', result: { ok: true, relation: 'up-to-date', behind: 0 } } },
    0, { phase: 'idle' }, { phase: 'idle' }, undefined,
    '', { author: '', list: undefined, more: false, phase: 'idle' }, 0,
    new Set(pickedPaths), discard, picking,
  )
  return gitRender()
}
const pickBoxes = (view) => flatten(view).filter(node => typeof node.props?.className === 'string'
  && node.props.className.split(' ').includes('dli-git-pick'))
const discardControl = (view) => flatten(view).find(node => node.props?.className === 'dli-git-discard')
const selectControl = (view) => flatten(view).find(node => node.props?.className === 'dli-git-select')

// The column is a plain listing until somebody asks otherwise: no row carries a
// box, the heading carries the one way in, and nothing about discarding is on
// screen — an invisible selection would be a trap, so a row click picks nothing
// here either.
const notPicking = renderPicked([], { phase: 'idle' }, false)
assert.equal(selectControl(notPicking.view).children[0], t('gitSelect'),
  'the changes heading offers the way into selection mode')
assert.equal(pickBoxes(notPicking.view).length, 0, 'and no box is drawn before it is used')
assert.equal(discardControl(notPicking.view), undefined, 'nor is the action that needs a selection')
const unpickedRow = flatten(notPicking.view).filter(node => node.props?.className === 'dli-git-row')[0]
assert.equal(unpickedRow.props.onClick, undefined, 'a row click picks nothing while the boxes are off')
assert.equal(typeof unpickedRow.props.onDoubleClick, 'function', 'and a double-click still opens the diff')

// In selection mode every row carries its box, none of them picked yet: the row
// under the heading holds the box that picks them all, the action is offered but
// disabled, and nothing has been asked until it is used.
const unpicked = renderPicked([], { phase: 'idle' }, true)
const allBox = pickBoxes(unpicked.view).find(node => node.props.className.includes('dli-git-pick-all'))
assert.ok(allBox !== undefined, 'selection mode puts the pick-everything box under the heading')
assert.equal(allBox.props.checked, false, 'which is off while no row is picked')
assert.equal(allBox.props['aria-label'], t('gitPickAll'), 'and names itself')
assert.equal(pickBoxes(unpicked.view).length, listing.changes.length + 1,
  'every changed row gets a box of its own, beside the heading one')
assert.equal(discardControl(unpicked.view).children[0], t('gitDiscard'),
  'with nothing picked the control names the action alone')
assert.equal(discardControl(unpicked.view).props.disabled, true, 'and cannot be used')
assert.equal(selectControl(unpicked.view).children[0], t('gitSelectExit'),
  'the way back out of selection mode is beside it')
assert.equal(flatten(unpicked.view).some(node => node.props?.className === 'dli-git-confirm'), false,
  'nothing is asked before the control is used')
const allPicked = renderPicked(listing.changes.map(change => change.path), { phase: 'idle' }, true)
assert.equal(pickBoxes(allPicked.view).find(node => node.props.className.includes('dli-git-pick-all')).props.checked,
  true, 'picking every row turns the heading box on')

// Picked rows are marked and counted, and the confirmation names how many are
// about to go: this is the one action here that cannot be undone, so it asks
// with a line of its own rather than acting on the first click.
const twoPicked = renderPicked(['src/a.ts', 'src/old.ts'], { phase: 'confirm' }, true)
const pickedRows = flatten(twoPicked.view).filter(node => node.props?.className === 'dli-git-row')
assert.deepEqual(pickedRows.map(row => row.props['data-picked'] ?? 'false'), ['true', 'false', 'false', 'true'],
  'only the picked rows carry the picked marker')
assert.deepEqual(pickedRows.map(row => row.children[0].props.checked), [true, false, false, true],
  'and every row carries its own box')
assert.equal(pickedRows[0].children[0].props['aria-label'], t('gitPickFile', { path: 'src/a.ts' }),
  'a box names the row it picks, for a reader that cannot see the row')
assert.equal(discardControl(twoPicked.view).children[0], t('gitDiscardCount', { count: 2 }),
  'the control counts what it would discard')
const confirm = flatten(twoPicked.view).find(node => node.props?.className === 'dli-git-confirm')
assert.ok(confirm !== undefined, 'the confirmation stands under the toolbar')
assert.equal(confirm.children[0].children[0], t('gitDiscardConfirm', { count: 2 }),
  'and it says how many changes are about to be lost')
assert.equal(confirm.children[1].children[0], t('gitDiscardYes'), 'the first button performs it')
assert.equal(confirm.children[2].children[0], t('gitDiscardCancel'), 'the second one backs out')

// Confirming sends exactly the picked entries, a rename carrying both of its ends
// so the Host can put the old path back before removing the new one.
discardRequests.length = 0
await confirm.children[1].props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(discardRequests, [{
  root: '/repo',
  entries: [{ path: 'src/a.ts' }, { path: 'src/old.ts', from: 'src/older.ts' }],
}], 'the picked entries travel to the Host, named by the repository root')

// The line reports the outcome instead of the question once the Host has
// answered, and a refusal says why in the Host's own words.
const done = renderPicked([], { phase: 'done', count: 2, clean: 1 }, false)
assert.ok(strings(done.view).includes(`${t('gitDiscarded', { count: 2 })}${t('gitDiscardedClean', { count: 1 })}`),
  'a finished discard says how many changes went, and how many had nothing left to discard')
assert.equal(discardControl(done.view), undefined,
  'and the column is back to its plain listing, since the action is done')
const refusedDiscard = renderPicked(['src/a.ts'], {
  phase: 'failed', result: { ok: false, reason: 'failed', message: 'index.lock exists' },
}, true)
assert.ok(strings(refusedDiscard.view).includes(t('gitDiscardFailed', { message: 'index.lock exists' })),
  'a refused discard reports the reason the Host gave')
const unreadableDiscard = renderPicked(['src/a.ts'], { phase: 'failed', result: { ok: false, reason: 'no-git' } }, true)
assert.ok(strings(unreadableDiscard.view).includes(t('gitNoGit')),
  'a repository that cannot be read reuses the listing explanations')
const discarding = renderPicked(['src/a.ts'], { phase: 'discarding' }, true)
assert.ok(strings(discarding.view).includes(t('gitDiscarding')), 'a discard in flight says so')
assert.equal(discardControl(discarding.view).props.disabled, true, 'and cannot be started a second time')

// Each refusal has its own line, and the page names no repository in any of them.
for (const [reason, copy] of [['not-a-repo', t('gitNotARepo')], ['no-git', t('gitNoGit')],
  ['no-dir', t('gitNoDir')], ['no-cwd', t('gitNoCwd')]]) {
  seeded.push({ phase: 'settled', result: { ok: false, reason } })
  const refused = gitRender()
  assert.equal(refused.section, 0, `${reason} must show no columns`)
  assert.ok(refused.nodes.includes(copy), `${reason} must explain itself`)
  assert.equal(flatten(refused.view).find(node => node.props?.className === 'dli-git-send').props.disabled, true,
    `${reason} must not offer to commit and push`)
}
// An empty repository is a normal answer: two columns, both saying they are empty.
seeded.push({ phase: 'settled', result: { ok: true, root: '/repo', branch: '', changes: [], commits: [] } })
const empty = gitRender()
assert.equal(empty.section, 2)
assert.ok(empty.nodes.includes(t('gitEmptyChanges')) && empty.nodes.includes(t('gitEmptyCommits')))

// One row's detail takes both columns' room: it is the same question about one
// subject, and the back button is the only way between the two views.
const openDetail = (state) => {
  seeded.push({ phase: 'settled', result: listing }, 0, { phase: 'idle' }, { phase: 'idle' }, state)
  return gitRender()
}
const openDiff = (state) => openDetail({ kind: 'diff', ...state })
const openCommit = (state) => openDetail({ kind: 'commit', commit: listing.commits[0], ...state })
const diffing = openDiff({
  phase: 'settled',
  root: '/repo',
  path: 'src/a.ts',
  status: ' M',
  result: {
    ok: true,
    text: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n',
    truncated: false,
  },
})
assert.equal(diffing.section, 1, 'the diff replaces both columns rather than joining them')
assert.ok(!diffing.nodes.includes(t('gitCommits')), 'the commit column is gone while a diff is open')
assert.ok(!diffing.nodes.includes(t('gitChanges')), 'so is the change column')
for (const text of ['src/a.ts', t('gitModified'), t('gitDiffBack'), '@@ -1 +1 @@', '-old', '+new']) {
  assert.ok(diffing.nodes.includes(text), `the diff view must show ${text}`)
}
const backButton = flatten(diffing.view).find(node => node.props?.className === 'dli-git-detail-back')
assert.equal(backButton.children[0], t('gitDiffBack'), 'the back button names itself')
assert.equal(typeof backButton.props.onClick, 'function', 'and it is the way back to the listing')
// Each line is colored by what it is; the two file headers start with the same
// characters as an added and a removed line, so they are read as headers.
const diffTextLines = (view) => flatten(view).filter(node => typeof node.props?.className === 'string'
  && node.props.className.split(' ')[0] === 'dli-git-diff-line')
const drawn = diffTextLines(diffing.view)
assert.deepEqual(drawn.map(node => node.props.className.replace('dli-git-diff-line dli-git-diff-', '')),
  ['meta', 'meta', 'meta', 'hunk', 'del', 'add'], 'every diff line carries its own tone')
assert.deepEqual(drawn.map(node => node.children[0]),
  ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-old', '+new'])

// A file with nothing to show, a cut diff, and a read that failed each say so
// where the diff would be; none of them falls back to the columns.
const nothing = openDiff({ phase: 'settled', root: '/repo', path: 'src/a.ts', status: ' M',
  result: { ok: true, text: '', truncated: false } })
assert.ok(nothing.nodes.includes(t('gitDiffEmpty')), 'an empty diff explains itself')
const cut = openDiff({ phase: 'settled', root: '/repo', path: 'src/a.ts', status: ' M',
  result: { ok: true, text: '+new\n', truncated: true } })
assert.ok(cut.nodes.includes(t('gitDiffTruncated')), 'a cut diff says it is cut')
assert.deepEqual(diffTextLines(cut.view).map(node => node.children[0]), [t('gitDiffTruncated'), '+new'],
  'the note is the first line of the diff it belongs to')
const refusedDiff = openDiff({ phase: 'settled', root: '/repo', path: 'src/a.ts', status: ' M',
  result: { ok: false, reason: 'no-git' } })
assert.ok(refusedDiff.nodes.includes(t('gitNoGit')), 'a refused read reuses the listing explanations')
const brokenDiff = openDiff({ phase: 'failed', path: 'src/a.ts', error: new Error('offline') })
assert.ok(brokenDiff.nodes.includes(t('gitFailed', { message: 'offline' })))
const readingDiff = openDiff({ phase: 'loading', path: 'src/a.ts' })
assert.ok(readingDiff.nodes.includes(t('gitDiffLoading')))
assert.equal(flatten(readingDiff.view).some(node => node.props?.className === 'dli-git-diff-body'), false,
  'nothing is laid out before the diff arrives')

// A commit's detail is its own file list: the message leads the header, the count
// and the hash it names sit beside it, and each file is a row with the status
// word the listing uses for the same letter.
const commitFiles = [
  { status: 'M', path: 'src/a.ts' },
  { status: 'A', path: 'src/b.ts' },
  { status: 'D', path: 'gone.ts' },
  { status: 'R100', path: 'src/new.ts', from: 'src/old.ts' },
]
const files = openCommit({ phase: 'settled', root: '/repo', hash: 'abc', result: { ok: true, files: commitFiles } })
assert.equal(files.section, 1, "the commit's files replace both columns")
assert.ok(!files.nodes.includes(t('gitChanges')) && !files.nodes.includes(t('gitCommits')),
  'neither column is left behind')
for (const text of ['first subject', 'abc1234', t('gitCommitFiles', { count: 4 }),
  t('gitModified'), t('gitAdded'), t('gitDeleted'), t('gitRenamed'),
  'src/a.ts', 'src/b.ts', 'gone.ts', 'src/new.ts', '← src/old.ts']) {
  assert.ok(files.nodes.includes(text), `the commit view must show ${text}`)
}
assert.equal(flatten(files.view).find(node => node.props?.className === 'dli-git-detail-back').children[0],
  t('gitDiffBack'), 'the same back button returns from a commit')
// A rename is one row rather than two: the path it has now, and the one it came from.
const renamedRow = flatten(files.view).filter(node => node.props?.className === 'dli-git-row').at(-1)
assert.deepEqual(renamedRow.children.map(child => child.props.className),
  ['dli-git-badge dli-git-badge-moved', 'dli-git-path', 'dli-git-from'])
assert.equal(renamedRow.children[2].children[0], '← src/old.ts')
const commitRows = flatten(files.view).filter(node => node.props?.className === 'dli-git-row')
assert.deepEqual(commitRows.map(row => row.children[1].children[0]), commitFiles.map(file => file.path),
  'one row per file, in the order Git listed them')

// A commit with no files, a merge read that failed, and the read still in flight
// each say so in the commit's own place.
const noFiles = openCommit({ phase: 'settled', root: '/repo', hash: 'abc', result: { ok: true, files: [] } })
assert.ok(noFiles.nodes.includes(t('gitCommitEmpty')), 'a commit with no files says so')
const refusedCommit = openCommit({ phase: 'settled', root: '/repo', hash: 'abc',
  result: { ok: false, reason: 'not-a-repo' } })
assert.ok(refusedCommit.nodes.includes(t('gitNotARepo')), 'a refused commit read reuses the listing explanations')
const brokenCommit = openCommit({ phase: 'failed', hash: 'abc', error: new Error('offline') })
assert.ok(brokenCommit.nodes.includes(t('gitFailed', { message: 'offline' })))
const readingCommit = openCommit({ phase: 'loading', hash: 'abc' })
assert.ok(readingCommit.nodes.includes(t('gitCommitLoading')))
assert.ok(!readingCommit.nodes.includes(t('gitCommitFiles', { count: 0 })),
  'no count is shown before the files arrive')

// A transport failure is the page's own, not the repository's.
seeded.push({ phase: 'failed', error: new Error('offline') })
assert.ok(gitRender().nodes.includes(t('gitFailed', { message: 'offline' })))
// Nothing seeded is the state a freshly opened tab starts in, where the button
// has no repository to speak about yet.
const loading = gitRender()
assert.ok(loading.nodes.includes(t('gitLoading')))
assert.equal(flatten(loading.view).find(node => node.props?.className === 'dli-git-send').props.disabled, true,
  'a read still in flight must not offer to commit and push')

// Registrations are effects: disposing the plugin's contributions closes the
// stream it opened, so a reloaded page never leaves a listener on the Host.
for (const dispose of clientDisposers) { if (typeof dispose === 'function') dispose() }
assert.equal(commands.closed, true, 'disposal must close the command stream')

console.log('little-icon smoke: browser half ok')

// ---- host half: one link, a whole set ---------------------------------------
//
// The pet's menu and the card hand the Host one pasted link and ask what it stands
// for; the Host reads Bilibili and answers every link it means, which of those the
// settings do not already hold, and how many songs arrived when the page adds them.
// These run by default: neither needs a pet window, and the Bilibili answer is a
// fetch double, so no test reaches the network.
{
  const home = mkdtempSync(join(tmpdir(), 'little-icon-expand-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const answeredFetch = globalThis.fetch
  // One video of three parts, as `view` answers it. No test reaches the network.
  const threeParts = {
    code: 0,
    data: {
      title: '合集', cid: 1, owner: { name: 'up' }, duration: 10,
      pages: [
        { cid: 1, page: 1, part: '一', duration: 10 },
        { cid: 2, page: 2, part: '二', duration: 10 },
        { cid: 3, page: 3, part: '三', duration: 10 },
      ],
    },
  }
  /** Mount the host half with one `musicLinks` value and hand back its route answers. */
  const mount = async (musicLinks, options = {}) => {
    const disposers = []
    const routes = []
    const fixed = (value) => ({ get: () => value })
    const context = {
      get: () => undefined,
      logger: { info: () => {}, warn: () => {} },
      on: () => () => {},
      effect: (factory) => { disposers.push(factory()) },
      inject: (_services, callback) => callback({
        effect: (factory) => { disposers.push(factory()) },
        settings: { configure: () => () => {} },
        webServer: { register: (route) => { routes.push(route); return () => {} } },
      }),
    }
    const refs = {
      enabled: fixed(false), size: fixed(160), translucent: fixed(true), idleOpacity: fixed(0.5),
      frameMs: fixed(600), pollMs: fixed(200), happyMs: fixed(3_000), boredEverySeconds: fixed(60),
      boredMs: fixed(60_000), sleepAfterSeconds: fixed(600), tuckWhenBehind: fixed(false),
      shotDir: fixed(''), clickAction: fixed('toggle'), sites: fixed([]),
      coopAddress: fixed(''), coopHotkey: fixed(''), coopAutoStart: fixed(false),
      musicLinks: fixed(musicLinks), musicDir: fixed(''), musicVolume: fixed(70),
      musicPlaylist: fixed(options.playlist ?? ''), musicShuffle: fixed(options.shuffle ?? false),
    }
    // A field this test does not name is read as unset rather than missing: the sample
    // only needs the settings the routes and the publisher touch.
    const config = new Proxy(refs, { get: (target, key) => target[key] ?? fixed(undefined) })
    globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(threeParts) })
    await apply(context, config)
    return {
      answer: (path, query) => new Promise((resolve) => {
        const route = routes.find((row) => row.path === path)
        assert.ok(route !== undefined, `the Host must register ${path}`)
        route.handler({ method: 'POST', url: `${path}?${query}`, on: () => {} }, {
          writeHead: () => {},
          write: () => {},
          end: (body) => resolve(typeof body === 'string' ? JSON.parse(body) : body),
        })
      }),
      /**
       * One request whose body travels in chunks and then ends, the way a real
       * one does; the handler subscribes before this emits, so the body is
       * delivered to the reader that is waiting for it.
       * @param path - the route to call.
       * @param method - the request method.
       * @param payload - the JSON body, or undefined for a request that carries none.
       * @returns the route's answer body.
       */
      answerBody: (path, method, payload) => new Promise((resolve) => {
        const route = routes.find((row) => row.path === path)
        assert.ok(route !== undefined, `the Host must register ${path}`)
        const listeners = new Map()
        route.handler({ method, url: path, on: (name, handler) => { listeners.set(name, handler) } }, {
          writeHead: () => {},
          write: () => {},
          end: (body) => resolve(body === undefined ? undefined : JSON.parse(body)),
        })
        if (payload === undefined) return
        listeners.get('data')?.(Buffer.from(JSON.stringify(payload), 'utf8'))
        listeners.get('end')?.()
      }),
      dispose: () => { for (const disposer of disposers.splice(0)) disposer() },
    }
  }
  const link = 'https://www.bilibili.com/video/BV1GJ411x7h7'
  try {
    const empty = await mount([])
    const expanded = await empty.answer(MUSIC_EXPAND_PATH, `url=${encodeURIComponent(link)}`)
    assert.equal(expanded.ok, true, 'a link the Host can read must expand')
    assert.equal(expanded.total, 3, 'a bare link covers every part of the video')
    assert.deepEqual(expanded.fresh, expanded.links, 'and every part is new to an empty list')
    assert.deepEqual(expanded.links, [link, `${link}?p=2`, `${link}?p=3`])
    assert.equal(expanded.known, 0)

    assert.deepEqual(await empty.answer(MUSIC_ADDED_PATH, 'count=150'), { ok: true, count: 150 })
    const published = JSON.parse(readFileSync(join(home, 'little-icon', 'music.json'), 'utf8'))
    assert.equal(published.notice?.kind, 'added-many', 'the pet is told a set arrived')
    assert.equal(published.notice.count, 150, 'with how many songs came with it')
    assert.deepEqual(await empty.answer(MUSIC_ADDED_PATH, 'count=0'), { ok: false, reason: 'count' },
      'a count that is not a positive number is refused')

    // The discard route is the one Git route whose request is a list, so its
    // selection travels in a JSON body: a method that is not POST is refused, a
    // body past the cap is refused instead of read into memory, and a root that
    // names nothing, is gone, or is outside every repository gets the listing's
    // own explanations rather than a bare failure.
    assert.equal(await empty.answerBody(GIT_DISCARD_PATH, 'GET'),
      undefined, 'discarding is a POST, so a read is refused without an answer body')
    assert.deepEqual(await empty.answerBody(GIT_DISCARD_PATH, 'POST', { paths: [{ path: 'a.txt' }] }),
      { ok: false, reason: 'no-root' }, 'a request that names no repository is refused')
    assert.deepEqual(await empty.answerBody(GIT_DISCARD_PATH, 'POST', { root: join(home, 'gone'), paths: [{ path: 'a.txt' }] }),
      { ok: false, reason: 'no-dir' }, 'a repository root that is gone is answered, not attempted')
    assert.deepEqual(await empty.answerBody(GIT_DISCARD_PATH, 'POST', { root: home, paths: [{ path: 'a.txt' }] }),
      { ok: false, reason: 'not-a-repo' }, 'a directory outside every repository answers the same way')
    assert.deepEqual(await empty.answerBody(GIT_DISCARD_PATH, 'POST', { root: 'x'.repeat(GIT_DISCARD_MAX_BYTES + 1) }),
      { ok: false, reason: 'no-root' }, 'a body past the cap is refused, not buffered')
    empty.dispose()

    // One video has many spellings: the first part under a bare id is the same song as
    // the same part with tracking parameters, and a part the list does not hold is new.
    const held = await mount([link])
    const already = await held.answer(MUSIC_EXPAND_PATH, `url=${encodeURIComponent(`${link}?p=1&spm_id_from=333`)}`)
    assert.equal(already.total, 1, 'a link that names a part stays that part')
    assert.deepEqual(already.fresh, [], 'a song the settings already hold is not offered again')
    assert.equal(already.known, 1)
    const second = await held.answer(MUSIC_EXPAND_PATH, `url=${encodeURIComponent(`${link}?p=2`)}`)
    assert.deepEqual(second.fresh, [`${link}?p=2`], 'a part the settings do not hold is new')
    held.dispose()

    // One link is one playlist, and the pet is handed the playlist a person picked:
    // two videos, one of them a two-part set, all three files on this machine.
    const libraryEntries = [
      { id: 'BVp', source: 'BVp', title: '专辑 - 一', owner: '', durationMs: 0, file: '专辑/一.m4a', size: 5, playlist: 'BVp', playlistTitle: '专辑' },
      { id: 'BVp-p2', source: 'BVp?p=2', title: '专辑 - 二', owner: '', durationMs: 0, file: '专辑/二.m4a', size: 5, playlist: 'BVp', playlistTitle: '专辑' },
      { id: 'BVs', source: 'BVs', title: '单曲', owner: '', durationMs: 0, file: '单曲/单曲.m4a', size: 5, playlist: 'BVs', playlistTitle: '单曲' },
    ]
    const musicRoot = join(home, 'little-icon', 'music')
    for (const row of libraryEntries) {
      mkdirSync(join(musicRoot, row.file.split('/')[0]), { recursive: true })
      writeFileSync(join(musicRoot, row.file), 'audio')
    }
    writeFileSync(join(home, 'little-icon', 'music-index.json'),
      `${JSON.stringify({ version: 1, entries: Object.fromEntries(libraryEntries.map(row => [row.id, row])) }, null, 2)}\n`, 'utf8')
    const publishedWith = async (options) => {
      const host = await mount(['BVp', 'BVp?p=2', 'BVs'], options)
      // The mount publishes on load; the added route publishes again, which is the same
      // work and needs no waiting.
      await host.answer(MUSIC_ADDED_PATH, 'count=1')
      const music = JSON.parse(readFileSync(join(home, 'little-icon', 'music.json'), 'utf8'))
      host.dispose()
      return music
    }
    const everything = await publishedWith({})
    assert.deepEqual(everything.tracks.map(track => track.id), ['BVp', 'BVp-p2', 'BVs'],
      'with no playlist picked the pet is handed every song')
    assert.deepEqual(everything.playlists.map(row => [row.id, row.title, row.tracks, row.ready]),
      [['BVp', '专辑', 2, 2], ['BVs', '单曲', 1, 1]],
      'and every playlist the links name is published, with what is here')
    assert.equal(everything.playlist, '', 'nothing is selected to begin with')
    assert.equal(everything.shuffle, false, 'and shuffle is off unless it is ticked')
    const chosen = await publishedWith({ playlist: 'BVp' })
    assert.deepEqual(chosen.tracks.map(track => track.id), ['BVp', 'BVp-p2'],
      'a picked playlist is the list the pet gets, so "next" steps inside it')
    assert.equal(chosen.playlist, 'BVp', 'and the choice is published with it')
    const shuffled = await publishedWith({ playlist: 'BVs', shuffle: true })
    assert.equal(shuffled.shuffle, true, 'shuffle reaches the pet, which draws the next song')
    assert.deepEqual(shuffled.tracks.map(track => track.id), ['BVs'], 'inside the picked playlist')
    const stale = await publishedWith({ playlist: 'BVgone00000' })
    assert.deepEqual(stale.tracks.map(track => track.id), ['BVp', 'BVp-p2', 'BVs'],
      'a selection whose links are gone falls back to everything rather than playing nothing')
    assert.equal(stale.playlist, '', 'and is published as no selection, which is what the card shows')
  } finally {
    globalThis.fetch = answeredFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
  console.log('little-icon smoke: link expansion ok')
}

// ---- host half, end to end (opt-in: it shows a real pet window) -------------

if (process.argv.includes('--pet')) {
  assert.equal(process.platform, 'win32', '--pet runs the Windows pet window')
  // Say it out loud: this run puts a real pet on the desktop for about half a
  // minute, in its own temporary home so it can coexist with a running pet.
  console.log('little-icon smoke --pet: showing a real pet window in the TOP-LEFT corner for about 25s')

  const home = mkdtempSync(join(tmpdir(), 'little-icon-smoke-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  // Park it in the top-left corner rather than the default bottom-right, where
  // the pet a person is actually using lives: a stray window is then obviously
  // this test's, not a second pet somebody's plugin started.
  mkdirSync(join(home, 'little-icon'), { recursive: true })
  writeFileSync(join(home, 'little-icon', 'position.json'), '{"x":0,"y":0}\n', 'utf8')
  // A menu command the pet wrote before this host started: the relay must treat
  // it as history rather than open a tab the user asked for in a past run.
  writeFileSync(join(home, 'little-icon', 'command.json'), '{"command":"chat","at":1}\n', 'utf8')
  const disposers = []
  const handlers = new Map()
  const logged = []
  const autoFormOff = []
  const routes = []
  /** What the fake `agents` service reports; the test flips it to start a task. */
  const agents = { running: false }
  const context = {
    get: (name) => (name === 'agents'
      ? { list: () => [{ id: 'agent-1', status: agents.running ? 'running' : 'idle', inbox: { nextTurn: [], nextStep: [] } }] }
      : undefined),
    logger: { info: (...args) => logged.push(args.join(' ')), warn: (...args) => logged.push(args.join(' ')) },
    on: (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event) },
    effect: (factory) => { disposers.push(factory()) },
    // Cordis runs the callback once its services exist; the eager call here keeps
    // the injections in apply() exercised without a loader.
    inject: (_services, callback) => callback({
      effect: (factory) => { disposers.push(factory()) },
      // The real configure returns the disposer that drops the presentation.
      settings: { configure: (presentation) => { autoFormOff.push(presentation.auto); return () => {} } },
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    }),
  }
  /** A config reference the test can also flip, as the loader does. */
  const ref = (value) => {
    const box = { value }
    return { get: () => box.value, set: (next) => { box.value = next } }
  }
  const config = {
    enabled: ref(true),
    size: ref(180),
    translucent: ref(true),
    idleOpacity: ref(0.5),
    frameMs: ref(500),
    pollMs: ref(300),
    happyMs: ref(500),
    boredEverySeconds: ref(30),
    boredMs: ref(1000),
    // Short enough that the sleep-and-wake cycle fits in a test, long enough
    // that the write-rate window below stays inside one steady state.
    sleepAfterSeconds: ref(6),
    sleepWhenHiddenSeconds: ref(2),
    // The plugin default: DSH is tucked away the moment another application is in
    // front, which is also what makes the assertion below deterministic.
    autoHide: ref(true),
    autoHideSeconds: ref(0),
    topmost: ref(true),
    clickAction: ref('toggle'),
    gitPullTimeoutMs: ref(60_000),
    sites: ref([]),
    // Where the capture menu writes, and the music section's own fields: the host
    // reads every one of them on each publish, so this double has to carry them even
    // where the lifecycle test does not exercise them.
    shotDir: ref(''),
    musicLinks: ref([]),
    musicDir: ref(''),
    musicVolume: ref(70),
    coopAddress: ref('192.168.1.3:15180'),
    coopHotkey: ref('ctrl+alt+f12'),
    // Off: this suite must not start the multi-machine process on a machine that
    // happens to carry the configured address.
    coopAutoStart: ref(false),
  }

  const countPetProcesses = () => {
    const marker = join(home, 'little-icon', 'state.json')
    // The probe itself is a powershell.exe whose command line carries the marker,
    // so it must exclude its own process id.
    const query = `@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${marker}*' }).Count`
    const probe = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-Command', query], { encoding: 'utf8' })
    assert.equal(probe.status, 0, `pet process probe failed: ${probe.stderr}`)
    return Number(probe.stdout.trim())
  }

  /**
   * Measure the pet window in physical pixels from a DPI-aware process. Mixing
   * WPF's DIP geometry with WinForms' physical geometry puts the window off the
   * screen at any display scaling other than 100%, so the check is worth a probe.
   * @returns {{bounds: string, virtual: string, onScreen: boolean}} measurement.
   */
  const measurePetWindow = () => {
    const marker = join(home, 'little-icon', 'state.json')
    const script = join(home, 'measure.ps1')
    writeFileSync(script, `
param([string]$Marker)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace PetMeasure -Name Win32 -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr ctx);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr extra);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public delegate bool EnumProc(System.IntPtr h, System.IntPtr extra);
"@
[void][PetMeasure.Win32]::SetProcessDpiAwarenessContext([IntPtr](-4))
$pids = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$Marker*" } | ForEach-Object { [int]$_.ProcessId })
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$found = @()
foreach ($target in $pids) {
  $script:t = $target
  $cb = [PetMeasure.Win32+EnumProc]{
    param([IntPtr]$h, [IntPtr]$x)
    $owner = 0
    [void][PetMeasure.Win32]::GetWindowThreadProcessId($h, [ref]$owner)
    if ($owner -eq $script:t -and [PetMeasure.Win32]::IsWindowVisible($h)) {
      $r = New-Object PetMeasure.Win32+RECT
      [void][PetMeasure.Win32]::GetWindowRect($h, [ref]$r)
      if (($r.Right - $r.Left) -gt 8 -and ($r.Bottom - $r.Top) -gt 8) {
        $onScreen = ($r.Left -ge $vs.Left) -and ($r.Top -ge $vs.Top) -and ($r.Right -le $vs.Right) -and ($r.Bottom -le $vs.Bottom)
        $script:found += "$onScreen $($r.Left),$($r.Top) $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
      }
    }
    return $true
  }
  [void][PetMeasure.Win32]::EnumWindows($cb, [IntPtr]::Zero)
}
"virtual=$($vs.Width)x$($vs.Height)"
$found
`, 'utf8')
    const probe = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, marker], { encoding: 'utf8' })
    assert.equal(probe.status, 0, `window measurement failed: ${probe.stderr}`)
    const lines = probe.stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return { virtual: lines[0] ?? 'virtual=?', windows: lines.slice(1) }
  }

  try {
    // A quit request left behind by a host that died mid-teardown belongs to no
    // pet: starting one must clear it, or the new pet would quit on its first tick.
    writeFileSync(join(home, 'little-icon', 'quit'), '')
    apply(context, config)
    assert.equal(existsSync(join(home, 'little-icon', 'quit')), false,
      'starting a pet must clear a stale quit request')
    const statePath = join(home, 'little-icon', 'state.json')
    assert.ok(existsSync(statePath), 'apply() did not publish a state file')
    const first = JSON.parse(readFileSync(statePath, 'utf8'))
    assert.equal(first.state, 'idle')
    assert.equal(first.size, 180)
    assert.equal(first.clickAction, 'toggle')
    assert.equal(first.tuck, false, 'a freshly started host must not ask for a tuck')
    // The custom card owns the fields, so the schema-derived automatic page must
    // be switched off or the row would show both.
    assert.deepEqual(autoFormOff, [false], 'apply() did not disable the automatic settings page')
    // The page reports input here; without it the pet could only see agents and
    // jobs, and it would sleep while the person is using DSH. The second route is
    // the stream the pet's menu commands come back on, the next seven are what
    // the Git page reads, checks, fast-forwards, and restores a Session's
    // repository through, the next is the menu's open-directory entry, and the
    // rest are the music library, its downloads, and the playback commands the
    // card sends.
    assert.deepEqual(routes.map((route) => `${route.kind} ${route.path}`),
      [`exact ${ACTIVITY_PATH}`, `exact ${COMMANDS_PATH}`, `exact ${GIT_PATH}`,
        `exact ${GIT_DIFF_PATH}`, `exact ${GIT_COMMIT_PATH}`, `exact ${GIT_COMMITS_PATH}`,
        `exact ${GIT_REMOTE_PATH}`,
        `exact ${GIT_PULL_PATH}`,
        `exact ${GIT_DISCARD_PATH}`,
        `exact ${OPEN_PATH}`,
        `exact ${MUSIC_PATH}`, `exact ${MUSIC_SYNC_PATH}`, `exact ${MUSIC_DOWNLOAD_PATH}`,
        `exact ${MUSIC_EXPAND_PATH}`, `exact ${MUSIC_ADDED_PATH}`,
        `exact ${MUSIC_REMOVE_PATH}`, `exact ${MUSIC_COMMAND_PATH}`])

    // The Git routes answer JSON for one directory and refuse everything else.
    // The directory is checked here rather than inferred from a spawn failure, so
    // a page that has not learned its Session's workspace is told that, not that
    // git is missing.
    const gitRoute = routes.find((route) => route.path === GIT_PATH)
    const diffRoute = routes.find((route) => route.path === GIT_DIFF_PATH)
    const commitRoute = routes.find((route) => route.path === GIT_COMMIT_PATH)
    const remoteRoute = routes.find((route) => route.path === GIT_REMOTE_PATH)
    const pullRoute = routes.find((route) => route.path === GIT_PULL_PATH)
    const discardRoute = routes.find((route) => route.path === GIT_DISCARD_PATH)
    const answered = () => {
      const response = {
        status: 0,
        headers: {},
        body: '',
        writeHead(code, headers) { this.status = code; this.headers = headers ?? {} },
        end(chunk) { this.body = chunk ?? '' },
      }
      return response
    }
    /**
     * Ask one Git route, with a JSON body when the route reads one. The body is
     * emitted in chunks and then ended, after the handler has subscribed, so the
     * reader receives it the way a real request would deliver it.
     */
    const askGit = async (route, method, url, payload) => {
      const response = answered()
      const listeners = new Map()
      const request = payload === undefined
        ? { method, url, on: () => {} }
        : { method, url, on: (name, handler) => { listeners.set(name, handler) } }
      route.handler(request, response)
      if (payload !== undefined) {
        listeners.get('data')?.(Buffer.from(JSON.stringify(payload), 'utf8'))
        listeners.get('end')?.()
      }
      // Successful handlers answer through a promise. Wait for that observable
      // response rather than assuming the machine will settle it within one
      // fixed delay; method refusals need no body.
      const deadline = Date.now() + 4000
      while (response.status === 0 || (response.status === 200 && response.body === '')) {
        if (Date.now() >= deadline) assert.fail(`${method} ${url} did not answer`)
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return {
        status: response.status,
        headers: response.headers,
        body: response.body === '' ? undefined : JSON.parse(response.body),
      }
    }
    assert.equal((await askGit(gitRoute, 'POST', GIT_PATH)).status, 405, 'the Git route is read-only')
    const noCwd = await askGit(gitRoute, 'GET', GIT_PATH)
    assert.equal(noCwd.status, 200)
    assert.deepEqual(noCwd.body, { ok: false, reason: 'no-cwd' })
    assert.equal(noCwd.headers['content-type'], 'application/json')
    assert.equal(noCwd.headers['cache-control'], 'no-store', 'a stale repository listing must not be cached')
    const missing = await askGit(gitRoute, 'GET', `${GIT_PATH}?cwd=${encodeURIComponent(join(home, 'gone'))}`)
    assert.deepEqual(missing.body, { ok: false, reason: 'no-dir' })
    const outside = await askGit(gitRoute, 'GET', `${GIT_PATH}?cwd=${encodeURIComponent(home)}`)
    assert.deepEqual(outside.body, { ok: false, reason: 'not-a-repo' },
      'a temporary DSH_HOME is not inside a repository either')

    // The diff route is a read like the listing, and it answers the same reasons:
    // the page names the root it just listed and one path inside it.
    assert.equal((await askGit(diffRoute, 'POST', GIT_DIFF_PATH)).status, 405, 'the diff route is read-only')
    const goneDiff = await askGit(diffRoute, 'GET',
      `${GIT_DIFF_PATH}?root=${encodeURIComponent(join(home, 'gone'))}&path=a.txt`)
    assert.deepEqual(goneDiff.body, { ok: false, reason: 'no-dir' })
    const outsideDiff = await askGit(diffRoute, 'GET',
      `${GIT_DIFF_PATH}?root=${encodeURIComponent(home)}&path=a.txt`)
    assert.deepEqual(outsideDiff.body, { ok: false, reason: 'not-a-repo' },
      'a directory outside every repository is the listing\'s own answer, not a bare failure')
    assert.equal(outsideDiff.headers['cache-control'], 'no-store', 'a diff must not be cached either')

    // The commit route is the same read shaped for a history row: a repository
    // root and one hash, and the same explanations when either is wrong.
    assert.equal((await askGit(commitRoute, 'POST', GIT_COMMIT_PATH)).status, 405,
      'the commit route is read-only')
    const goneCommit = await askGit(commitRoute, 'GET',
      `${GIT_COMMIT_PATH}?root=${encodeURIComponent(join(home, 'gone'))}&hash=abc`)
    assert.deepEqual(goneCommit.body, { ok: false, reason: 'no-dir' })
    const outsideCommit = await askGit(commitRoute, 'GET',
      `${GIT_COMMIT_PATH}?root=${encodeURIComponent(home)}&hash=abc`)
    assert.deepEqual(outsideCommit.body, { ok: false, reason: 'not-a-repo' })

    // Refreshing upstream status updates a remote-tracking ref, so it requires
    // an explicit POST even though it never moves the local branch or files.
    assert.equal((await askGit(remoteRoute, 'GET', GIT_REMOTE_PATH)).status, 405,
      'the upstream check must require POST')
    const outsideRemote = await askGit(remoteRoute, 'POST',
      `${GIT_REMOTE_PATH}?root=${encodeURIComponent(home)}`)
    assert.deepEqual(outsideRemote.body, { ok: false, reason: 'not-a-repo' })

    // Pull is the one operation that moves the local branch or files: re-reads
    // cannot trigger it, and a POST without a Session directory is answered
    // before Git is started.
    assert.equal((await askGit(pullRoute, 'GET', GIT_PULL_PATH)).status, 405,
      'the pull route must require POST')
    const noPullCwd = await askGit(pullRoute, 'POST', GIT_PULL_PATH)
    assert.equal(noPullCwd.status, 200)
    assert.deepEqual(noPullCwd.body, { ok: false, reason: 'no-cwd' })
    assert.equal(noPullCwd.headers['cache-control'], 'no-store', 'a pull result must not be cached')

    // Discarding is the one route that throws work away, so it is also the one
    // whose selection arrives in the body: a re-read cannot trigger it, and a
    // request that names no repository is answered before Git is started.
    assert.equal((await askGit(discardRoute, 'GET', GIT_DISCARD_PATH)).status, 405,
      'the discard route must require POST')
    const noRoot = await askGit(discardRoute, 'POST', GIT_DISCARD_PATH, { paths: [{ path: 'a.txt' }] })
    assert.equal(noRoot.status, 200)
    assert.deepEqual(noRoot.body, { ok: false, reason: 'no-root' })
    assert.equal(noRoot.headers['cache-control'], 'no-store', 'a discard result must not be cached')
    const outsideDiscard = await askGit(discardRoute, 'POST', GIT_DISCARD_PATH,
      { root: home, paths: [{ path: 'a.txt' }] })
    assert.deepEqual(outsideDiscard.body, { ok: false, reason: 'not-a-repo' },
      'a root outside every repository answers the listing\'s own reason')

    // The music routes: the link list is config that travels, and everything derived
    // from it — the audio file, the index naming it, the file the pet plays from — is
    // this machine's. A download is the Host's own work, so these routes answer with
    // no page involved, which is what lets a machine that just pulled the link list
    // fill itself in from the pet's own menu.
    const musicRoute = routes.find((route) => route.path === MUSIC_PATH)
    const musicSyncRoute = routes.find((route) => route.path === MUSIC_SYNC_PATH)
    const musicDownloadRoute = routes.find((route) => route.path === MUSIC_DOWNLOAD_PATH)
    const musicRemoveRoute = routes.find((route) => route.path === MUSIC_REMOVE_PATH)
    const musicCommandRoute = routes.find((route) => route.path === MUSIC_COMMAND_PATH)
    const pluginHome = join(home, 'little-icon')
    const musicFolder = join(home, 'audio')
    const musicId = 'BV1GJ411x7h7'
    const readMusicFile = () => JSON.parse(readFileSync(join(pluginHome, 'music.json'), 'utf8'))
    const readPlayerFile = () => {
      try { return JSON.parse(readFileSync(join(pluginHome, 'music-player.json'), 'utf8')) } catch { return {} }
    }
    config.musicDir.set(musicFolder)
    config.musicVolume.set(33)
    config.musicLinks.set([firstLink])
    handlers.get('loader/volatile-update')()
    const musicViewAnswer = await askGit(musicRoute, 'GET', MUSIC_PATH)
    assert.equal(musicViewAnswer.status, 200)
    assert.equal(musicViewAnswer.body.dir, musicFolder)
    assert.equal(musicViewAnswer.body.volume, 33)
    assert.deepEqual(musicViewAnswer.body.entries.map(row => [row.link, row.state]), [[firstLink, 'missing']],
      'a link with no file yet is reported as missing')
    assert.equal(musicViewAnswer.body.missing, 1)
    assert.equal(musicViewAnswer.body.warning, '', 'the default music folder is a plain machine-local one')
    // Nothing downloaded yet: the file the pet plays from names no tracks, and the
    // count of what is missing is what its menu offers to fill in.
    assert.deepEqual(readMusicFile().tracks, [])
    assert.equal(readMusicFile().missing, 1)
    assert.equal(readMusicFile().volume, 33)

    const hostFetch = globalThis.fetch
    globalThis.fetch = musicFetch
    try {
      // The card's one-link download is answered once the file is written, so the page
      // can report the title without polling for a first answer.
      const added = await askGit(musicDownloadRoute, 'POST',
        `${MUSIC_DOWNLOAD_PATH}?url=${encodeURIComponent(firstLink)}`)
      assert.deepEqual([added.body.ok, added.body.title], [true, 'Song One'])
      assert.equal(existsSync(join(musicFolder, 'Song One.m4a')), true, 'the audio lands in the configured folder')
      // And the track reaches the pet through its own file, with the absolute path the
      // pet opens: it plays local files rather than asking this half for them.
      const published = readMusicFile()
      assert.deepEqual(published.tracks.map(track => [track.id, track.title]), [[musicId, 'Song One']])
      assert.equal(published.tracks[0].file, join(musicFolder, 'Song One.m4a'))
      assert.equal(published.missing, 0)

      // A playback command from the card rides in that same file, and the pet — the
      // half that owns the audio — applies it on its next tick and records that it
      // did, so a restart does not replay it.
      const command = await askGit(musicCommandRoute, 'POST', `${MUSIC_COMMAND_PATH}?action=pause`)
      assert.deepEqual(command.body, { ok: true, action: 'pause' })
      const sentAt = readMusicFile().command.at
      assert.equal(readMusicFile().command.action, 'pause')
      const untilApplied = Date.now() + 20_000
      while (readPlayerFile().commandAt !== sentAt && Date.now() < untilApplied) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      assert.equal(readPlayerFile().commandAt, sentAt, 'the pet must apply the command the card sent')
      // An action nobody defined is refused rather than written for the pet to guess.
      const unknownAction = await askGit(musicCommandRoute, 'POST', `${MUSIC_COMMAND_PATH}?action=explode`)
      assert.deepEqual(unknownAction.body, { ok: false, reason: 'unknown' })

      // Filling the library in is the one click a machine that just pulled the links
      // needs: the links with no file are downloaded in the background, and what is
      // running is readable on the view route while it runs.
      config.musicLinks.set([firstLink, 'BV1fail00000'])
      handlers.get('loader/volatile-update')()
      const started = await askGit(musicSyncRoute, 'POST', MUSIC_SYNC_PATH)
      assert.equal(started.body.ok, true)
      assert.equal(started.body.started, 1, 'only the link this machine has no file for is downloaded')
      const untilFilled = Date.now() + 30_000
      let syncView = await askGit(musicRoute, 'GET', MUSIC_PATH)
      while (syncView.body.sync.running && Date.now() < untilFilled) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        syncView = await askGit(musicRoute, 'GET', MUSIC_PATH)
      }
      assert.equal(syncView.body.sync.running, false, 'the fill-in must finish')
      assert.equal(syncView.body.sync.added, 0, 'the link already downloaded is not fetched again')
      assert.deepEqual(syncView.body.sync.failed.map(item => item.link), ['BV1fail00000'],
        'and the one that cannot be read is reported without stopping the rest')
      assert.equal(existsSync(join(musicFolder, 'Song One.m4a')), true)

      // Removing a link deletes this machine's file with its record: the audio is
      // derived, and nothing derived is kept for a link nobody lists.
      const removed = await askGit(musicRemoveRoute, 'POST', `${MUSIC_REMOVE_PATH}?id=${musicId}`)
      assert.deepEqual(removed.body, { ok: true })
      assert.equal(existsSync(join(musicFolder, 'Song One.m4a')), false)
      assert.deepEqual(readMusicFile().tracks, [])

      // A music folder inside the checkout is not used at all, only reported: those
      // files would be committed with the links, so the machine's own default folder
      // takes its place and both halves say what happened.
      config.musicDir.set(join(root, 'audio'))
      handlers.get('loader/volatile-update')()
      const warnedView = await askGit(musicRoute, 'GET', MUSIC_PATH)
      assert.equal(warnedView.body.warning, 'inside-checkout')
      assert.equal(warnedView.body.dir, join(home, 'little-icon', 'music'),
        'a folder inside the checkout is reported, not used')
      assert.equal(readMusicFile().warning, 'inside-checkout', 'and the pet is told as well')
      assert.equal(readMusicFile().dir, join(home, 'little-icon', 'music'))
      config.musicDir.set(musicFolder)
      handlers.get('loader/volatile-update')()
    } finally {
      globalThis.fetch = hostFetch
    }
    // The whole feature stays on the machine the person is on: the repository's own
    // settings file carries the links, and nothing else.
    config.musicLinks.set([])
    handlers.get('loader/volatile-update')()

    // The pet's right-click menu is drawn in another process, so the host relays
    // what it chooses: the page holds one stream open and receives a frame per
    // command. A command from before this host started is history, not a request.
    const commandsRoute = routes.find((route) => route.path === COMMANDS_PATH)
    const stream = {
      status: 0,
      headers: {},
      frames: [],
      writableEnded: false,
      destroyed: false,
      writeHead(code, headers) { this.status = code; this.headers = headers ?? {} },
      write(chunk) { this.frames.push(chunk) },
      end() { this.writableEnded = true },
      on() {},
    }
    commandsRoute.handler({ method: 'GET', on: () => {} }, stream)
    assert.equal(stream.status, 200, 'the command stream must open')
    assert.equal(stream.headers['content-type'], 'text/event-stream')
    assert.equal(stream.frames.length, 1, 'the stream opens with its comment frame')
    await new Promise((resolve) => setTimeout(resolve, 700))
    assert.equal(stream.frames.length, 1, 'a command from before this host started must not be replayed')
    writeFileSync(join(home, 'little-icon', 'command.json'),
      `${JSON.stringify({ command: 'chat', at: Date.now() })}\n`, 'utf8')
    const untilDelivered = Date.now() + 5000
    while (stream.frames.length < 2 && Date.now() < untilDelivered) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(stream.frames.length, 2, 'a menu command must reach the open stream')
    assert.match(stream.frames[1], /^data: \{"command":"chat"\}\n\n$/)

    // The menu's volume and link entries are configuration, and configuration is
    // written through the settings service - which refuses any write made inside an
    // HMR transaction, the context this Host's own timer runs in. Both commands
    // therefore travel to the page, which writes them the way the card does, and the
    // Host only answers for the links it can judge itself.
    /** Write one menu command; wait for it to reach the page, or for this half to answer. */
    const menuCommand = async (payload, forwarded) => {
      const before = stream.frames.length
      writeFileSync(join(home, 'little-icon', 'command.json'), `${JSON.stringify(payload)}\n`, 'utf8')
      const deadline = Date.now() + (forwarded ? 5000 : 900)
      while (stream.frames.length === before && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return stream.frames.length > before ? stream.frames.at(-1) : undefined
    }

    const volumeBefore = config.musicVolume.get()
    const volumeFrame = await menuCommand({ command: 'music-volume', at: Date.now() + 20, value: 21 }, true)
    assert.equal(volumeFrame, 'data: {"command":"music-volume","value":21}\n\n',
      'a volume the menu set must reach the page as a number')
    assert.equal(config.musicVolume.get(), volumeBefore, 'the Host must not write the volume itself')
    assert.equal(readMusicFile().volume, 21,
      'the pet keeps the number the menu chose while the page writes it')
    assert.notEqual(readMusicFile().notice?.kind, 'volume',
      'and nothing is announced until the configuration carries it')

    // A link command the menu no longer offers reaches nothing: the card owns the list,
    // so this half neither judges a link nor forwards one.
    config.musicLinks.set([firstLink])
    handlers.get('loader/volatile-update')()
    assert.equal(await menuCommand({ command: 'music-add-link', at: Date.now() + 40, link: 'not a link' }, false),
      undefined, 'a link command must not reach the page')
    assert.deepEqual(config.musicLinks.get(), [firstLink], 'the Host must not write the link list itself')

    // An unchanged state must not rewrite the file on every poll (300ms here):
    // only the 4s heartbeat refreshes it, so 2.5s of sampling sees at most one
    // write, where a per-poll writer would produce about eight. Measured before
    // the pet's own sleep lands, so the window holds one steady state.
    let previous = statSync(statePath).mtimeMs
    let writes = 0
    for (let sample = 0; sample < 50; sample += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const current = statSync(statePath).mtimeMs
      if (current !== previous) {
        previous = current
        writes += 1
      }
    }
    assert.ok(writes <= 1, `the state file was rewritten ${writes} times in 2.5s without a state change`)

    // The pet process is started by apply(); give it a moment to appear.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(countPetProcesses(), 1, `expected exactly one pet process (close a running pet first); log: ${logged.join(' | ')}`)

    // The window must land inside the screen: WPF's Window.Left/Top are DIPs, so
    // mixing them with physical work-area pixels pushes the pet off-screen at any
    // scaling other than 100% and nothing would ever be visible.
    const measured = measurePetWindow()
    assert.equal(measured.windows.length, 1, `expected one visible pet window, got: ${measured.windows.join(' | ')}`)
    const [onScreen, position] = measured.windows[0].split(' ')
    assert.equal(onScreen.toLowerCase(), 'true', `the pet window is off-screen (${measured.windows[0]} on ${measured.virtual})`)
    // The test parks the pet in the top-left corner through its position file —
    // one more reason a stray window is recognisably this test's — and that also
    // proves a stored position is honored at startup.
    const [left, top] = position.split(',').map(Number)
    assert.ok(left < 300 && top < 300, `the pet should start in the top-left corner, found ${position}`)

    // No activity for sleepAfterSeconds (6s here) puts the pet to sleep, and one
    // activity ping brings it straight back to idle.
    const readState = () => JSON.parse(readFileSync(statePath, 'utf8')).state
    const untilAsleep = Date.now() + 12_000
    while (readState() !== 'sleep' && Date.now() < untilAsleep) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    assert.equal(readState(), 'sleep', 'a quiet pet should fall asleep')
    const accepted = { writeHead: (code) => { accepted.code = code }, end: () => {} }
    routes[0].handler({ method: 'POST' }, accepted)
    assert.equal(accepted.code, 204, 'the activity route answers 204')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'activity should wake the pet')
    // Anything else on that route is refused.
    const refused = { writeHead: (code) => { refused.code = code }, end: () => {} }
    routes[0].handler({ method: 'GET' }, refused)
    assert.equal(refused.code, 405, 'the activity route only accepts POST')

    // The pet reports whether DSH is on screen and whether it is in front;
    // tucked away, the much shorter sleep timer applies, and showing DSH again
    // counts as activity and wakes it. (The test's pet has no window to control,
    // so it writes no report itself.)
    const windowPath = join(home, 'little-icon', 'window.json')
    writeFileSync(windowPath, '{"dshVisible":false,"dshForeground":false}\n', 'utf8')
    const untilTucked = Date.now() + 6000
    while (readState() !== 'sleep' && Date.now() < untilTucked) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readState(), 'sleep', 'a tucked DSH should put the pet to sleep on the short timer')
    writeFileSync(windowPath, '{"dshVisible":true,"dshForeground":true}\n', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(readState(), 'idle', 'showing DSH again should wake the pet')

    // A task starts working directly — no startle first, surprise belongs to the
    // question below — and ending it must play happy before settling back to idle.
    agents.running = true
    const untilWorking = Date.now() + 3000
    while (readState() !== 'working' && Date.now() < untilWorking) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'working', 'a task start should go straight to working')
    // The auto-tuck follows what is in front: DSH in front is never tucked away,
    // and going behind an application is what asks for the tuck — with no delay,
    // on the next sample, and without sparing the running task.
    const readTuck = () => JSON.parse(readFileSync(statePath, 'utf8')).tuck
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readTuck(), false, 'DSH in front must never be tucked away')
    writeFileSync(windowPath, '{"dshVisible":true,"dshForeground":false}\n', 'utf8')
    const untilTuck = Date.now() + 10_000
    while (readTuck() !== true && Date.now() < untilTuck) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readTuck(), true, 'going behind another application must ask for the tuck')
    assert.equal(readState(), 'working', 'the tuck must not wait for the running task to finish')

    // A question the agent asks the user parks the run on the person, so while the
    // choice is unanswered the pet shows surprise, and the answer puts it back to
    // work. The waterfall the tool calls is what the host observes.
    const asked = handlers.get('user-questions/request')
    assert.equal(typeof asked, 'function', 'the host must observe the question waterfall')
    const answer = Promise.withResolvers()
    void asked({ agent: { id: 'agent-1' }, questions: [] }, () => answer.promise)
    const untilSurprised = Date.now() + 4000
    while (readState() !== 'alert' && Date.now() < untilSurprised) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'alert', 'an unanswered question must surprise the pet')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readState(), 'alert', 'the surprise must stand as long as the question does')
    answer.resolve({ answers: [] })
    const untilResumed = Date.now() + 4000
    while (readState() !== 'working' && Date.now() < untilResumed) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'working', 'the answer puts the pet back to work')

    agents.running = false
    const untilHappy = Date.now() + 3000
    while (readState() !== 'happy' && Date.now() < untilHappy) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.equal(readState(), 'happy', 'finishing a task should play the happy frames')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(readState(), 'idle', 'the pet should settle back to idle')

    // Disabling the pet ends its process; enabling it again starts a new one,
    // while an unrelated settings write never resurrects a pet the user quit. The
    // pet is asked to quit rather than killed, so it stores its position and closes
    // its window in order instead of dying mid-write.
    const quitPath = join(home, 'little-icon', 'quit')
    const volatileUpdate = handlers.get('loader/volatile-update')
    config.enabled.set(false)
    volatileUpdate()
    assert.equal(existsSync(quitPath), true, 'disabling the pet must ask it to quit')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(countPetProcesses(), 0, 'disabling the pet left its process running')
    assert.equal(existsSync(quitPath), false, 'the pet must take the request with it as it goes')
    config.size.set(200)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(countPetProcesses(), 0, 'a settings write restarted a disabled pet')
    config.enabled.set(true)
    volatileUpdate()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    assert.equal(countPetProcesses(), 1, 'enabling the pet did not start it again')
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).size, 200)

    // The switch stops the request without touching anything else.
    config.autoHide.set(false)
    volatileUpdate()
    assert.equal(readTuck(), false, 'the auto-tuck switch must stop the request')
    config.autoHide.set(true)
    volatileUpdate()
    const untilBack = Date.now() + 10_000
    while (readTuck() !== true && Date.now() < untilBack) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.equal(readTuck(), true, 'turning the switch back on must resume the request')

    // Disposal kills the process so DSH never leaves an orphan pet behind, and
    // ends the command stream so no page is left listening to a plugin that is gone.
    for (const disposer of disposers.splice(0)) disposer()
    assert.equal(stream.writableEnded, true, 'disposal must end the command stream')
    await new Promise((resolve) => setTimeout(resolve, 2500))
    assert.equal(countPetProcesses(), 0, 'disposal left a pet process running')
    const problems = logged.filter((line) => line.includes('pet:') || line.includes('missing'))
    assert.equal(problems.length, 0, `the pet reported a problem: ${problems.join(' | ')}`)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
  console.log('little-icon smoke: pet lifecycle ok')
}

console.log('little-icon smoke: ok')
