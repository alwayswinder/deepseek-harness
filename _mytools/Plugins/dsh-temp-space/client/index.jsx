/**
 * DSH Temp Space — browser half.
 *
 * One canvas, drawn in the main column: the sidebar's own row selects it, and
 * the desktop pet's 特殊功能 menu opens it through the `tempSpace` service this
 * half provides, the way the aquarium plugin exposes its tank.
 *
 * The page holds no bytes and no filesystem of its own. It renders the state the
 * host serves — items with a position, a note or a stored file name — and every
 * change goes back through a route of this plugin's: a save of the whole canvas,
 * one uploaded file, one file deleted, and the Git operations. Saves are
 * debounced rather than batched at close, because a window can be closed without
 * asking the page first, and the revision the host returns is what the next save
 * carries so a second writer is told instead of overwriting the first.
 */

import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Settings and locale namespace of this plugin. */
const NS = 'temp-space'

/** Main-panel id, its sidebar row's id, and the slot key of the panel body. */
const PANEL_ID = 'temp-space'

/** The host routes this half reads and writes. */
const STATE_PATH = '/api/temp-space/state'
const BLOB_PATH = '/api/temp-space/blob'
const GIT_PATH = '/api/temp-space/git'

/** How far a press must travel before it counts as a drag rather than a click. */
const DRAG_THRESHOLD = 3

/** How long an edit waits before the whole canvas is written back. */
const SAVE_DEBOUNCE_MS = 500

/** Zoom range, and the factor one wheel notch takes. */
const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const ZOOM_WHEEL_STEP = 1.1

/**
 * The rungs the − and + controls walk. Halving and doubling, so the natural
 * scale is one click from half size or double size; a wheel keeps its smooth
 * factor in between and snaps back onto a rung when a control is pressed.
 */
const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3]

/**
 * Blank space kept between the canvas and the edge of the column, unscaled so it
 * never disappears at a small zoom.
 */
const CANVAS_MARGIN = 60

/**
 * The canvas is one fixed plane, in content coordinates, with its origin in the
 * middle: a card can be put anywhere on it and stays there. The plane does not
 * move or resize when a card does — a view that shifted under the card being
 * moved would be the canvas moving rather than the card.
 */
const CANVAS_HALF_WIDTH = 2000
const CANVAS_HALF_HEIGHT = 1500

/** That plane as a box, for the layout and for the zoom arithmetic. */
const CANVAS_BOX = {
  left: -CANVAS_HALF_WIDTH,
  top: -CANVAS_HALF_HEIGHT,
  width: CANVAS_HALF_WIDTH * 2,
  height: CANVAS_HALF_HEIGHT * 2,
}

/** Width and height one item starts with, per kind. */
const DEFAULT_SIZE = { text: { w: 260, h: 168 }, image: { w: 240, h: 200 }, file: { w: 240, h: 84 } }

/** The default size of one item, for the items stored before sizes existed. */
function defaultSizeOf(item) {
  if (item.kind !== 'file') return DEFAULT_SIZE.text
  return isImage(item.file) ? DEFAULT_SIZE.image : DEFAULT_SIZE.file
}

