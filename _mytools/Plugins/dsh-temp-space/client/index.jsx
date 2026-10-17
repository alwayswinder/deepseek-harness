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
 * one uploaded file, one unreferenced file removed by the clean-up, the Git
 * operations, showing one stored file in the system file manager, and putting
 * stored files or text on the clipboard. Those bytes are already on the disk of
 * every machine that pulled them, so a card never offers to download them.
 *
 * Cards can be selected, one at a time or by sweeping the canvas, and moved,
 * copied or removed together: the clipboard takes a file list out of the space and
 * brings files in, and a pasted note lands as a card. Every canvas edit is
 * snapshotted, so Ctrl+Z walks back through them; a removal deliberately leaves the
 * file behind so that step can be taken whole, and the header counts those files
 * until they are cleaned up.
 * Saves are debounced rather than batched at close, because a window can be
 * closed without asking the page first, and the revision the host returns is what
 * the next save carries so a second writer is told instead of overwriting the
 * first.
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
const SPACE_PATH = '/api/temp-space/space'
const REVEAL_PATH = '/api/temp-space/reveal'
const CLIPBOARD_PATH = '/api/temp-space/clipboard'

/** How far a press must travel before it counts as a drag rather than a click. */
const DRAG_THRESHOLD = 3

/** How many canvas snapshots Ctrl+Z can walk back through. */
const HISTORY_LIMIT = 50

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

/** One item's box in content coordinates, the way the card is drawn. */
function boxOf(item) {
  const size = defaultSizeOf(item)
  return { x: item.x, y: item.y, w: item.w ?? size.w, h: item.h ?? size.h }
}

/** Whether two content-coordinate boxes overlap at all. */
function overlaps(left, right) {
  return left.x < right.x + right.w && right.x < left.x + left.w
    && left.y < right.y + right.h && right.y < left.y + left.h
}

/** Extensions drawn as a picture rather than as a name. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])

/**
 * Name a clipboard file the browser handed over without one.
 *
 * A screenshot pasted from a snipping tool arrives as a file whose name is empty,
 * and a stored file needs a name: the extension follows the type it declares.
 * @param file - the clipboard file.
 * @returns the same file, or a copy of it carrying a name of its own.
 */