/** Extensions drawn as a picture rather than as a name. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])

const zh = {
  panel: '临时空间',
  title: '临时空间',
  loading: '正在读取…',
  empty: '把文件拖到这里就会存进去；也可以点「+ 文字」写一条便签。',
  dropHint: '松手即入库',
  addText: '+ 文字',
  addTextBody: '写点什么…',
  refresh: '刷新',
  save: '保存',
  pull: '拉取',
  working: '正在{action}…',
  refreshed: '已刷新',
  confirmRemove: '再点一次 × 就删掉「{name}」',
  removeConfirm: '确定删除',
  removeCancel: '取消',
  titleHint: '双击标题可以改名字',
  titlePlaceholder: '未命名',
  zoomReset: '回到 100%',
  zoomHint: '滚轮缩放；右键拖动或拖空白处平移',
  usage: '{used} / {total}',
  fileMissing: '文件不在了',
  download: '下载',
  remove: '删除',
  gitBranch: '分支 {branch}',
  gitUpToDate: '与远端一致',
  gitAhead: '领先 {ahead}',
  gitBehind: '落后 {behind}',
  gitDiverged: '已分叉：{ahead} 领先 / {behind} 落后',
  gitNoUpstream: '没有上游分支',
  gitDetached: '游离 HEAD',
  gitChanges: '{count} 个未提交改动',
  gitClean: '没有未提交的改动',
  gitNone: '还不是仓库',
  saved: '已存到本机',
  savedAll: '已提交并上传',
  savedNothing: '本机已是最新，没有需要保存的改动',
  savedUnpushed: '已提交到本机，但上传失败：{message}',
  savedBehind: '已提交到本机，但远端领先，先拉取再保存',
  pulled: '已拉取',
  failed: '失败：{message}',
  conflict: '这个画布在别处被改过，已重新载入。',
  tooLarge: '单个文件最多 10 MB，这个没存进去。',
  full: '临时空间满了（上限 100 MB），先删掉一些再放。',
  noDir: '找不到临时空间目录 {dir}。先在这台机器上把它克隆下来。',
}

const en = {
  panel: 'Temp Space',
  title: 'Temp Space',
  loading: 'Loading…',
  empty: 'Drop files here to store them, or press "+ Text" to leave a note.',
  dropHint: 'Release to store',
  addText: '+ Text',
  addTextBody: 'Write something…',
  refresh: 'Refresh',
  save: 'Save',
  pull: 'Pull',
  working: '{action}…',
  refreshed: 'Refreshed',
  confirmRemove: 'Press × again to remove "{name}"',
  removeConfirm: 'Remove',
  removeCancel: 'Cancel',
  titleHint: 'Double-click the title to rename it',
  titlePlaceholder: 'Untitled',
  zoomReset: 'Back to 100%',
  zoomHint: 'Wheel to zoom; right-drag or drag the background to move around',
  usage: '{used} / {total}',
  fileMissing: 'File is gone',
  download: 'Download',
  remove: 'Remove',
  gitBranch: 'branch {branch}',
  gitUpToDate: 'in sync with the remote',
  gitAhead: '{ahead} ahead',
  gitBehind: '{behind} behind',
  gitDiverged: 'diverged: {ahead} ahead / {behind} behind',
  gitNoUpstream: 'no upstream branch',
  gitDetached: 'detached HEAD',
  gitChanges: '{count} uncommitted changes',
  gitClean: 'nothing uncommitted',
  gitNone: 'not a repository',
  saved: 'Stored locally',
  savedAll: 'Committed and uploaded',
  savedNothing: 'Already up to date; nothing to save',
  savedUnpushed: 'Committed, but the upload failed: {message}',
  savedBehind: 'Committed here, but the remote is ahead — pull first',
  pulled: 'Pulled',
  failed: 'Failed: {message}',
  conflict: 'This canvas changed elsewhere; it was reloaded.',
  tooLarge: 'One file may hold at most 10 MB; that one was not stored.',
  full: 'The space is full (100 MB); remove something first.',
  noDir: 'The space directory {dir} is missing. Clone it on this machine first.',
}

/**
 * Hold one coordinate inside the canvas plane.
 *
 * The plane is the only thing that bounds a card: it is what "a fixed-size
 * canvas" means, and it is far enough away that the space around a card looks
 * unlimited until the edge is reached.
 * @param value - the coordinate the drag asked for.
 * @param size - the card's own extent along that axis.
 * @param span - the plane's extent along that axis.
 * @returns the nearest coordinate the plane allows.
 */
function clampToPlane(value, size, span) {
  const low = -span / 2
  const high = span / 2 - size
  return Math.round(Math.max(low, Math.min(value, high)))
}