function namedForClipboard(file) {
  const given = typeof file?.name === 'string' ? file.name.trim() : ''
  if (given !== '') return file
  const type = typeof file?.type === 'string' ? file.type : ''
  const extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'bin'
  return new File([file], `clipboard-${Date.now()}.${extension}`, { type })
}

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
  discard: '丢弃',
  working: '正在{action}…',
  refreshed: '已刷新',
  confirmRemove: '再点一次 × 就删掉「{name}」',
  removeConfirm: '确定删除',
  removeCancel: '取消',
  titleHint: '双击标题可以改名字',
  titlePlaceholder: '未命名',
  zoomReset: '回到 100%',
  zoomHint: '滚轮缩放；左键拖空白处框选，右键或中键拖动平移；Delete 删除选中，Ctrl+C/V 复制粘贴，Ctrl+Z 撤回',
  usage: '{used} / {total}',
  fileMissing: '文件不在了',
  revealHint: '拖动可以移动卡片；双击在文件管理器里定位这个文件',
  revealed: '已在文件管理器里定位：{name}',
  remove: '删除',
  selected: '已选 {count} 张卡片：拖动可以一起移动，Delete 删除，Ctrl+Z 撤回',
  removed: '已删除 {count} 张卡片（Ctrl+Z 撤回；字节要等「清理」时才从仓库移除）',
  undone: '已撤回',
  noUndo: '没有可撤回的操作',
  orphans: '{count} 个未引用文件（{size}）',
  clean: '清理',
  confirmClean: '再点一次就删除 {count} 个没有卡片引用的文件（{size}）',
  cleaned: '已清理 {count} 个未引用文件（{size}）；撤销历史已清空',
  confirmDiscard: '再点一次就丢弃这 {count} 处本地改动：工作区回到上次提交，还没提交的文件会被删掉，远端不受影响',
  copyNothing: '没有选中卡片：先点一张或用框选选几张，再按 Ctrl+C',
  copiedFiles: '已把 {count} 个文件放进系统剪贴板，去文件管理器或其他程序里粘贴',
  copiedText: '已把 {count} 张便签的文字放进系统剪贴板',
  copyFailed: '系统剪贴板没有接受：{message}',
  hostStale: '宿主半边还没有这条路由：重启 DSH 之后再试（浏览器半边刷新页面就会更新，宿主不是）',
  hostStaleAction: '宿主半边还不认识「丢弃」这个动作：重启 DSH 之后再试（浏览器半边刷新页面就会更新，宿主不是）',
  pasted: '已从剪贴板存入 {count} 个文件',
  pastedText: '已从剪贴板新建一张便签',
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
  discarded: '已丢弃 {count} 处本地改动，本机已回到上次提交',
  discardedNothing: '和上次提交一致，没有可丢弃的改动',
  failed: '失败：{message}',
  conflict: '这个画布在别处被改过，已重新载入。',
  tooLarge: '单个文件最多 10 MB，这个没存进去。',
  full: '临时空间满了（上限 100 MB），先删掉一些再放。',
  noDir: '找不到临时空间目录 {dir}。在下面选一个目录，拉取远端仓库或直接使用已有仓库。',
  path: '路径',
  pathTitle: '本地仓库',
  pathMissingTitle: '这台机器上还没有临时空间的本地仓库',
  pathMissingBody: '选一个目录：里面已经是从这个项目拉下来的仓库，就直接使用；空目录或新目录，就从远端拉取下来。',
  pathTip: '选一个目录：已经是临时空间的仓库就直接使用；空目录或新目录就从远端拉取。',
  pathCurrent: '当前：{dir}',
  pathPlaceholder: '绝对路径，例如 D:\\AI\\temp-space',
  pathBrowse: '浏览…',
  pathBrowseUnavailable: '这个外壳没有可用的目录选择器，直接把路径粘贴到输入框里。',
  pathUse: '直接使用',
  pathPull: '拉取到此路径',
  pathCancel: '取消',
  pathEmpty: '先填一个本地仓库路径。',
  pathMissing: '这个路径不存在：{dir}',
  pathNotDirectory: '这个路径不是目录：{dir}',
  pathNotRepo: '{dir} 不是 Git 仓库。请选已有的仓库，或换一个空目录再拉取。',
  pathNotEmpty: '这个目录既不是空目录，也不是 Git 仓库：{dir}。请换一个空目录，或选已有的仓库。',
  pathNoParent: '上级目录不存在：{dir}',
  pathNotAbsolute: '请填绝对路径。',
  remoteLabel: '远端仓库地址',
  remotePlaceholder: '拉取新仓库时填写，例如 git@github.com:you/TmpSpace.git',
  remoteHint: '已经有本地仓库时不需要填；拉取成功后会记住。',
  remoteRequired: '拉取新仓库要填远端仓库地址。',
  noGit: '这台机器上没有可用的 git 命令。',
  pathAdopted: '已使用本地仓库：{dir}',
  pathPulled: '已使用并拉取：{dir}',
  pathCloned: '已拉取到：{dir}',
  pathPullFailed: '已使用 {dir}，但拉取失败：{message}',
  pathReset: '已恢复配置里的路径：{dir}',
  pathDefault: '恢复配置路径',
  pathOverride: '这里选的路径只在这台机器上生效，会覆盖插件配置里的 dataDir。',
  hostStaleSpace: '宿主半边还没有路径设置这条路由：重启 DSH 之后再试（浏览器半边刷新页面就会更新，宿主不是）',
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
  discard: 'Discard',
  working: '{action}…',
  refreshed: 'Refreshed',
  confirmRemove: 'Press × again to remove "{name}"',
  removeConfirm: 'Remove',
  removeCancel: 'Cancel',
  titleHint: 'Double-click the title to rename it',
  titlePlaceholder: 'Untitled',
  zoomReset: 'Back to 100%',
  zoomHint: 'Wheel to zoom; left-drag the background to select, right- or middle-drag to pan; Delete removes the selection, Ctrl+C/V copy and paste, Ctrl+Z undoes',
  usage: '{used} / {total}',
  fileMissing: 'File is gone',
  revealHint: 'Drag to move the card; double-click to show the file in the file manager',
  revealed: 'Shown in the file manager: {name}',
  remove: 'Remove',
  selected: '{count} selected: drag to move them together, Delete to remove them, Ctrl+Z to undo',
  removed: 'Removed {count} cards (Ctrl+Z undoes it; the bytes leave the repository at the next clean-up)',
  undone: 'Undone',
  noUndo: 'Nothing to undo',
  orphans: '{count} files nothing points at ({size})',
  clean: 'Clean up',
  confirmClean: 'Press again to delete {count} files no card points at ({size})',
  cleaned: 'Cleaned up {count} unreferenced files ({size}); the undo history is empty now',
  confirmDiscard: 'Press again to discard these {count} local changes: the working tree goes back to the last commit and files that were never committed are deleted; the remote is untouched',
  copyNothing: 'Nothing is selected: click a card or sweep a few, then press Ctrl+C',
  copiedFiles: 'Put {count} files on the system clipboard — paste them in the file manager or another application',
  copiedText: 'Put the text of {count} notes on the system clipboard',
  copyFailed: 'The system clipboard would not take it: {message}',
  hostStale: 'The host half has no such route yet: restart DSH and try again (the browser half updates on a page refresh, the host does not)',
  hostStaleAction: 'The host half does not know this action yet: restart DSH and try again (the browser half updates on a page refresh, the host does not)',
  pasted: 'Stored {count} files from the clipboard',
  pastedText: 'Left a new note holding what the clipboard had',
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
  discarded: 'Discarded {count} local changes; this machine is back at the last commit',
  discardedNothing: 'Already at the last commit, so there is nothing to discard',
  failed: 'Failed: {message}',
  conflict: 'This canvas changed elsewhere; it was reloaded.',
  tooLarge: 'One file may hold at most 10 MB; that one was not stored.',
  full: 'The space is full (100 MB); remove something first.',
  noDir: 'The space directory {dir} is missing. Choose a directory below to pull the remote repository, or to use an existing one.',
  path: 'Path',
  pathTitle: 'Local repository',
  pathMissingTitle: 'This machine has no local space repository yet',
  pathMissingBody: 'Choose a directory: if it already holds this project\'s repository, use it as is; if it is empty or new, the remote is pulled into it.',
  pathTip: 'Choose a directory: an existing space repository is used as is; an empty or new directory is pulled into.',
  pathCurrent: 'Current: {dir}',
  pathPlaceholder: 'An absolute path, for example D:\\AI\\temp-space',
  pathBrowse: 'Browse…',
  pathBrowseUnavailable: 'This shell has no directory picker; paste the path into the field instead.',
  pathUse: 'Use this path',
  pathPull: 'Pull here',
  pathCancel: 'Cancel',
  pathEmpty: 'Enter a local repository path first.',
  pathMissing: 'That path does not exist: {dir}',
  pathNotDirectory: 'That path is not a directory: {dir}',
  pathNotRepo: '{dir} is not a Git repository. Choose an existing repository, or an empty directory to pull into.',
  pathNotEmpty: 'That directory is neither empty nor a Git repository: {dir}. Choose an empty directory, or an existing repository.',
  pathNoParent: 'The parent directory does not exist: {dir}',
  pathNotAbsolute: 'Enter an absolute path.',
  remoteLabel: 'Remote repository URL',
  remotePlaceholder: 'Needed to pull a new repository, for example git@github.com:you/TmpSpace.git',
  remoteHint: 'Not needed when a local repository already exists; it is remembered after a successful pull.',
  remoteRequired: 'A remote repository URL is needed to pull a new repository.',
  noGit: 'No git command is available on this machine.',
  pathAdopted: 'Using the local repository: {dir}',
  pathPulled: 'Using and pulled: {dir}',
  pathCloned: 'Pulled into: {dir}',
  pathPullFailed: 'Using {dir}, but the pull failed: {message}',
  pathReset: 'Back to the configured path: {dir}',
  pathDefault: 'Use configured path',
  pathOverride: 'A path chosen here applies to this machine only and overrides the plugin\'s dataDir.',
  hostStaleSpace: 'The host half has no path route yet: restart DSH and try again (the browser half updates on a page refresh, the host does not)',
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
function TempSpacePanel({ load, save, upload, removeBlob, gitStatus, gitAction, spaceInfo, spaceAction, pickDirectory, reveal, clipboard, t }) {
  const [phase, setPhase] = useState('loading')
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [usage, setUsage] = useState({ usedBytes: 0, maxTotalBytes: 0, maxFileBytes: 0 })
  const [git, setGit] = useState(null)
  /** What the host says about the space directory, whether or not it is usable. */
  const [space, setSpace] = useState(null)
  /** Whether the missing-space notice should be replaced by the path setup. */
  const [needsPath, setNeedsPath] = useState(false)
  /** Whether the path setup is open over a space that is already usable. */
  const [showPath, setShowPath] = useState(false)
  const [pathDraft, setPathDraft] = useState('')
  const [remoteDraft, setRemoteDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [dropping, setDropping] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState(new Set())
  /** The box being swept on the canvas, in content coordinates, or null. */
  const [marquee, setMarquee] = useState(null)
  const [confirmClean, setConfirmClean] = useState(false)
  /** Whether the discard control has been pressed once and is waiting for the second press. */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const revision = useRef(0)
  const itemsRef = useRef([])
  const dirty = useRef(false)
  const timer = useRef()
  const drag = useRef(null)
  const canvas = useRef(null)
  /** Canvas snapshots Ctrl+Z walks back through, oldest first. */
  const history = useRef([])
  /**
   * The note whose typing counts as one undo step. Every keystroke replacing the
   * whole canvas in the history would push the state before one letter, so a
   * note's edits are remembered once per visit to the field.
   */
  const editingNote = useRef(null)
  /** The scaled layer, which is what turns a pointer position into content coordinates. */
  const layer = useRef(null)
  /**
   * Whether the drag in flight began inside the panel.
   *
   * A drag that starts here is a card or a piece of text being moved, never a file
   * arriving from outside — and a browser will happily hand the panel a file for a
   * dragged picture, which would store a second copy of what the space already
   * holds.
   */
  const internalDrag = useRef(false)
  /**
   * The selection as the copy handler sees it, assigned during render the way
   * `latest` is, so a listener registered once still reads the current one.
   */
  const selectedRef = useRef(selected)
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

  /**
   * Keep the canvas as it is now, so Ctrl+Z can come back to it.
   *
   * One entry per gesture, not per pointer move: the whole canvas is snapshotted,
   * and a drag that moved four cards is still one thing the person did. The list
   * of items is flat — every field is a primitive — so a shallow copy of each item
   * is a complete one.
   */
  const remember = useCallback(() => {
    const stack = history.current
    stack.push(itemsRef.current.map(item => ({ ...item })))
    if (stack.length > HISTORY_LIMIT) stack.shift()
  }, [])

  /** Walk one canvas edit back. */
  const undo = useCallback(() => {
    const previous = history.current.pop()
    if (previous === undefined) {
      say(t('noUndo'))
      return
    }
    update(previous)
    // The cards that are back are the only ones still worth having selected.
    const ids = new Set(previous.map(item => item.id))
    setSelected(current => new Set([...current].filter(id => ids.has(id))))
    say(t('undone'))
  }, [say, t, update])

  const refresh = useCallback(async () => {
    setPhase('loading')
    const [state, status, info] = await Promise.all([load(), gitStatus(), spaceInfo()])
    // The directory is reported even when the state route refuses it, which is
    // what lets the setup form show where the configuration points before any
    // path has been chosen.
    if (info !== undefined && info.ok === true) {
      setSpace(info)
      setPathDraft(info.dir ?? '')
      setRemoteDraft(info.repoUrl ?? '')
    }
    if (!state.ok) {
      setPhase('error')
      const pathProblem = state.reason === 'no-dir' || state.reason === 'not-a-repo'
      setNeedsPath(pathProblem)
      say(pathProblem
        ? t('noDir', { dir: state.dir ?? info?.dir ?? state.message ?? '' })
        : t('failed', { message: state.message ?? state.reason }))
      return
    }
    setNeedsPath(false)
    revision.current = state.revision
    itemsRef.current = state.items
    setItems(state.items)
    setFiles(state.files ?? [])
    setUsage(state.usage ?? { usedBytes: 0, maxTotalBytes: 0, maxFileBytes: 0 })
    setGit(status.ok ? status : null)
    dirty.current = false
    setPhase('ready')
  }, [gitStatus, load, say, spaceInfo, t])

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
   * Stored files no card points at any more.
   *
   * Removing a card leaves its bytes alone on purpose — an undo has to find them,
   * and another machine may still be showing the card — so the header tells the
   * truth about them and the clean-up control is where they go.
   */
  const orphans = useMemo(() => {
    const referenced = new Set(items.filter(item => item.kind === 'file').map(item => item.file))
    return files.filter(row => !referenced.has(row.name))
  }, [files, items])
  const orphanBytes = useMemo(() => orphans.reduce((total, row) => total + row.bytes, 0), [orphans])

  /**
   * The selection one card press asks for.
   *
   * A press does not change the selection on its own: it becomes a click or a
   * drag first, and a drag of an unselected card has to be able to select the card
   * it moved without the press having cleared everything else under it.
   * @param change - the card, and how the press asked for it.
   */
  const applySelection = useCallback((change) => {
    setSelected(current => {
      const next = new Set(change.mode === 'only' ? [] : current)
      if (change.mode === 'toggle' && next.has(change.id)) next.delete(change.id)
      else next.add(change.id)
      return next
    })
  }, [])

  /** Select every card on the canvas. */
  const selectAll = useCallback(() => {
    const ids = itemsRef.current.map(item => item.id)
    setSelected(new Set(ids))
    say(t('selected', { count: ids.length }))
  }, [say, t])

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
    remember()
    update([...base, item])
    setFiles(rows => [...rows, { name: result.name, bytes: result.bytes }])
    setUsage(current => ({ ...current, usedBytes: current.usedBytes + result.bytes }))
  }, [remember, say, t, update, upload])

  const dropFiles = useCallback(async (event) => {
    event.preventDefault()
    setDropping(false)
    const transfer = event.dataTransfer
    // Only a drag from outside carries files. What a browser hands over for an
    // element dragged within the page looks the same otherwise, and importing it
    // would store a copy of something the space already holds.
    const carriesFiles = Array.from(transfer?.types ?? []).includes('Files')
    const dropped = carriesFiles ? Array.from(transfer?.files ?? []) : []
    if (dropped.length === 0) return
    setBusy('drop')
    for (const file of dropped) await store(file)
    setBusy('')
  }, [store])

  /**
   * Leave a note where the next free slot is.
   * @param text - what the note starts out holding.
   */
  const addNote = useCallback((text) => {
    const base = itemsRef.current
    remember()
    update([...base, {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'text',
      text,
      x: 32 + (base.length % 6) * 28,
      y: 32 + (base.length % 6) * 26,
      w: DEFAULT_SIZE.text.w,
      h: DEFAULT_SIZE.text.h,
      z: base.reduce((top, row) => Math.max(top, row.z), 0) + 1,
    }])
  }, [remember, update])

  /** Leave an empty note: what the "+ 文字" control does. */
  const addText = useCallback(() => { addNote('') }, [addNote])

  /**
   * Take whatever the system clipboard holds.
   *
   * A file copied in the file manager, or a screenshot, arrives as a file and is
   * stored the way a dropped one is; plain text becomes a note holding it. A field
   * that can be typed in keeps its own paste — the same guard Delete and Ctrl+Z
   * use — so pasting into a note is still the browser's text paste.
   * @param event - the paste event.
   */
  const pasteFromClipboard = useCallback((event) => {
    const target = event.target
    const tag = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : ''
    if (tag === 'TEXTAREA' || tag === 'INPUT' || target?.isContentEditable === true) return
    const data = event.clipboardData
    const listed = Array.from(data?.items ?? [])
      .filter(entry => entry.kind === 'file')
      .map(entry => (typeof entry.getAsFile === 'function' ? entry.getAsFile() : entry))
      .filter(file => file !== null && file !== undefined)
    // A browser that lists pasted files only in `files` gets the same treatment.
    const pasted = listed.length > 0 ? listed : Array.from(data?.files ?? [])
    if (pasted.length > 0) {
      event.preventDefault()
      guard(async () => {
        setBusy('paste')
        for (const file of pasted) await store(namedForClipboard(file))
        setBusy('')
        say(t('pasted', { count: pasted.length }))
      })
      return
    }
    const text = typeof data?.getData === 'function' ? data.getData('text/plain') : ''
    if (typeof text !== 'string' || text === '') return
    event.preventDefault()
    addNote(text)
    say(t('pastedText'))
  }, [addNote, guard, say, store, t])

  /**
   * Put the selection on the system clipboard.
   *
   * A selection holding stored files goes out as a file list, which is what makes
   * it pasteable in the file manager or in another application; a selection of
   * notes goes out as their text. A page can read that list but cannot write one,
   * so the host does it, and either answer is reported.
   */
  const copyToClipboard = useCallback(() => {
    const chosen = itemsRef.current.filter(item => selected.has(item.id))
    if (chosen.length === 0) {
      say(t('copyNothing'))
      return
    }
    const fileNames = chosen.filter(item => item.kind === 'file').map(item => item.file)
    guard(async () => {
      const result = fileNames.length > 0
        ? await clipboard({ names: fileNames })
        : await clipboard({ text: chosen.map(item => item.text ?? '').join('\n\n') })
      if (result.ok) {
        say(fileNames.length > 0
          ? t('copiedFiles', { count: fileNames.length })
          : t('copiedText', { count: chosen.length }))
        return
      }
      // The host half is loaded once, when DSH starts, so a route added to it since
      // then answers with the web server's own 404 page rather than this plugin's
      // JSON: that is a restart, not a broken clipboard.
      say(result.reason === 'transport' && result.status === 404 ? t('hostStale')
        : result.reason === 'unsupported' ? t('copyFailed', { message: result.message ?? result.reason })
          : t('failed', { message: result.message ?? result.reason }))
    })
  }, [clipboard, guard, say, selected, t])

  const patch = useCallback((id, fields) => {
    update(itemsRef.current.map(item => (item.id === id ? { ...item, ...fields } : item)))
  }, [update])

  /**
   * Type in one note.
   *
   * A note is written letter by letter, and remembering the canvas at each of
   * them would fill the history with the states between two keystrokes; one entry
   * per visit to the field is what a person means by "undo my edit".
   * @param id - the note's item id.
   * @param text - the text the field now holds.
   */
  const patchText = useCallback((id, text) => {
    if (editingNote.current !== id) {
      remember()
      editingNote.current = id
    }
    patch(id, { text })
  }, [patch, remember])

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
    remember()
    patch(id, { title: trimmed })
  }, [draft, editing, patch, remember])

  /**
   * Take cards off the canvas.
   *
   * Their bytes stay where they are. A card that comes back through Ctrl+Z has to
   * find its file, and the other machine may still be showing it — so a removal is
   * a canvas edit, and the files nothing points at any more are counted in the
   * header and removed by the clean-up control.
   * @param list - the cards to remove.
   */
  const dropItems = useCallback((list) => {
    if (list.length === 0) return
    remember()
    const ids = new Set(list.map(item => item.id))
    update(itemsRef.current.filter(item => !ids.has(item.id)))
    setConfirmRemove(null)
    setEditing(null)
    setSelected(current => new Set([...current].filter(id => !ids.has(id))))
    say(t('removed', { count: list.length }))
  }, [remember, say, t, update])

  /** Remove every selected card: the Delete key and the × both end here. */
  const deleteSelection = useCallback(() => {
    dropItems(itemsRef.current.filter(item => selected.has(item.id)))
  }, [dropItems, selected])

  /**
   * Delete the stored files no card points at any more.
   *
   * They cannot come back afterwards, so this asks first and empties the undo
   * history with them: a snapshot that still holds a card for a deleted file would
   * otherwise restore a card that says its file is gone.
   */
  const cleanOrphans = useCallback(async () => {
    if (orphans.length === 0) return
    if (!confirmClean) {
      setConfirmClean(true)
      say(t('confirmClean', { count: orphans.length, size: formatBytes(orphanBytes) }))
      return
    }
    setConfirmClean(false)
    const removed = []
    let failure = ''
    for (const row of orphans) {
      const result = await removeBlob(row.name)
      if (!result.ok) {
        failure = result.message ?? result.reason
        break
      }
      removed.push(row)
    }
    if (removed.length > 0) {
      const names = new Set(removed.map(row => row.name))
      const freed = removed.reduce((total, row) => total + row.bytes, 0)
      setFiles(rows => rows.filter(row => !names.has(row.name)))
      setUsage(current => ({ ...current, usedBytes: Math.max(0, current.usedBytes - freed) }))
      history.current = []
    }
    if (failure !== '') {
      say(t('failed', { message: failure }))
      return
    }
    say(t('cleaned', { count: removed.length, size: formatBytes(orphanBytes) }))
  }, [confirmClean, orphanBytes, orphans, removeBlob, say, t])

  /**
   * Show one card's file where it already lies.
   *
   * The page has no file manager of its own, so the host starts one on the file
   * it already serves; a card whose file is gone says that, rather than asking
   * the host to reveal a path that is not there.
   * @param item - the card that was double-clicked.
   */
  const revealItem = useCallback((item) => {
    if (item.kind !== 'file') return
    if (!present.has(item.file)) { say(t('fileMissing')); return }
    guard(async () => {
      const result = await reveal(item.file)
      say(result.ok
        ? t('revealed', { name: item.file })
        : t('failed', { message: result.message ?? result.reason }))
    })
  }, [guard, present, reveal, say, t])

  /**
   * Raise cards above the others, so a dragged card is not covered.
   *
   * A group keeps the order it had among itself: cards moved together should not
   * shuffle in front of each other. The whole canvas is written back once, since a
   * set of new heights is one edit.
   * @param ids - the cards to raise.
   */
  const raiseMany = useCallback((ids) => {
    const chosen = new Set(ids)
    const top = itemsRef.current.reduce((highest, row) => Math.max(highest, row.z), 0)
    const raised = new Map(itemsRef.current
      .filter(row => chosen.has(row.id))
      .sort((left, right) => left.z - right.z)
      .map((row, index) => [row.id, top + 1 + index]))
    if (raised.size === 0) return
    update(itemsRef.current.map(row => (raised.has(row.id) ? { ...row, z: raised.get(row.id) } : row)))
  }, [update])

  /**
   * Move cards by one travel, in content coordinates.
   * @param starts - the cards and the positions they started from.
   * @param dx - horizontal travel.
   * @param dy - vertical travel.
   */
  const moveMany = useCallback((starts, dx, dy) => {
    const moved = new Map(starts.map(start => [start.id, {
      x: Math.round(start.x + dx),
      y: Math.round(start.y + dy),
    }]))
    update(itemsRef.current.map(row => (moved.has(row.id) ? { ...row, ...moved.get(row.id) } : row)))
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

  /**
   * The content point under a pointer event.
   *
   * Measured from the scaled layer rather than from the scroller: the layer's own
   * rectangle already accounts for the plane's size, the scroll offset, and the
   * room an auto margin adds when the plane is smaller than the column.
   * @param event - the pointer event to place.
   * @returns the point in content coordinates.
   */
  const layerPoint = useCallback((event) => {
    const rect = layer.current?.getBoundingClientRect?.()
    const scale = zoomRef.current
    if (rect === undefined || scale <= 0) return { x: 0, y: 0 }
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }
  }, [])

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
    if (held.kind === 'marquee') {
      if (!held.moved) {
        // The same threshold a card drag uses: a left press on the background that
        // has not travelled is a click there, and a click there drops the selection.
        if (Math.abs(event.clientX - held.originX) < DRAG_THRESHOLD
          && Math.abs(event.clientY - held.originY) < DRAG_THRESHOLD) return
        held.moved = true
      }
      const point = layerPoint(event)
      const box = {
        x: Math.min(held.start.x, point.x),
        y: Math.min(held.start.y, point.y),
        w: Math.abs(point.x - held.start.x),
        h: Math.abs(point.y - held.start.y),
      }
      setMarquee(box)
      // The sweep selects as it goes, so what is about to be taken is visible
      // before the pointer is let go.
      const swept = itemsRef.current.filter(item => overlaps(boxOf(item), box)).map(item => item.id)
      held.chosen = [...new Set([...held.base, ...swept])]
      setSelected(new Set(held.chosen))
      return
    }
    // Cards are moved by how far the pointer travelled, not by where it landed:
    // content coordinates are the starting position plus that travel over the
    // zoom, and nothing about the canvas's own layout — the margin, the plane, the
    // opening view — enters the answer. A group moves rigidly: the travel it takes
    // is the one its most constrained card allows, so the distances between the
    // cards do not change and none of them is pushed out of the plane.
    const scale = zoomRef.current
    const travel = {
      x: (event.clientX - held.originX) / scale,
      y: (event.clientY - held.originY) / scale,
    }
    if (!held.moved) {
      // A press that has not travelled is a click, and a click on the title or
      // on the remove control has to reach it: nothing moves until the pointer
      // has gone far enough to mean a drag.
      if (Math.abs(travel.x) < DRAG_THRESHOLD && Math.abs(travel.y) < DRAG_THRESHOLD) return
      held.moved = true
      // A drag of a card outside the selection takes the selection with it; one of
      // a card already inside it must leave the rest chosen, or dragging a group
      // would dissolve it before it moved. A click, which never travels, still
      // collapses the selection onto the card it landed on.
      if (!held.group) applySelection(held.select)
      remember()
      raiseMany(held.ids)
    }
    moveMany(
      held.starts,
      Math.min(held.bounds.maxX, Math.max(held.bounds.minX, travel.x)),
      Math.min(held.bounds.maxY, Math.max(held.bounds.minY, travel.y)),
    )
  }, [applySelection, layerPoint, moveMany, raiseMany, remember])

  const stopDrag = useCallback(() => {
    const held = drag.current
    drag.current = null
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
    if (held === null) return
    if (held.kind === 'marquee') {
      setMarquee(null)
      // A sweep has already selected what it covered; a left press on the
      // background that never swept is a click there, which drops the selection.
      if (!held.moved) {
        setSelected(new Set())
        return
      }
      // The sweep says what it took: a selection that shows only as a border is
      // easy to miss, and the count is what Delete is about to act on.
      const taken = held.chosen ?? []
      if (taken.length > 0) say(t('selected', { count: taken.length }))
      return
    }
    // A card pressed and not moved is a click on it: that, and only that, is how
    // the selection changes on a press.
    if (held.kind === 'card' && !held.moved) applySelection(held.select)
  }, [applySelection, onWindowMove, say, t])

  /**
   * Begin a possible drag of one card.
   *
   * The pointer is not captured and nothing is prevented: capture would deliver
   * the following click to the header itself, so the title and the remove control
   * inside it would never see one. The move and up handlers live on the window
   * instead, which is what keeps a drag that leaves the card alive.
   *
   * Which cards this drag can move is decided here, while the pointer is still
   * down: a press on a card that is already part of the selection moves the whole
   * selection, and a press on any other card moves that card alone.
   * @param event - the pointerdown that started it.
   * @param item - the card under the pointer.
   */
  const startDrag = useCallback((event, item) => {
    if (event.button !== 0) return
    const additive = event.ctrlKey === true || event.metaKey === true
    const range = event.shiftKey === true
    const inSelection = selected.has(item.id)
    const group = inSelection && !additive && !range
    const ids = group ? [...selected] : [item.id]
    const chosen = new Set(ids)
    const starts = itemsRef.current.filter(row => chosen.has(row.id)).map(row => ({ id: row.id, ...boxOf(row) }))
    drag.current = {
      kind: 'card',
      id: item.id,
      moved: false,
      ids,
      starts,
      // The travel every card of the group can take together. Computed once, from
      // where the cards are, because a drag never changes how big anything is.
      bounds: {
        minX: Math.max(...starts.map(start => -CANVAS_HALF_WIDTH - start.x)),
        maxX: Math.min(...starts.map(start => CANVAS_HALF_WIDTH - start.w - start.x)),
        minY: Math.max(...starts.map(start => -CANVAS_HALF_HEIGHT - start.y)),
        maxY: Math.min(...starts.map(start => CANVAS_HALF_HEIGHT - start.h - start.y)),
      },
      // Whether this press is already part of a group drag: a press on a card the
      // selection holds moves all of it, and the click below would otherwise
      // collapse the selection onto the one under the pointer.
      group,
      select: { id: item.id, mode: additive ? 'toggle' : range ? 'add' : 'only' },
      originX: event.clientX, originY: event.clientY,
    }
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }, [onWindowMove, selected, stopDrag])

  /**
   * Begin sweeping the canvas for cards.
   *
   * A left press on the background draws a box and takes every card it covers; a
   * modifier adds to the selection instead of replacing it. This is why the left
   * button no longer pans: the plane is covered in cards, and a sweep has to be
   * able to start anywhere on it, so panning kept the right and middle buttons.
   * @param event - the pointerdown that started it.
   */
  const startMarquee = useCallback((event) => {
    const additive = event.ctrlKey === true || event.metaKey === true || event.shiftKey === true
    const start = layerPoint(event)
    // The sweep crosses cards, and a browser would spend the drag selecting their
    // text instead of drawing the box. This is the default action, not the click:
    // a click still reaches the canvas below.
    event.preventDefault()
    drag.current = {
      kind: 'marquee',
      moved: false,
      start,
      base: additive ? new Set(selected) : new Set(),
      originX: event.clientX, originY: event.clientY,
    }
    setMarquee({ x: start.x, y: start.y, w: 0, h: 0 })
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
  }, [layerPoint, onWindowMove, selected, stopDrag])

  /**
   * Begin dragging the view itself.
   *
   * The wheel zooms and the left button sweeps for cards, so the view moves on the
   * middle and right buttons. The right one works from wherever it is pressed,
   * cards included — a canvas covered in cards has no background left to aim at.
   * @param event - the pointerdown that started it.
   */
  const startPan = useCallback((event) => {
    if (event.button !== 1 && event.button !== 2) return
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

  /**
   * Whether a press landed on the canvas rather than on a card.
   *
   * The plane and the layer under the cards are part of the canvas, so this asks
   * about cards rather than about the pressed element being the scroller itself. A
   * harness that hands over an event with no DOM node behind it means the canvas.
   * @param event - the pointer event to classify.
   * @returns whether the press is a press on the canvas.
   */
  const isCanvasBackground = useCallback((event) => {
    if (event.target === event.currentTarget) return true
    const target = event.target
    if (typeof target?.closest !== 'function') return false
    return target.closest('[data-card]') === null
  }, [])

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
    say(t('working', { action: t(name) }))
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
      : name === 'discard'
        ? (result) => {
          if (!result.ok) {
            // A host half that predates this action says so by name; the generic
            // failure line would read as this plugin being broken rather than as
            // the half that needs restarting.
            return result.reason === 'unknown-action'
              ? t('hostStaleAction')
              : t('failed', { message: result.message ?? result.reason })
          }
          // The host counts what actually went, which is what makes the answer
          // truthful when the working tree had nothing left to discard.
          return result.discarded === 0
            ? t('discardedNothing')
            : t('discarded', { count: result.discarded })
        }
        : (result) => (result.ok ? t('pulled') : t('failed', { message: result.message ?? result.reason }))
    const result = await run(name, () => gitAction(name, ''), describe)
    if (result.ok) await refresh()
    return result
  }, [gitAction, refresh, run, say, t])

  /**
   * Throw away every local change, which is the way back from a canvas someone
   * changed and does not want.
   *
   * It cannot be undone, so it asks first, the way the clean-up does. The pending
   * write is cancelled rather than flushed — a save here would put back the very
   * canvas the host is about to reset — and the undo history goes with it, since
   * a snapshot would restore cards whose bytes the discard removed.
   */
  const discardChanges = useCallback(async () => {
    const changes = git?.changes ?? 0
    // Something to discard is what makes the second press worth asking for: with
    // a clean tree the answer is the same either way, so it is given at once.
    if (!confirmDiscard && changes > 0) {
      setConfirmDiscard(true)
      setConfirmClean(false)
      say(t('confirmDiscard', { count: changes }))
      return
    }
    setConfirmDiscard(false)
    clearTimeout(timer.current)
    const result = await act('discard')
    if (result.ok) {
      history.current = []
      setSelected(new Set())
      return
    }
    // A discard that failed moved nothing, so the write it paused goes back to
    // disk on the usual delay: the canvas on screen is still the person's.
    if (dirty.current) timer.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
  }, [act, confirmDiscard, flush, git, say, t])

  /** Reload both halves of the header, and say that it happened. */
  const reload = useCallback(async () => {
    await refresh()
    say(t('refreshed'))
  }, [refresh, say, t])

  /** Name the reason a path was refused, rather than showing a raw code. */
  const pathFailure = useCallback((result, dir) => {
    if (result.reason === 'invalid-path') return t('pathNotAbsolute')
    if (result.reason === 'no-dir') return t('pathMissing', { dir: result.dir ?? dir })
    if (result.reason === 'not-a-directory') return t('pathNotDirectory', { dir: result.dir ?? dir })
    if (result.reason === 'not-a-repo') return t('pathNotRepo', { dir: result.dir ?? dir })
    if (result.reason === 'dir-not-empty') return t('pathNotEmpty', { dir: result.dir ?? dir })
    if (result.reason === 'no-parent') return t('pathNoParent', { dir: result.dir ?? dir })
    if (result.reason === 'no-repo-url') return t('remoteRequired')
    if (result.reason === 'no-git') return t('noGit')
    return t('failed', { message: result.message ?? result.reason })
  }, [t])

  /**
   * Adopt a path, or pull a repository into one.
   *
   * `pull` is the one control that does two things because the person does one:
   * a directory that already holds the repository is adopted and pulled, and a
   * missing or empty one is cloned. `use` never reaches the network, which is
   * the way to point the page at a checkout that is already right.
   * @param action - `pull`, `use`, or `reset`.
   */
  const applyPath = useCallback(async (action) => {
    const dir = pathDraft.trim()
    if (action !== 'reset' && dir === '') { say(t('pathEmpty')); return }
    setBusy('path')
    say(t('working', { action: action === 'use' ? t('pathUse') : action === 'reset' ? t('pathDefault') : t('pathPull') }))
    try {
      const result = await spaceAction(
        action,
        action === 'reset' ? '' : dir,
        // The URL field belongs to pulling a new clone; adopting a checkout
        // keeps whatever remote it already has (or learns it from that remote).
        action === 'pull' ? remoteDraft.trim() : '',
      )
      if (result.reason === 'transport') {
        say(result.status === 404
          ? t('hostStaleSpace')
          : t('failed', { message: result.message ?? result.reason }))
        return
      }
      if (result.ok) {
        await refresh()
        setShowPath(false)
        if (result.mode === 'reset') say(t('pathReset', { dir: result.dir ?? '' }))
        else if (result.mode === 'cloned') say(t('pathCloned', { dir: result.dir ?? dir }))
        else if (result.mode === 'pulled') say(t('pathPulled', { dir: result.dir ?? dir }))
        else say(t('pathAdopted', { dir: result.dir ?? dir }))
        return
      }
      if (result.connected === true) {
        // The repository is usable even though the network half failed; draw it
        // and keep the failure as its own sentence rather than hiding either.
        await refresh()
        setShowPath(false)
        say(t('pathPullFailed', { dir: result.dir ?? dir, message: result.message ?? result.reason }))
        return
      }
      say(pathFailure(result, dir))
    } finally {
      setBusy('')
    }
  }, [pathDraft, pathFailure, refresh, remoteDraft, say, spaceAction, t])

  /** Ask the shell's directory picker, when this profile has one. */
  const browsePath = useCallback(() => {
    guard(async () => {
      const picked = await pickDirectory()
      if (typeof picked === 'string' && picked !== '') setPathDraft(picked)
      else if (picked === undefined) say(t('pathBrowseUnavailable'))
    })
  }, [guard, pickDirectory, say, t])

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

  const button = (label, onClick, disabled, title) => h('button', {
    type: 'button',
    onClick,
    disabled: disabled === true || busy !== '',
    title,
    style: {
      font: 'inherit', cursor: 'pointer', height: 28, padding: '0 12px', borderRadius: 999, fontSize: 13,
      border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
      background: 'var(--dsw-alias-bg-layer-1, #fff)',
      color: 'var(--dsw-alias-label-primary, inherit)',
    },
  }, label)

  /**
   * The local-repository path setting.
   *
   * It is drawn twice on purpose: as the only content when the space is missing
   * (there is nothing else to do), and as a fold-out above the canvas when the
   * space works but the path is the wrong one. Both write the same state, and
   * both explain why the current path is not usable.
   * @returns the setup block.
   */
  const pathSettings = () => {
    const current = space?.dir ?? pathDraft
    return h('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: needsPath ? '24px 28px' : '12px 14px',
        maxWidth: needsPath ? 720 : undefined,
        margin: needsPath ? '40px auto 0' : undefined,
        borderBottom: '1px solid var(--dsw-alias-border-l2, #eef1f5)',
      },
    },
    h('strong', { style: { fontSize: 14 } },
      needsPath ? t('pathMissingTitle') : t('pathTitle')),
    h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #4b5563)' } },
      needsPath ? t('pathMissingBody') : t('pathTip')),
    current === ''
      ? null
      : h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)', wordBreak: 'break-all' } },
        t('pathCurrent', { dir: current })),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
      h('input', {
        value: pathDraft,
        onChange: (event) => { setPathDraft(event.target.value) },
        placeholder: t('pathPlaceholder'),
        spellCheck: false,
        'aria-label': t('pathTitle'),
        style: {
          flex: '1 1 320px', minWidth: 0, height: 28, padding: '0 10px', font: 'inherit', fontSize: 13,
          border: '1px solid var(--dsw-alias-border-l2, #d9dde6)', borderRadius: 8,
          background: 'var(--dsw-alias-bg-layer-1, #fff)',
          color: 'var(--dsw-alias-label-primary, inherit)',
        },
      }),
      pickDirectory === undefined
        ? null
        : button(t('pathBrowse'), browsePath, false)),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
      h('input', {
        value: remoteDraft,
        onChange: (event) => { setRemoteDraft(event.target.value) },
        placeholder: t('remotePlaceholder'),
        spellCheck: false,
        'aria-label': t('remoteLabel'),
        style: {
          flex: '1 1 320px', minWidth: 0, height: 28, padding: '0 10px', font: 'inherit', fontSize: 13,
          border: '1px solid var(--dsw-alias-border-l2, #d9dde6)', borderRadius: 8,
          background: 'var(--dsw-alias-bg-layer-1, #fff)',
          color: 'var(--dsw-alias-label-primary, inherit)',
        },
      })),
    h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' } }, t('remoteHint')),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
      button(t('pathPull'), () => { guard(() => applyPath('pull')) }, false),
      button(t('pathUse'), () => { guard(() => applyPath('use')) }, false),
      needsPath ? null : button(t('pathCancel'), () => { setShowPath(false) }, false),
      space?.override === true
        ? button(t('pathDefault'), () => { guard(() => applyPath('reset')) }, false)
        : null),
    h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' } }, t('pathOverride')))
  }

  const itemCard = (item) => {
    const missing = item.kind === 'file' && !present.has(item.file)
    const size = defaultSizeOf(item)
    const chosen = selected.has(item.id)
    return h('div', {
      key: item.id,
      // Read by the canvas press handler to tell a card from the background: the
      // plane and the layer are pressed through, and both belong to the canvas.
      'data-card': item.id,
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
        border: `1px solid ${chosen ? 'var(--dsw-alias-brand-primary, #4f6ef7)' : 'var(--dsw-alias-border-l2, #d9dde6)'}`,
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        boxShadow: chosen
          ? '0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 35%, transparent)'
          : '0 2px 10px rgba(15, 23, 42, .08)',
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
          onClick: () => { dropItems([item]) },
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
        // Typing in a note is one undo step per visit to the field, not one per
        // keystroke: the focus is what marks the visit.
        onFocus: () => { editingNote.current = item.id },
        onBlur: () => { editingNote.current = null },
        onChange: event => { patchText(item.id, event.target.value) },
        style: {
          flex: '1 1 auto', minHeight: 0, resize: 'none', border: 'none', outline: 'none',
          padding: '8px 10px', font: 'inherit', fontSize: 13, lineHeight: 1.5, background: 'transparent',
          color: 'var(--dsw-alias-label-primary, inherit)',
        },
      })
      : h('div', {
        // The body moves the card the way the title bar does — a picture is the
        // obvious thing to grab — and keeps its own double-click for showing the
        // file where it lies.
        onPointerDown: event => { startDrag(event, item) },
        onDoubleClick: () => { revealItem(item) },
        title: t('revealHint'),
        style: {
          flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', gap: 8, padding: 8,
          cursor: 'grab', touchAction: 'none', userSelect: 'none',
        },
      },
      !missing && isImage(item.file)
        ? h('img', {
          src: blobUrl(item.file),
          alt: titleOf(item),
          // A picture is draggable by default, and dragging one starts a browser
          // drag that offers the canvas a file: letting go over the canvas then
          // stored a second copy of a picture the space already had.
          draggable: false,
          style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 },
        })
        : h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #6b7280)' } },
          // A card renamed by hand still has to say which file it holds.
          missing
            ? `${item.file} — ${t('fileMissing')}`
            : `${titleOf(item) === item.file ? '' : `${item.file} · `}${files.find(row => row.name === item.file)?.bytes ?? 0} B`)))
  }

  // The keyboard belongs to the canvas unless a field is being typed in: Delete in
  // a note is a character, and Ctrl+Z there is the browser's own text undo. The
  // panel is the main column, so the window is the one place that sees these
  // whatever inside the panel has the focus.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const tag = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : ''
      if (tag === 'TEXTAREA' || tag === 'INPUT' || target?.isContentEditable === true) return
      const primary = event.ctrlKey === true || event.metaKey === true
      if (primary && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        undo()
        return
      }
      if (primary && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault()
        selectAll()
        return
      }
      if (primary && (event.key === 'c' || event.key === 'C')) {
        event.preventDefault()
        copyToClipboard()
        return
      }
      // Backspace removes the selection as well: a keyboard without a Delete key
      // is common enough that the two are one gesture here.
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelection()
        return
      }
      if (event.key === 'Escape') setSelected(new Set())
    }
    // Copying is also what the browser's own copy command asks for. Handling that
    // as well means Ctrl+C still reaches the clipboard if anything upstream claims
    // the keydown: the keydown path cancels the default action, so only one of the
    // two ever runs.
    const onCopy = (event) => {
      const target = event.target
      const tag = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : ''
      if (tag === 'TEXTAREA' || tag === 'INPUT' || target?.isContentEditable === true) return
      // With no card selected this is somebody copying text the normal way.
      if (selectedRef.current.size === 0) return
      event.preventDefault()
      copyToClipboard()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', pasteFromClipboard)
    window.addEventListener('copy', onCopy)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', pasteFromClipboard)
      window.removeEventListener('copy', onCopy)
    }
  }, [copyToClipboard, deleteSelection, pasteFromClipboard, selectAll, undo])

  // Assigned in the render body, after every callback it carries is defined —
  // the mount effect reaches for these on its first run and cannot wait for an
  // effect of its own to have run first.
  latest.current = { flush, refresh, stopDrag }
  // The copy handler asks whether anything is selected without re-registering
  // itself on every selection change.
  selectedRef.current = selected

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
  // Cards that were removed leave their bytes behind, so the header says how many
  // and offers to take them out of the repository. Nothing counts as saved while
  // they are there, and nothing else in the panel would tell the person.
  orphans.length === 0
    ? null
    : h('button', {
      type: 'button',
      onClick: () => { guard(() => cleanOrphans()) },
      style: {
        font: 'inherit', cursor: 'pointer', height: 24, padding: '0 10px', borderRadius: 999, fontSize: 12,
        border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
        background: confirmClean ? 'var(--dsw-alias-state-danger-primary, #d9534f)' : 'var(--dsw-alias-bg-layer-1, #fff)',
        color: confirmClean ? '#fff' : 'var(--dsw-alias-label-secondary, #4b5563)',
      },
    }, `${t('orphans', { count: orphans.length, size: formatBytes(orphanBytes) })} · ${t('clean')}`),
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
  // The one control that throws local work away, so it turns into the danger
  // colour while it is waiting for the second press that confirms it. Nothing
  // here reaches the remote.
  h('button', {
    type: 'button',
    onClick: () => { guard(() => discardChanges()) },
    disabled: busy !== '',
    style: {
      font: 'inherit', cursor: 'pointer', height: 28, padding: '0 12px', borderRadius: 999, fontSize: 13,
      border: '1px solid var(--dsw-alias-border-l2, #d9dde6)',
      background: confirmDiscard ? 'var(--dsw-alias-state-danger-primary, #d9534f)' : 'var(--dsw-alias-bg-layer-1, #fff)',
      color: confirmDiscard ? '#fff' : 'var(--dsw-alias-label-primary, inherit)',
    },
  }, t('discard')),
  button(t('path'), () => { setShowPath(value => !value) }, false, t('pathTitle')),
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
  // The path setting takes the whole column when the space is missing: there is
  // no canvas to draw and nowhere else to say what to do about it.
  (showPath || needsPath) ? pathSettings() : null,
  needsPath
    ? null
    : h('div', {
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
      if (!isCanvasBackground(event)) return
      if (event.button === 1) {
        event.preventDefault()
        startPan(event)
        return
      }
      // The left button sweeps the canvas for cards; on a card it is that card's
      // own drag.
      if (event.button === 0) startMarquee(event)
    },
    onContextMenu: (event) => {
      // A right press is a pan, so the shell must not open its menu over it.
      event.preventDefault()
    },
    onClick: (event) => {
      // A click on the canvas itself is the way out of a pending removal, out of
      // a pending clean-up, and out of a pending discard; a click on a card is
      // not, so this reads the target rather than relying on the event having
      // stopped anywhere.
      if (!isCanvasBackground(event)) return
      setConfirmRemove(null)
      setConfirmClean(false)
      setConfirmDiscard(false)
    },
    // A drag that began inside the panel — a card, a note's selected text — is not
    // a file arriving: refusing it here keeps the drop hint away and stops the
    // browser offering the canvas as a drop target for it at all.
    onDragStart: () => { internalDrag.current = true },
    onDragEnd: () => { internalDrag.current = false; setDropping(false) },
    onDragOver: (event) => {
      if (internalDrag.current) return
      event.preventDefault()
      setDropping(true)
    },
    onDragLeave: () => { setDropping(false) },
    onDrop: (event) => {
      const internal = internalDrag.current
      internalDrag.current = false
      if (internal) {
        setDropping(false)
        return
      }
      void dropFiles(event)
    },
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
    ref: layer,
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
  // The sweep is drawn in content coordinates, inside the scaled layer, so it
  // covers exactly the cards it takes. Its border is divided by the zoom because
  // the layer scales: at 300% a plain 1px edge would be three pixels wide.
  marquee === null
    ? null
    : h('div', {
      style: {
        position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h,
        border: `${1 / zoom}px solid var(--dsw-alias-brand-primary, #4f6ef7)`,
        borderRadius: 2 / zoom,
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 12%, transparent)',
        pointerEvents: 'none',
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
      spaceInfo: async () => readJson(await fetch(SPACE_PATH, { headers: { accept: 'application/json' } })),
      spaceAction: async (action, dir, repoUrl) => readJson(await fetch(SPACE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, dir, repoUrl }),
      })),
      // The picker belongs to the shell, and a profile without the workspace UI
      // simply has none: the path field stays typeable either way.
      pickDirectory: async () => {
        const workspace = ctx.get('uiWorkspace')
        if (workspace === undefined || typeof workspace.pickDirectory !== 'function') return undefined
        return workspace.pickDirectory()
      },
      reveal: async (name) => readJson(await fetch(REVEAL_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })),
      clipboard: async (payload) => readJson(await fetch(CLIPBOARD_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
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
    // The status is carried out with the failure: a route this host does not have
    // yet answers with a page rather than JSON, and that is a fact worth saying.
    return { ok: false, reason: 'transport', status: response.status, message: String(error) }
  }
}