/** Format one byte count for the headers. */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Whether one stored name is drawn as a picture. */
function isImage(name) {
  if (typeof name !== 'string') return false
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** The address one stored file is read from. */
function blobUrl(name) {
  return `${BLOB_PATH}?name=${encodeURIComponent(name)}`
}

/**
 * Draw the canvas, its quota, and the Git bar.
 * @param props - framework-derived props, including this entry's inject face.
 */
function TempSpacePanel({ load, save, upload, removeBlob, gitStatus, gitAction, t }) {
  const [phase, setPhase] = useState('loading')
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [usage, setUsage] = useState({ usedBytes: 0, maxTotalBytes: 0, maxFileBytes: 0 })
  const [git, setGit] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [dropping, setDropping] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [zoom, setZoom] = useState(1)
  const revision = useRef(0)
  const itemsRef = useRef([])
  const dirty = useRef(false)
  const timer = useRef()
  const drag = useRef(null)
  const canvas = useRef(null)
  /**
   * The zoom in force, readable from the wheel listener and from handlers built
   * by earlier renders. The scroll a zoom asks for can only be applied once the
   * sized layer has been re-rendered, so it waits here in between.
   */
  const zoomRef = useRef(1)
  const pendingScroll = useRef(null)
  /** Whether the first load has already put the view on the content's middle. */
  const didCentre = useRef(false)
  /**
   * The callbacks the mount effect reaches for, refreshed on every render. This
   * is assigned during render rather than in an effect of its own: React runs
   * effects in declaration order, so an effect that only kept this current would
   * run *after* the mount effect that reads it — and the first paint, which is
   * the one that never happens twice, would be the one that failed.
   */
  const latest = useRef({})

  const say = useCallback((text) => { setNotice(text) }, [])

  /**
   * Run one thing a click asked for, and say so when it throws.
   *
   * Nothing here may fail quietly. An event handler that rejects reaches neither
   * React nor the renderer's boundary — it lands in the browser console as an
   * unhandled rejection, which on this surface is indistinguishable from a click
   * that did nothing at all. The desktop shell is exactly where that bites:
   * `window.prompt` is not implemented there and throws on the call, so the one
   * entry that used it looked like a dead button.
   * @param work - the asynchronous work the click asked for.
   */
  const guard = useCallback((work) => {
    void (async () => {
      try {
        await work()
      } catch (error) {
        say(t('failed', { message: error instanceof Error ? error.message : String(error) }))
      }
    })()
  }, [say, t])

  /** Write the canvas back now: the one path every edit, drag, and drop ends in. */
  const flush = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    const sent = itemsRef.current
    const result = await save(sent, revision.current)
    if (result.ok) {
      revision.current = result.revision
      say(t('saved'))
      return
    }
    if (result.reason === 'conflict') {
      // Another view of the same canvas wrote first. Its state wins; this one
      // says so rather than pushing a stale canvas over it.
      revision.current = result.revision
      if (Array.isArray(result.items)) {
        itemsRef.current = result.items
        setItems(result.items)
      }
      say(t('conflict'))
      return
    }
    say(t('failed', { message: result.message ?? result.reason }))
  }, [save, say, t])

  /** Keep the newest items in a ref, so the debounced write never sends a stale canvas. */
  const update = useCallback((next) => {
    itemsRef.current = next
    setItems(next)
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
  }, [flush])

  const refresh = useCallback(async () => {
    setPhase('loading')
    const [state, status] = await Promise.all([load(), gitStatus()])
    if (!state.ok) {
      setPhase('error')
      say(state.reason === 'no-dir' || state.reason === 'not-a-repo'
        ? t('noDir', { dir: state.dir ?? state.message ?? '' })
        : t('failed', { message: state.message ?? state.reason }))
      return
    }
    revision.current = state.revision
    itemsRef.current = state.items
    setItems(state.items)
    setFiles(state.files ?? [])
    setUsage(state.usage ?? { usedBytes: 0, maxTotalBytes: 0, maxFileBytes: 0 })
    setGit(status.ok ? status : null)
    dirty.current = false
    setPhase('ready')
  }, [gitStatus, load, say, t])

  useEffect(() => {
    void latest.current.refresh()
    // A panel that is switched away from may never mount again, so the pending
    // edit is written here rather than left to the debounce. The mount effect
    // runs once: the callbacks are reached through a ref so a face rebuilt by
    // the renderer cannot turn this into a refresh loop.
    return () => {
      clearTimeout(timer.current)
      void latest.current.flush()
      // A drag holds two window listeners; unmounting in the middle of one would
      // leave them to fire against a component that is gone.
      latest.current.stopDrag()
    }
  }, [])

  const present = useMemo(() => new Set(files.map(row => row.name)), [files])

  /**
   * The box the cards themselves fill, used once to aim the opening view. The
   * canvas around it is fixed, so this only ever decides where the view starts.
   */
  const contentBox = useMemo(() => {
    if (items.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 }
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const item of items) {
      const size = defaultSizeOf(item)
      left = Math.min(left, item.x)
      top = Math.min(top, item.y)
      right = Math.max(right, item.x + (item.w ?? size.w))
      bottom = Math.max(bottom, item.y + (item.h ?? size.h))
    }
    return { left, top, right, bottom }
  }, [items])

  // Where content (0, 0) sits in the scrollable area. It depends on the zoom and
  // on nothing else: the plane does not move when a card does.
  const layerLeft = CANVAS_MARGIN + CANVAS_HALF_WIDTH * zoom
  const layerTop = CANVAS_MARGIN + CANVAS_HALF_HEIGHT * zoom

  /** Store one dropped file, then anchor it on the canvas. */
  const store = useCallback(async (file) => {
    const result = await upload(file)
    // The answer is read, not trusted: a body this panel cannot name a file
    // after is a failed store, not a reason to stop drawing the canvas.
    if (!result.ok || typeof result.name !== 'string' || result.name === '') {
      say(result.reason === 'space-full' ? t('full')
        : result.reason === 'file-too-large' ? t('tooLarge')
          : t('failed', { message: result.message ?? result.reason ?? 'no-name' }))
      return
    }
    const base = itemsRef.current
    const size = isImage(result.name) ? DEFAULT_SIZE.image : DEFAULT_SIZE.file
    const item = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'file',
      file: result.name,
      x: 32 + (base.length % 6) * 28,
      y: 32 + (base.length % 6) * 26,
      w: size.w,
      h: size.h,
      z: base.reduce((top, row) => Math.max(top, row.z), 0) + 1,
    }
    update([...base, item])
    setFiles(rows => [...rows, { name: result.name, bytes: result.bytes }])
    setUsage(current => ({ ...current, usedBytes: current.usedBytes + result.bytes }))
  }, [say, t, update, upload])

  const dropFiles = useCallback(async (event) => {
    event.preventDefault()
    setDropping(false)
    const dropped = Array.from(event.dataTransfer?.files ?? [])
    if (dropped.length === 0) return
    setBusy('drop')
    for (const file of dropped) await store(file)
    setBusy('')
  }, [store])

  /** Leave a note where the next free slot is. */
  const addText = useCallback(() => {
    const base = itemsRef.current
    update([...base, {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'text',
      text: '',
      x: 32 + (base.length % 6) * 28,
      y: 32 + (base.length % 6) * 26,
      w: DEFAULT_SIZE.text.w,
      h: DEFAULT_SIZE.text.h,
      z: base.reduce((top, row) => Math.max(top, row.z), 0) + 1,
    }])
  }, [update])

  const patch = useCallback((id, fields) => {
    update(itemsRef.current.map(item => (item.id === id ? { ...item, ...fields } : item)))
  }, [update])

  /** What one card is called: the person's title, or what the item is without one. */
  const titleOf = useCallback((item) => (
    typeof item.title === 'string' && item.title !== ''
      ? item.title
      : item.kind === 'text' ? t('titlePlaceholder') : item.file
  ), [t])

  /** Keep what the title field holds, and drop the empty string back to no title. */
  const commitTitle = useCallback(() => {
    const id = editing
    if (id === null) return
    setEditing(null)
    const item = itemsRef.current.find(row => row.id === id)
    if (item === undefined) return
    const trimmed = draft.trim()
    if ((item.title ?? '') === trimmed) return
    patch(id, { title: trimmed })
  }, [draft, editing, patch])

  const drop = useCallback(async (item) => {
    const name = item.file
    update(itemsRef.current.filter(row => row.id !== item.id))
    setConfirmRemove(null)
    setEditing(null)
    if (name === undefined) return
    const result = await removeBlob(name)
    if (!result.ok) say(t('failed', { message: result.message ?? result.reason }))
    setFiles(rows => rows.filter(row => row.name !== name))
  }, [removeBlob, say, t, update])

  /** Raise one item above the others, so a dragged card is not covered. */
  const raise = useCallback((id) => {
    const top = itemsRef.current.reduce((highest, row) => Math.max(highest, row.z), 0)
    const item = itemsRef.current.find(row => row.id === id)
    if (item === undefined || item.z === top) return
    update(itemsRef.current.map(row => (row.id === id ? { ...row, z: top + 1 } : row)))
  }, [update])

  /**
   * Scale the canvas around one point of its viewport.
   *
   * The scroll offset that shows the same content point after the scale changes
   * is computed here and applied by the effect below, because the layers the
   * scroll is measured against have not been re-sized yet.
   *
   * Two offsets sit between a content point and the screen: the margin and the
   * box's own left edge, which moves with the content; and, when the canvas fits
   * inside its column, the half of the leftover room `margin: auto` puts before
   * it. Both are measured here, before and after, so the point under the pointer
   * stays under it.
   * @param next - the zoom asked for; clamped to the range.
   * @param offsetX - the anchor's horizontal distance inside the viewport.
   * @param offsetY - the anchor's vertical distance inside the viewport.
   */
  const zoomAround = useCallback((next, offsetX, offsetY) => {
    const outer = canvas.current
    const current = zoomRef.current
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    if (outer === undefined || clamped === current) return
    const box = CANVAS_BOX
    const viewportWidth = outer.clientWidth ?? 0
    const viewportHeight = outer.clientHeight ?? 0
    const room = (zoom, viewport, span) => Math.max(0, (viewport - (span * zoom + CANVAS_MARGIN * 2)) / 2)
    const before = {
      layer: CANVAS_MARGIN - box.left * current,
      layerY: CANVAS_MARGIN - box.top * current,
      room: room(current, viewportWidth, box.width),
      roomY: room(current, viewportHeight, box.height),
    }
    const after = {
      layer: CANVAS_MARGIN - box.left * clamped,
      layerY: CANVAS_MARGIN - box.top * clamped,
      room: room(clamped, viewportWidth, box.width),
      roomY: room(clamped, viewportHeight, box.height),
    }
    const pointX = (offsetX + outer.scrollLeft - before.room - before.layer) / current
    const pointY = (offsetY + outer.scrollTop - before.roomY - before.layerY) / current
    pendingScroll.current = {
      left: after.layer + pointX * clamped + after.room - offsetX,
      top: after.layerY + pointY * clamped + after.roomY - offsetY,
    }
    zoomRef.current = clamped
    setZoom(clamped)
  }, [])

  /** One wheel notch, anchored under the pointer. */
  const onWheel = useCallback((event) => {
    const outer = canvas.current
    if (outer === undefined) return
    const rect = outer.getBoundingClientRect()
    zoomAround(
      zoomRef.current * (event.deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP),
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
  }, [zoomAround])

  /** Walk one rung of the zoom ladder, anchored at the middle of the viewport. */
  const stepZoom = useCallback((direction) => {
    const outer = canvas.current
    const current = zoomRef.current
    const rung = ZOOM_LEVELS.findIndex(level => level >= current - 1e-6)
    const from = rung < 0 ? ZOOM_LEVELS.length - 1 : rung
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, from + direction))]
    zoomAround(next, (outer?.clientWidth ?? 0) / 2, (outer?.clientHeight ?? 0) / 2)
  }, [zoomAround])

  // React attaches wheel listeners passively, where `preventDefault` is refused
  // and does nothing: with one of those, a wheel over the canvas would scale it
  // and scroll it at the same time. This one is registered on the element.
  useEffect(() => {
    const outer = canvas.current
    if (outer === undefined) return
    const refuse = (event) => { event.preventDefault(); onWheel(event) }
    outer.addEventListener('wheel', refuse, { passive: false })
    return () => { outer.removeEventListener('wheel', refuse) }
  }, [onWheel])

  // The scroll a zoom asked for, applied once the scaled layer has its new size.
  useEffect(() => {
    const pending = pendingScroll.current
    if (pending === null) return
    pendingScroll.current = null
    const outer = canvas.current
    if (outer === undefined) return
    outer.scrollLeft = pending.left
    outer.scrollTop = pending.top
  }, [zoom])

  /**
   * Aim the opening view at the middle of what is on the canvas, once, after the
   * first load has drawn it.
   *
   * Nothing moves the view afterwards: the canvas is a fixed plane, so a card
   * dragged across it never shifts what the person is looking at. An empty canvas
   * has nothing to aim at, and its origin is the middle of the plane anyway.
   */
  useEffect(() => {
    if (phase !== 'ready' || didCentre.current) return
    didCentre.current = true
    const outer = canvas.current
    if (outer === undefined) return
    const middleX = (contentBox.left + contentBox.right) / 2
    const middleY = (contentBox.top + contentBox.bottom) / 2
    const width = CANVAS_BOX.width * zoomRef.current + CANVAS_MARGIN * 2
    const height = CANVAS_BOX.height * zoomRef.current + CANVAS_MARGIN * 2
    const roomX = Math.max(0, ((outer.clientWidth ?? 0) - width) / 2)
    const roomY = Math.max(0, ((outer.clientHeight ?? 0) - height) / 2)
    outer.scrollLeft = Math.max(0,
      CANVAS_MARGIN + CANVAS_HALF_WIDTH * zoomRef.current + middleX * zoomRef.current + roomX - (outer.clientWidth ?? 0) / 2)
    outer.scrollTop = Math.max(0,
      CANVAS_MARGIN + CANVAS_HALF_HEIGHT * zoomRef.current + middleY * zoomRef.current + roomY - (outer.clientHeight ?? 0) / 2)
  }, [phase, contentBox])

  const onWindowMove = useCallback((event) => {
    const held = drag.current
    if (held === null) return
    if (held.kind === 'pan') {
      // Panning moves the view, not the content: the scroll offset follows the
      // pointer directly, so nothing has to be written back to the canvas.
      const outer = canvas.current
      if (outer === undefined) return
      outer.scrollLeft = held.left - (event.clientX - held.originX)
      outer.scrollTop = held.top - (event.clientY - held.originY)
      return
    }
    // A card is moved by how far the pointer travelled, not by where it landed:
    // content coordinates are the position plus that travel over the zoom, and
    // nothing about the canvas's own layout — the margin, the plane, the opening
    // view — enters the answer. It is then held inside the plane, which is the
    // only thing that bounds it.
    const scale = zoomRef.current
    const x = clampToPlane(held.x + (event.clientX - held.originX) / scale, held.size.w, CANVAS_BOX.width)
    const y = clampToPlane(held.y + (event.clientY - held.originY) / scale, held.size.h, CANVAS_BOX.height)
    if (!held.moved) {
      // A press that has not travelled is a click, and a click on the title or
      // on the remove control has to reach it: nothing moves until the pointer
      // has gone far enough to mean a drag.
      if (Math.abs(x - held.x) < DRAG_THRESHOLD && Math.abs(y - held.y) < DRAG_THRESHOLD) return
      held.moved = true
      raise(held.id)
    }
    patch(held.id, { x, y })
  }, [patch, raise])

  const stopDrag = useCallback(() => {
    drag.current = null
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
  }, [onWindowMove])

  /**
   * Begin a possible drag of one card.
   *
   * The pointer is not captured and nothing is prevented: capture would deliver
   * the following click to the header itself, so the title and the remove
   * control inside it would never see one. The move and up handlers live on the
   * window instead, which is what keeps a drag that leaves the card alive.
   * @param event - the pointerdown that started it.
   * @param item - the card under the pointer.
   */
  const startDrag = useCallback((event, item) => {
    if (event.button !== 0) return
    const size = defaultSizeOf(item)
    drag.current = {
      kind: 'card',
      id: item.id, x: item.x, y: item.y, moved: false,
      originX: event.clientX, originY: event.clientY,
      size: { w: item.w ?? size.w, h: item.h ?? size.h },
    }
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }, [onWindowMove, stopDrag])

  /**
   * Begin dragging the view itself.
   *
   * The wheel zooms, so it is no longer free to scroll: the left or middle
   * button pans from the canvas background, and the right button pans from
   * wherever it is pressed — a canvas covered in cards has no background left to
   * aim at.
   * @param event - the pointerdown that started it.
   */
  const startPan = useCallback((event) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
    const outer = canvas.current
    if (outer === undefined) return
    drag.current = {
      kind: 'pan',
      originX: event.clientX, originY: event.clientY,
      left: outer.scrollLeft, top: outer.scrollTop,
    }
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }, [onWindowMove, stopDrag])

  const run = useCallback(async (label, action, describe) => {
    setBusy(label)
    try {
      const result = await action()
      // The caller owns the wording: saving reports three different outcomes
      // (nothing to do, committed, committed-but-not-uploaded), and the generic
      // failure line would hide which one happened.
      say(describe(result))
      return result
    } finally {
      // A Git command over SSH waits on the network; every other control is
      // disabled for that whole stretch, so the notice has to say what is running.
      setBusy('')
    }
  }, [say])

  const act = useCallback(async (name) => {
    say(t('working', { action: name === 'save' ? t('save') : t('pull') }))
    const describe = name === 'save'
      ? (result) => {
        if (result.ok) return result.pushed === true ? t('savedAll') : t('savedNothing')
        // The commit is local and already durable, so the two halves are named
        // separately rather than reported as one failure.
        if (result.committed === true) {
          return result.reason === 'behind'
            ? t('savedBehind')
            : t('savedUnpushed', { message: result.message ?? result.reason })
        }
        return t('failed', { message: result.message ?? result.reason })
      }
      : (result) => (result.ok ? t('pulled') : t('failed', { message: result.message ?? result.reason }))
    const result = await run(name, () => gitAction(name, ''), describe)
    if (result.ok) await refresh()
  }, [gitAction, refresh, run, say, t])

  /** Reload both halves of the header, and say that it happened. */
  const reload = useCallback(async () => {
    await refresh()
    say(t('refreshed'))
  }, [refresh, say, t])

  const gitLine = useMemo(() => {
    if (git === null) return t('gitNone')
    if (git.detached === true) return t('gitDetached')
    const relation = git.relation === 'up-to-date' ? t('gitUpToDate')
      : git.relation === 'ahead' ? t('gitAhead', { ahead: git.ahead })
        : git.relation === 'behind' ? t('gitBehind', { behind: git.behind })
          : git.relation === 'diverged' ? t('gitDiverged', { ahead: git.ahead, behind: git.behind })
            : t('gitNoUpstream')
    const changes = git.changes === 0 ? t('gitClean') : t('gitChanges', { count: git.changes })
    return `${t('gitBranch', { branch: git.branch })} · ${relation} · ${changes}`
  }, [git, t])

  const button = (label, onClick, disabled) => h('button', {
    type: 'button',
    onClick,
    disabled: disabled === true || busy !== '',
    style: {
      font: 'inherit', cursor: 'pointer', height: 28, padding: '0 12px', borderRadius: 999, fontSize: 13,
      border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
      background: 'var(--dsw-alias-bg-layer-1, #fff)',
      color: 'var(--dsw-alias-label-primary, inherit)',
    },
  }, label)

  const itemCard = (item) => {
    const missing = item.kind === 'file' && !present.has(item.file)
    const size = defaultSizeOf(item)
    return h('div', {
      key: item.id,
      style: {
        position: 'absolute',
        left: item.x,
        top: item.y,
        zIndex: item.z,
        width: item.w ?? size.w,
        height: item.h ?? size.h,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        boxShadow: '0 2px 10px rgba(15, 23, 42, .08)',
        overflow: 'hidden',
      },
    },
    h('div', {
      onPointerDown: event => { startDrag(event, item) },
      title: t('titleHint'),
      style: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 5px 3px 8px',
        cursor: 'grab', touchAction: 'none', userSelect: 'none',
        borderBottom: '1px solid var(--dsw-alias-border-l2, #eceff4)',
        fontSize: 12,
        color: 'var(--dsw-alias-label-tertiary, #6b7280)',
      },
    },
    editing === item.id
      ? h('input', {
        value: draft,
        autoFocus: true,
        spellCheck: false,
        onChange: event => { setDraft(event.target.value) },
        onKeyDown: (event) => {
          if (event.key === 'Enter') commitTitle()
          else if (event.key === 'Escape') setEditing(null)
        },
        onBlur: commitTitle,
        style: {
          flex: '1 1 auto', minWidth: 0, font: 'inherit', fontSize: 12, padding: '0 2px',
          border: '1px solid var(--dsw-alias-border-l2, #d9dde6)', borderRadius: 4,
          background: 'var(--dsw-alias-bg-layer-1, #fff)',
          color: 'var(--dsw-alias-label-primary, inherit)',
        },
      })
      : h('span', {
        onDoubleClick: () => { setEditing(item.id); setDraft(titleOf(item) === t('titlePlaceholder') ? '' : titleOf(item)) },
        style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }, titleOf(item)),
    confirmRemove === item.id
      ? h('span', { style: { display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' } },
        h('button', {
          type: 'button',
          onClick: () => { guard(() => drop(item)) },
          style: { font: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 6, padding: '0 5px',
            background: 'var(--dsw-alias-state-danger-primary, #d9534f)', color: '#fff' },
        }, t('removeConfirm')),
        h('button', {
          type: 'button',
          onClick: () => { setConfirmRemove(null); say('') },
          style: { font: 'inherit', cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
            borderRadius: 6, padding: '0 5px', background: 'var(--dsw-alias-bg-layer-1, #fff)', color: 'inherit' },
        }, t('removeCancel')))
      : h('button', {
        type: 'button',
        onClick: () => { setConfirmRemove(item.id); say(t('confirmRemove', { name: titleOf(item) })) },
        title: t('remove'),
        style: { font: 'inherit', cursor: 'pointer', border: 'none', background: 'none', padding: '0 4px',
          color: 'inherit', flex: '0 0 auto' },
      }, '×')),
    item.kind === 'text'
      ? h('textarea', {
        value: item.text ?? '',
        placeholder: t('addTextBody'),
        // What a note holds is what somebody pasted: keys, paths, code. The
        // browser's spell checker would draw red under all of it.
        spellCheck: false,
        onChange: event => { patch(item.id, { text: event.target.value }) },
        style: {
          flex: '1 1 auto', minHeight: 0, resize: 'none', border: 'none', outline: 'none',
          padding: '8px 10px', font: 'inherit', fontSize: 13, lineHeight: 1.5, background: 'transparent',
          color: 'var(--dsw-alias-label-primary, inherit)',
        },
      })
      : h('div', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', gap: 8, padding: 8 } },
        !missing && isImage(item.file)
          ? h('img', {
            src: blobUrl(item.file),
            alt: titleOf(item),
            style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 },
          })
          : h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' } },
            // A card renamed by hand still has to say which file it holds.
            missing
              ? `${item.file} — ${t('fileMissing')}`
              : `${titleOf(item) === item.file ? '' : `${item.file} · `}${files.find(row => row.name === item.file)?.bytes ?? 0} B`),
        !missing
          ? h('a', {
            href: blobUrl(item.file),
            download: item.file,
            style: { fontSize: 12, color: 'var(--dsw-alias-brand-primary, #4f6ef7)', marginLeft: 'auto' },
          }, t('download'))
          : null))
  }

  // Assigned in the render body, after every callback it carries is defined —
  // the mount effect reaches for these on its first run and cannot wait for an
  // effect of its own to have run first.
  latest.current = { flush, refresh, stopDrag }

  return h('div', {
    style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' },
  },
  h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap',
      borderBottom: '1px solid var(--dsw-alias-border-l2, #e6e9ef)',
    },
  },
  h('strong', { style: { fontSize: 14 } }, t('title')),
  h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' } },
    t('usage', { used: formatBytes(usage.usedBytes), total: formatBytes(usage.maxTotalBytes) })),
  h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' } }, gitLine),
  h('span', { style: { flex: '1 1 auto' } }),
  button('−', () => { stepZoom(-1) }, false),
  h('button', {
    type: 'button',
    onClick: () => {
      const outer = canvas.current
      zoomAround(1, (outer?.clientWidth ?? 0) / 2, (outer?.clientHeight ?? 0) / 2)
    },
    title: t('zoomReset'),
    style: {
      font: 'inherit', cursor: 'pointer', height: 28, minWidth: 52, padding: '0 8px', borderRadius: 999,
      fontSize: 12, fontVariantNumeric: 'tabular-nums',
      border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
      background: 'var(--dsw-alias-bg-layer-1, #fff)',
      color: 'var(--dsw-alias-label-primary, inherit)',
    },
  }, `${Math.round(zoom * 100)}%`),
  button('+', () => { stepZoom(1) }, false),
  button(t('addText'), addText, false),
  button(t('save'), () => { guard(() => act('save')) }, false),
  button(t('pull'), () => { guard(() => act('pull')) }, false),
  button(t('refresh'), () => { guard(reload) }, false)),
  notice === ''
    ? null
    : h('div', {
      style: {
        padding: '6px 14px', fontSize: 12,
        color: 'var(--dsw-alias-label-secondary, #4b5563)',
        borderBottom: '1px solid var(--dsw-alias-border-l2, #eef1f5)',
      },
    }, notice),
  h('div', {
    style: { flex: '1 1 auto', minHeight: 0, position: 'relative' },
  },
  h('div', {
    ref: canvas,
    onPointerDown: (event) => {
      const outer = canvas.current
      if (outer === undefined) return
      if (event.button === 2) {
        // The right button moves the view wherever it is pressed, cards
        // included: it is the one gesture that never needs a patch of empty
        // canvas to find. A press on a card reaches here by bubbling after that
        // card's own handler, which only answers to the left button.
        startPan(event)
        return
      }
      // A left press pans only the canvas itself; on a card it is that card's
      // own drag.
      if (event.target !== event.currentTarget) return
      if (event.button === 1) event.preventDefault()
      startPan(event)
    },
    onContextMenu: (event) => {
      // A right press is a pan, so the shell must not open its menu over it.
      event.preventDefault()
    },
    onClick: (event) => {
      // A click on the canvas itself is the way out of a pending removal; a
      // click on a card is not, so this reads the target rather than relying on
      // the event having stopped anywhere.
      if (event.target === event.currentTarget) setConfirmRemove(null)
    },
    onDragOver: (event) => { event.preventDefault(); setDropping(true) },
    onDragLeave: () => { setDropping(false) },
    onDrop: (event) => { void dropFiles(event) },
    title: t('zoomHint'),
    style: {
      // The scroller fills the column and is a flex box, so the plane below can
      // centre itself with `margin: auto` — which centres while the plane fits
      // and leaves it scrollable when it does not, unlike
      // `justify-content: center`, which would put the top-left corner of an
      // oversized plane out of reach.
      position: 'absolute', inset: 0, overflow: 'auto',
      display: 'flex', alignItems: 'flex-start',
      cursor: 'default',
      background: dropping
        ? 'color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 8%, transparent)'
        : 'var(--dsw-alias-bg-base, #f7f8fa)',
      outline: dropping ? '1px dashed var(--dsw-alias-brand-primary, #4f6ef7)' : 'none',
      outlineOffset: -6,
    },
  },
  // Three things are drawn: the scrollable extent at the zoomed size, the layer
  // that keeps content coordinates and is scaled about its own origin, and the
  // plane itself inside that layer, so its edge is visible. The extent carries
  // `margin: auto`, which is what keeps the plane in the middle of its column
  // when it fits — at the smallest zoom included.
  h('div', {
    style: {
      position: 'relative',
      margin: 'auto',
      width: CANVAS_BOX.width * zoom + CANVAS_MARGIN * 2,
      height: CANVAS_BOX.height * zoom + CANVAS_MARGIN * 2,
    },
  },
  h('div', {
    style: {
      position: 'absolute', left: layerLeft, top: layerTop,
      width: 0, height: 0,
      transform: `scale(${zoom})`, transformOrigin: '0 0',
    },
  },
  h('div', {
    style: {
      position: 'absolute', left: CANVAS_BOX.left, top: CANVAS_BOX.top,
      width: CANVAS_BOX.width, height: CANVAS_BOX.height,
      background: 'var(--dsw-alias-bg-layer-1, #fff)',
      border: '1px solid var(--dsw-alias-border-l2, #e6e9ef)',
      borderRadius: 8,
    },
  }),
  items.map(itemCard)))),
  // Outside the scroller on purpose: these two say something about the canvas
  // rather than belonging on it, and inside the scroller they would scroll out of
  // sight — the opening view is aimed at the cards, which is not the corner they
  // would be pinned to.
  phase === 'loading' && items.length === 0
    ? h('div', {
      style: {
        position: 'absolute', left: 0, right: 0, top: 18, textAlign: 'center',
        fontSize: 13, color: 'var(--dsw-alias-label-tertiary, #6b7280)',
      },
    }, t('loading'))
    : null,
  phase === 'ready' && items.length === 0
    ? h('div', {
      style: {
        position: 'absolute', left: 0, right: 0, top: 18, textAlign: 'center',
        fontSize: 13, color: 'var(--dsw-alias-label-tertiary, #6b7280)',
      },
    }, t('empty'))
    : null,
  dropping
    ? h('div', {
      style: {
        position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center', fontSize: 12,
        color: 'var(--dsw-alias-brand-primary, #4f6ef7)',
      },
    }, t('dropHint'))
    : null))
}

/** The sidebar row's mark, drawn from the row's own geometry and state. */
function TempSpaceIcon({ size, active }) {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: active ? 2 : 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
  },
  h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
  h('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
  h('path', { d: 'M4 17l5-5 4 4 3-3 4 4' }))
}

/** The name this plugin's bundle is loaded under. */
export const name = 'temp-space-client'

/** Services this half registers into and navigates through. */
export const inject = ['slots', 'layout', 'locale']

/**
 * Register the canvas: its dictionary, its main panel, the sidebar row that
 * selects it, and the service the desktop pet's menu calls.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'temp-space: dictionaries')
  const t = ctx.locale.bind(NS)

  // The page is a global panel of the profile rather than a Session's, which is
  // what lets one canvas be the only canvas: the main column draws one panel at
  // a time, so two views of this space cannot be open at once.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      t,
      load: async () => readJson(await fetch(STATE_PATH, { headers: { accept: 'application/json' } })),
      save: async (items, revision) => readJson(await fetch(STATE_PATH, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision, items }),
      })),
      upload: async (file) => readJson(await fetch(`${BLOB_PATH}?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: file,
      })),
      removeBlob: async (name) => readJson(await fetch(`${BLOB_PATH}?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })),
      gitStatus: async () => readJson(await fetch(GIT_PATH)),
      gitAction: async (action, message) => readJson(await fetch(GIT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, message }),
      })),
    }),
  }, TempSpacePanel))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: () => t('panel'),
    locale: NS,
  }, TempSpaceIcon))

  // The one caller is the desktop pet's menu, which reaches another plugin
  // through the service it provides rather than by importing it.
  ctx.effect(() => {
    const stop = ctx.reflect.provide('tempSpace', {
      open: () => { ctx.layout.selectPanel(PANEL_ID) },
      close: () => { ctx.layout.selectPanel(null) },
      isOpen: () => ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID,
    })
    return () => { void stop() }
  }, 'temp-space: panel service')
}

/**
 * Read one route's JSON answer, turning a transport failure into the same shape
 * the routes use for a refusal, so a caller has one result form to handle.
 * @param response - the fetch response.
 * @returns the parsed body, or a failed result.
 */
async function readJson(response) {
  try {
    return await response.json()
  } catch (error) {
    return { ok: false, reason: 'transport', message: String(error) }
  }
}
