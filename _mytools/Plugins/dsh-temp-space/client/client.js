window.__ModuleLoader__.load({
  id: "@local/dsh-temp-space",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var NS = "temp-space";
var PANEL_ID = "temp-space";
var STATE_PATH = "/api/temp-space/state";
var BLOB_PATH = "/api/temp-space/blob";
var GIT_PATH = "/api/temp-space/git";
var REVEAL_PATH = "/api/temp-space/reveal";
var CLIPBOARD_PATH = "/api/temp-space/clipboard";
var DRAG_THRESHOLD = 3;
var HISTORY_LIMIT = 50;
var SAVE_DEBOUNCE_MS = 500;
var ZOOM_MIN = 0.25;
var ZOOM_MAX = 3;
var ZOOM_WHEEL_STEP = 1.1;
var ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3];
var CANVAS_MARGIN = 60;
var CANVAS_HALF_WIDTH = 2e3;
var CANVAS_HALF_HEIGHT = 1500;
var CANVAS_BOX = {
  left: -CANVAS_HALF_WIDTH,
  top: -CANVAS_HALF_HEIGHT,
  width: CANVAS_HALF_WIDTH * 2,
  height: CANVAS_HALF_HEIGHT * 2
};
var DEFAULT_SIZE = { text: { w: 260, h: 168 }, image: { w: 240, h: 200 }, file: { w: 240, h: 84 } };
function defaultSizeOf(item) {
  if (item.kind !== "file") return DEFAULT_SIZE.text;
  return isImage(item.file) ? DEFAULT_SIZE.image : DEFAULT_SIZE.file;
}
function boxOf(item) {
  const size = defaultSizeOf(item);
  return { x: item.x, y: item.y, w: item.w ?? size.w, h: item.h ?? size.h };
}
function overlaps(left, right) {
  return left.x < right.x + right.w && right.x < left.x + left.w && left.y < right.y + right.h && right.y < left.y + left.h;
}
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
function namedForClipboard(file) {
  const given = typeof file?.name === "string" ? file.name.trim() : "";
  if (given !== "") return file;
  const type = typeof file?.type === "string" ? file.type : "";
  const extension = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "bin";
  return new File([file], `clipboard-${Date.now()}.${extension}`, { type });
}
var zh = {
  panel: "\u4E34\u65F6\u7A7A\u95F4",
  title: "\u4E34\u65F6\u7A7A\u95F4",
  loading: "\u6B63\u5728\u8BFB\u53D6\u2026",
  empty: "\u628A\u6587\u4EF6\u62D6\u5230\u8FD9\u91CC\u5C31\u4F1A\u5B58\u8FDB\u53BB\uFF1B\u4E5F\u53EF\u4EE5\u70B9\u300C+ \u6587\u5B57\u300D\u5199\u4E00\u6761\u4FBF\u7B7E\u3002",
  dropHint: "\u677E\u624B\u5373\u5165\u5E93",
  addText: "+ \u6587\u5B57",
  addTextBody: "\u5199\u70B9\u4EC0\u4E48\u2026",
  refresh: "\u5237\u65B0",
  save: "\u4FDD\u5B58",
  pull: "\u62C9\u53D6",
  working: "\u6B63\u5728{action}\u2026",
  refreshed: "\u5DF2\u5237\u65B0",
  confirmRemove: "\u518D\u70B9\u4E00\u6B21 \xD7 \u5C31\u5220\u6389\u300C{name}\u300D",
  removeConfirm: "\u786E\u5B9A\u5220\u9664",
  removeCancel: "\u53D6\u6D88",
  titleHint: "\u53CC\u51FB\u6807\u9898\u53EF\u4EE5\u6539\u540D\u5B57",
  titlePlaceholder: "\u672A\u547D\u540D",
  zoomReset: "\u56DE\u5230 100%",
  zoomHint: "\u6EDA\u8F6E\u7F29\u653E\uFF1B\u5DE6\u952E\u62D6\u7A7A\u767D\u5904\u6846\u9009\uFF0C\u53F3\u952E\u6216\u4E2D\u952E\u62D6\u52A8\u5E73\u79FB\uFF1BDelete \u5220\u9664\u9009\u4E2D\uFF0CCtrl+C/V \u590D\u5236\u7C98\u8D34\uFF0CCtrl+Z \u64A4\u56DE",
  usage: "{used} / {total}",
  fileMissing: "\u6587\u4EF6\u4E0D\u5728\u4E86",
  revealHint: "\u62D6\u52A8\u53EF\u4EE5\u79FB\u52A8\u5361\u7247\uFF1B\u53CC\u51FB\u5728\u6587\u4EF6\u7BA1\u7406\u5668\u91CC\u5B9A\u4F4D\u8FD9\u4E2A\u6587\u4EF6",
  revealed: "\u5DF2\u5728\u6587\u4EF6\u7BA1\u7406\u5668\u91CC\u5B9A\u4F4D\uFF1A{name}",
  remove: "\u5220\u9664",
  selected: "\u5DF2\u9009 {count} \u5F20\u5361\u7247\uFF1A\u62D6\u52A8\u53EF\u4EE5\u4E00\u8D77\u79FB\u52A8\uFF0CDelete \u5220\u9664\uFF0CCtrl+Z \u64A4\u56DE",
  removed: "\u5DF2\u5220\u9664 {count} \u5F20\u5361\u7247\uFF08Ctrl+Z \u64A4\u56DE\uFF1B\u5B57\u8282\u8981\u7B49\u300C\u6E05\u7406\u300D\u65F6\u624D\u4ECE\u4ED3\u5E93\u79FB\u9664\uFF09",
  undone: "\u5DF2\u64A4\u56DE",
  noUndo: "\u6CA1\u6709\u53EF\u64A4\u56DE\u7684\u64CD\u4F5C",
  orphans: "{count} \u4E2A\u672A\u5F15\u7528\u6587\u4EF6\uFF08{size}\uFF09",
  clean: "\u6E05\u7406",
  confirmClean: "\u518D\u70B9\u4E00\u6B21\u5C31\u5220\u9664 {count} \u4E2A\u6CA1\u6709\u5361\u7247\u5F15\u7528\u7684\u6587\u4EF6\uFF08{size}\uFF09",
  cleaned: "\u5DF2\u6E05\u7406 {count} \u4E2A\u672A\u5F15\u7528\u6587\u4EF6\uFF08{size}\uFF09\uFF1B\u64A4\u9500\u5386\u53F2\u5DF2\u6E05\u7A7A",
  copyNothing: "\u6CA1\u6709\u9009\u4E2D\u5361\u7247\uFF1A\u5148\u70B9\u4E00\u5F20\u6216\u7528\u6846\u9009\u9009\u51E0\u5F20\uFF0C\u518D\u6309 Ctrl+C",
  copiedFiles: "\u5DF2\u628A {count} \u4E2A\u6587\u4EF6\u653E\u8FDB\u7CFB\u7EDF\u526A\u8D34\u677F\uFF0C\u53BB\u6587\u4EF6\u7BA1\u7406\u5668\u6216\u5176\u4ED6\u7A0B\u5E8F\u91CC\u7C98\u8D34",
  copiedText: "\u5DF2\u628A {count} \u5F20\u4FBF\u7B7E\u7684\u6587\u5B57\u653E\u8FDB\u7CFB\u7EDF\u526A\u8D34\u677F",
  copyFailed: "\u7CFB\u7EDF\u526A\u8D34\u677F\u6CA1\u6709\u63A5\u53D7\uFF1A{message}",
  hostStale: "\u5BBF\u4E3B\u534A\u8FB9\u8FD8\u6CA1\u6709\u8FD9\u6761\u8DEF\u7531\uFF1A\u91CD\u542F DSH \u4E4B\u540E\u518D\u8BD5\uFF08\u6D4F\u89C8\u5668\u534A\u8FB9\u5237\u65B0\u9875\u9762\u5C31\u4F1A\u66F4\u65B0\uFF0C\u5BBF\u4E3B\u4E0D\u662F\uFF09",
  pasted: "\u5DF2\u4ECE\u526A\u8D34\u677F\u5B58\u5165 {count} \u4E2A\u6587\u4EF6",
  pastedText: "\u5DF2\u4ECE\u526A\u8D34\u677F\u65B0\u5EFA\u4E00\u5F20\u4FBF\u7B7E",
  gitBranch: "\u5206\u652F {branch}",
  gitUpToDate: "\u4E0E\u8FDC\u7AEF\u4E00\u81F4",
  gitAhead: "\u9886\u5148 {ahead}",
  gitBehind: "\u843D\u540E {behind}",
  gitDiverged: "\u5DF2\u5206\u53C9\uFF1A{ahead} \u9886\u5148 / {behind} \u843D\u540E",
  gitNoUpstream: "\u6CA1\u6709\u4E0A\u6E38\u5206\u652F",
  gitDetached: "\u6E38\u79BB HEAD",
  gitChanges: "{count} \u4E2A\u672A\u63D0\u4EA4\u6539\u52A8",
  gitClean: "\u6CA1\u6709\u672A\u63D0\u4EA4\u7684\u6539\u52A8",
  gitNone: "\u8FD8\u4E0D\u662F\u4ED3\u5E93",
  saved: "\u5DF2\u5B58\u5230\u672C\u673A",
  savedAll: "\u5DF2\u63D0\u4EA4\u5E76\u4E0A\u4F20",
  savedNothing: "\u672C\u673A\u5DF2\u662F\u6700\u65B0\uFF0C\u6CA1\u6709\u9700\u8981\u4FDD\u5B58\u7684\u6539\u52A8",
  savedUnpushed: "\u5DF2\u63D0\u4EA4\u5230\u672C\u673A\uFF0C\u4F46\u4E0A\u4F20\u5931\u8D25\uFF1A{message}",
  savedBehind: "\u5DF2\u63D0\u4EA4\u5230\u672C\u673A\uFF0C\u4F46\u8FDC\u7AEF\u9886\u5148\uFF0C\u5148\u62C9\u53D6\u518D\u4FDD\u5B58",
  pulled: "\u5DF2\u62C9\u53D6",
  failed: "\u5931\u8D25\uFF1A{message}",
  conflict: "\u8FD9\u4E2A\u753B\u5E03\u5728\u522B\u5904\u88AB\u6539\u8FC7\uFF0C\u5DF2\u91CD\u65B0\u8F7D\u5165\u3002",
  tooLarge: "\u5355\u4E2A\u6587\u4EF6\u6700\u591A 10 MB\uFF0C\u8FD9\u4E2A\u6CA1\u5B58\u8FDB\u53BB\u3002",
  full: "\u4E34\u65F6\u7A7A\u95F4\u6EE1\u4E86\uFF08\u4E0A\u9650 100 MB\uFF09\uFF0C\u5148\u5220\u6389\u4E00\u4E9B\u518D\u653E\u3002",
  noDir: "\u627E\u4E0D\u5230\u4E34\u65F6\u7A7A\u95F4\u76EE\u5F55 {dir}\u3002\u5148\u5728\u8FD9\u53F0\u673A\u5668\u4E0A\u628A\u5B83\u514B\u9686\u4E0B\u6765\u3002"
};
var en = {
  panel: "Temp Space",
  title: "Temp Space",
  loading: "Loading\u2026",
  empty: 'Drop files here to store them, or press "+ Text" to leave a note.',
  dropHint: "Release to store",
  addText: "+ Text",
  addTextBody: "Write something\u2026",
  refresh: "Refresh",
  save: "Save",
  pull: "Pull",
  working: "{action}\u2026",
  refreshed: "Refreshed",
  confirmRemove: 'Press \xD7 again to remove "{name}"',
  removeConfirm: "Remove",
  removeCancel: "Cancel",
  titleHint: "Double-click the title to rename it",
  titlePlaceholder: "Untitled",
  zoomReset: "Back to 100%",
  zoomHint: "Wheel to zoom; left-drag the background to select, right- or middle-drag to pan; Delete removes the selection, Ctrl+C/V copy and paste, Ctrl+Z undoes",
  usage: "{used} / {total}",
  fileMissing: "File is gone",
  revealHint: "Drag to move the card; double-click to show the file in the file manager",
  revealed: "Shown in the file manager: {name}",
  remove: "Remove",
  selected: "{count} selected: drag to move them together, Delete to remove them, Ctrl+Z to undo",
  removed: "Removed {count} cards (Ctrl+Z undoes it; the bytes leave the repository at the next clean-up)",
  undone: "Undone",
  noUndo: "Nothing to undo",
  orphans: "{count} files nothing points at ({size})",
  clean: "Clean up",
  confirmClean: "Press again to delete {count} files no card points at ({size})",
  cleaned: "Cleaned up {count} unreferenced files ({size}); the undo history is empty now",
  copyNothing: "Nothing is selected: click a card or sweep a few, then press Ctrl+C",
  copiedFiles: "Put {count} files on the system clipboard \u2014 paste them in the file manager or another application",
  copiedText: "Put the text of {count} notes on the system clipboard",
  copyFailed: "The system clipboard would not take it: {message}",
  hostStale: "The host half has no such route yet: restart DSH and try again (the browser half updates on a page refresh, the host does not)",
  pasted: "Stored {count} files from the clipboard",
  pastedText: "Left a new note holding what the clipboard had",
  gitBranch: "branch {branch}",
  gitUpToDate: "in sync with the remote",
  gitAhead: "{ahead} ahead",
  gitBehind: "{behind} behind",
  gitDiverged: "diverged: {ahead} ahead / {behind} behind",
  gitNoUpstream: "no upstream branch",
  gitDetached: "detached HEAD",
  gitChanges: "{count} uncommitted changes",
  gitClean: "nothing uncommitted",
  gitNone: "not a repository",
  saved: "Stored locally",
  savedAll: "Committed and uploaded",
  savedNothing: "Already up to date; nothing to save",
  savedUnpushed: "Committed, but the upload failed: {message}",
  savedBehind: "Committed here, but the remote is ahead \u2014 pull first",
  pulled: "Pulled",
  failed: "Failed: {message}",
  conflict: "This canvas changed elsewhere; it was reloaded.",
  tooLarge: "One file may hold at most 10 MB; that one was not stored.",
  full: "The space is full (100 MB); remove something first.",
  noDir: "The space directory {dir} is missing. Clone it on this machine first."
};
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isImage(name2) {
  if (typeof name2 !== "string") return false;
  const dot = name2.lastIndexOf(".");
  return dot > 0 && IMAGE_EXTENSIONS.has(name2.slice(dot + 1).toLowerCase());
}
function blobUrl(name2) {
  return `${BLOB_PATH}?name=${encodeURIComponent(name2)}`;
}
function TempSpacePanel({ load, save, upload, removeBlob, gitStatus, gitAction, reveal, clipboard, t }) {
  const [phase, setPhase] = (0, import_react.useState)("loading");
  const [items, setItems] = (0, import_react.useState)([]);
  const [files, setFiles] = (0, import_react.useState)([]);
  const [usage, setUsage] = (0, import_react.useState)({ usedBytes: 0, maxTotalBytes: 0, maxFileBytes: 0 });
  const [git, setGit] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)("");
  const [dropping, setDropping] = (0, import_react.useState)(false);
  const [confirmRemove, setConfirmRemove] = (0, import_react.useState)(null);
  const [editing, setEditing] = (0, import_react.useState)(null);
  const [draft, setDraft] = (0, import_react.useState)("");
  const [zoom, setZoom] = (0, import_react.useState)(1);
  const [selected, setSelected] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [marquee, setMarquee] = (0, import_react.useState)(null);
  const [confirmClean, setConfirmClean] = (0, import_react.useState)(false);
  const revision = (0, import_react.useRef)(0);
  const itemsRef = (0, import_react.useRef)([]);
  const dirty = (0, import_react.useRef)(false);
  const timer = (0, import_react.useRef)();
  const drag = (0, import_react.useRef)(null);
  const canvas = (0, import_react.useRef)(null);
  const history = (0, import_react.useRef)([]);
  const editingNote = (0, import_react.useRef)(null);
  const layer = (0, import_react.useRef)(null);
  const internalDrag = (0, import_react.useRef)(false);
  const selectedRef = (0, import_react.useRef)(selected);
  const zoomRef = (0, import_react.useRef)(1);
  const pendingScroll = (0, import_react.useRef)(null);
  const didCentre = (0, import_react.useRef)(false);
  const latest = (0, import_react.useRef)({});
  const say = (0, import_react.useCallback)((text) => {
    setNotice(text);
  }, []);
  const guard = (0, import_react.useCallback)((work) => {
    void (async () => {
      try {
        await work();
      } catch (error) {
        say(t("failed", { message: error instanceof Error ? error.message : String(error) }));
      }
    })();
  }, [say, t]);
  const flush = (0, import_react.useCallback)(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const sent = itemsRef.current;
    const result = await save(sent, revision.current);
    if (result.ok) {
      revision.current = result.revision;
      say(t("saved"));
      return;
    }
    if (result.reason === "conflict") {
      revision.current = result.revision;
      if (Array.isArray(result.items)) {
        itemsRef.current = result.items;
        setItems(result.items);
      }
      say(t("conflict"));
      return;
    }
    say(t("failed", { message: result.message ?? result.reason }));
  }, [save, say, t]);
  const update = (0, import_react.useCallback)((next) => {
    itemsRef.current = next;
    setItems(next);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);
  const remember = (0, import_react.useCallback)(() => {
    const stack = history.current;
    stack.push(itemsRef.current.map((item) => ({ ...item })));
    if (stack.length > HISTORY_LIMIT) stack.shift();
  }, []);
  const undo = (0, import_react.useCallback)(() => {
    const previous = history.current.pop();
    if (previous === void 0) {
      say(t("noUndo"));
      return;
    }
    update(previous);
    const ids = new Set(previous.map((item) => item.id));
    setSelected((current) => new Set([...current].filter((id) => ids.has(id))));
    say(t("undone"));
  }, [say, t, update]);
  const refresh = (0, import_react.useCallback)(async () => {
    setPhase("loading");
    const [state, status] = await Promise.all([load(), gitStatus()]);
    if (!state.ok) {
      setPhase("error");
      say(state.reason === "no-dir" || state.reason === "not-a-repo" ? t("noDir", { dir: state.dir ?? state.message ?? "" }) : t("failed", { message: state.message ?? state.reason }));
      return;
    }
    revision.current = state.revision;
    itemsRef.current = state.items;
    setItems(state.items);
    setFiles(state.files ?? []);
    setUsage(state.usage ?? { usedBytes: 0, maxTotalBytes: 0, maxFileBytes: 0 });
    setGit(status.ok ? status : null);
    dirty.current = false;
    setPhase("ready");
  }, [gitStatus, load, say, t]);
  (0, import_react.useEffect)(() => {
    void latest.current.refresh();
    return () => {
      clearTimeout(timer.current);
      void latest.current.flush();
      latest.current.stopDrag();
    };
  }, []);
  const present = (0, import_react.useMemo)(() => new Set(files.map((row) => row.name)), [files]);
  const orphans = (0, import_react.useMemo)(() => {
    const referenced = new Set(items.filter((item) => item.kind === "file").map((item) => item.file));
    return files.filter((row) => !referenced.has(row.name));
  }, [files, items]);
  const orphanBytes = (0, import_react.useMemo)(() => orphans.reduce((total, row) => total + row.bytes, 0), [orphans]);
  const applySelection = (0, import_react.useCallback)((change) => {
    setSelected((current) => {
      const next = new Set(change.mode === "only" ? [] : current);
      if (change.mode === "toggle" && next.has(change.id)) next.delete(change.id);
      else next.add(change.id);
      return next;
    });
  }, []);
  const selectAll = (0, import_react.useCallback)(() => {
    const ids = itemsRef.current.map((item) => item.id);
    setSelected(new Set(ids));
    say(t("selected", { count: ids.length }));
  }, [say, t]);
  const contentBox = (0, import_react.useMemo)(() => {
    if (items.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const item of items) {
      const size = defaultSizeOf(item);
      left = Math.min(left, item.x);
      top = Math.min(top, item.y);
      right = Math.max(right, item.x + (item.w ?? size.w));
      bottom = Math.max(bottom, item.y + (item.h ?? size.h));
    }
    return { left, top, right, bottom };
  }, [items]);
  const layerLeft = CANVAS_MARGIN + CANVAS_HALF_WIDTH * zoom;
  const layerTop = CANVAS_MARGIN + CANVAS_HALF_HEIGHT * zoom;
  const store = (0, import_react.useCallback)(async (file) => {
    const result = await upload(file);
    if (!result.ok || typeof result.name !== "string" || result.name === "") {
      say(result.reason === "space-full" ? t("full") : result.reason === "file-too-large" ? t("tooLarge") : t("failed", { message: result.message ?? result.reason ?? "no-name" }));
      return;
    }
    const base = itemsRef.current;
    const size = isImage(result.name) ? DEFAULT_SIZE.image : DEFAULT_SIZE.file;
    const item = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "file",
      file: result.name,
      x: 32 + base.length % 6 * 28,
      y: 32 + base.length % 6 * 26,
      w: size.w,
      h: size.h,
      z: base.reduce((top, row) => Math.max(top, row.z), 0) + 1
    };
    remember();
    update([...base, item]);
    setFiles((rows) => [...rows, { name: result.name, bytes: result.bytes }]);
    setUsage((current) => ({ ...current, usedBytes: current.usedBytes + result.bytes }));
  }, [remember, say, t, update, upload]);
  const dropFiles = (0, import_react.useCallback)(async (event) => {
    event.preventDefault();
    setDropping(false);
    const transfer = event.dataTransfer;
    const carriesFiles = Array.from(transfer?.types ?? []).includes("Files");
    const dropped = carriesFiles ? Array.from(transfer?.files ?? []) : [];
    if (dropped.length === 0) return;
    setBusy("drop");
    for (const file of dropped) await store(file);
    setBusy("");
  }, [store]);
  const addNote = (0, import_react.useCallback)((text) => {
    const base = itemsRef.current;
    remember();
    update([...base, {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: "text",
      text,
      x: 32 + base.length % 6 * 28,
      y: 32 + base.length % 6 * 26,
      w: DEFAULT_SIZE.text.w,
      h: DEFAULT_SIZE.text.h,
      z: base.reduce((top, row) => Math.max(top, row.z), 0) + 1
    }]);
  }, [remember, update]);
  const addText = (0, import_react.useCallback)(() => {
    addNote("");
  }, [addNote]);
  const pasteFromClipboard = (0, import_react.useCallback)((event) => {
    const target = event.target;
    const tag = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
    if (tag === "TEXTAREA" || tag === "INPUT" || target?.isContentEditable === true) return;
    const data = event.clipboardData;
    const listed = Array.from(data?.items ?? []).filter((entry) => entry.kind === "file").map((entry) => typeof entry.getAsFile === "function" ? entry.getAsFile() : entry).filter((file) => file !== null && file !== void 0);
    const pasted = listed.length > 0 ? listed : Array.from(data?.files ?? []);
    if (pasted.length > 0) {
      event.preventDefault();
      guard(async () => {
        setBusy("paste");
        for (const file of pasted) await store(namedForClipboard(file));
        setBusy("");
        say(t("pasted", { count: pasted.length }));
      });
      return;
    }
    const text = typeof data?.getData === "function" ? data.getData("text/plain") : "";
    if (typeof text !== "string" || text === "") return;
    event.preventDefault();
    addNote(text);
    say(t("pastedText"));
  }, [addNote, guard, say, store, t]);
  const copyToClipboard = (0, import_react.useCallback)(() => {
    const chosen = itemsRef.current.filter((item) => selected.has(item.id));
    if (chosen.length === 0) {
      say(t("copyNothing"));
      return;
    }
    const fileNames = chosen.filter((item) => item.kind === "file").map((item) => item.file);
    guard(async () => {
      const result = fileNames.length > 0 ? await clipboard({ names: fileNames }) : await clipboard({ text: chosen.map((item) => item.text ?? "").join("\n\n") });
      if (result.ok) {
        say(fileNames.length > 0 ? t("copiedFiles", { count: fileNames.length }) : t("copiedText", { count: chosen.length }));
        return;
      }
      say(result.reason === "transport" && result.status === 404 ? t("hostStale") : result.reason === "unsupported" ? t("copyFailed", { message: result.message ?? result.reason }) : t("failed", { message: result.message ?? result.reason }));
    });
  }, [clipboard, guard, say, selected, t]);
  const patch = (0, import_react.useCallback)((id, fields) => {
    update(itemsRef.current.map((item) => item.id === id ? { ...item, ...fields } : item));
  }, [update]);
  const patchText = (0, import_react.useCallback)((id, text) => {
    if (editingNote.current !== id) {
      remember();
      editingNote.current = id;
    }
    patch(id, { text });
  }, [patch, remember]);
  const titleOf = (0, import_react.useCallback)((item) => typeof item.title === "string" && item.title !== "" ? item.title : item.kind === "text" ? t("titlePlaceholder") : item.file, [t]);
  const commitTitle = (0, import_react.useCallback)(() => {
    const id = editing;
    if (id === null) return;
    setEditing(null);
    const item = itemsRef.current.find((row) => row.id === id);
    if (item === void 0) return;
    const trimmed = draft.trim();
    if ((item.title ?? "") === trimmed) return;
    remember();
    patch(id, { title: trimmed });
  }, [draft, editing, patch, remember]);
  const dropItems = (0, import_react.useCallback)((list) => {
    if (list.length === 0) return;
    remember();
    const ids = new Set(list.map((item) => item.id));
    update(itemsRef.current.filter((item) => !ids.has(item.id)));
    setConfirmRemove(null);
    setEditing(null);
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
    say(t("removed", { count: list.length }));
  }, [remember, say, t, update]);
  const deleteSelection = (0, import_react.useCallback)(() => {
    dropItems(itemsRef.current.filter((item) => selected.has(item.id)));
  }, [dropItems, selected]);
  const cleanOrphans = (0, import_react.useCallback)(async () => {
    if (orphans.length === 0) return;
    if (!confirmClean) {
      setConfirmClean(true);
      say(t("confirmClean", { count: orphans.length, size: formatBytes(orphanBytes) }));
      return;
    }
    setConfirmClean(false);
    const removed = [];
    let failure = "";
    for (const row of orphans) {
      const result = await removeBlob(row.name);
      if (!result.ok) {
        failure = result.message ?? result.reason;
        break;
      }
      removed.push(row);
    }
    if (removed.length > 0) {
      const names = new Set(removed.map((row) => row.name));
      const freed = removed.reduce((total, row) => total + row.bytes, 0);
      setFiles((rows) => rows.filter((row) => !names.has(row.name)));
      setUsage((current) => ({ ...current, usedBytes: Math.max(0, current.usedBytes - freed) }));
      history.current = [];
    }
    if (failure !== "") {
      say(t("failed", { message: failure }));
      return;
    }
    say(t("cleaned", { count: removed.length, size: formatBytes(orphanBytes) }));
  }, [confirmClean, orphanBytes, orphans, removeBlob, say, t]);
  const revealItem = (0, import_react.useCallback)((item) => {
    if (item.kind !== "file") return;
    if (!present.has(item.file)) {
      say(t("fileMissing"));
      return;
    }
    guard(async () => {
      const result = await reveal(item.file);
      say(result.ok ? t("revealed", { name: item.file }) : t("failed", { message: result.message ?? result.reason }));
    });
  }, [guard, present, reveal, say, t]);
  const raiseMany = (0, import_react.useCallback)((ids) => {
    const chosen = new Set(ids);
    const top = itemsRef.current.reduce((highest, row) => Math.max(highest, row.z), 0);
    const raised = new Map(itemsRef.current.filter((row) => chosen.has(row.id)).sort((left, right) => left.z - right.z).map((row, index) => [row.id, top + 1 + index]));
    if (raised.size === 0) return;
    update(itemsRef.current.map((row) => raised.has(row.id) ? { ...row, z: raised.get(row.id) } : row));
  }, [update]);
  const moveMany = (0, import_react.useCallback)((starts, dx, dy) => {
    const moved = new Map(starts.map((start) => [start.id, {
      x: Math.round(start.x + dx),
      y: Math.round(start.y + dy)
    }]));
    update(itemsRef.current.map((row) => moved.has(row.id) ? { ...row, ...moved.get(row.id) } : row));
  }, [update]);
  const zoomAround = (0, import_react.useCallback)((next, offsetX, offsetY) => {
    const outer = canvas.current;
    const current = zoomRef.current;
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    if (outer === void 0 || clamped === current) return;
    const box = CANVAS_BOX;
    const viewportWidth = outer.clientWidth ?? 0;
    const viewportHeight = outer.clientHeight ?? 0;
    const room = (zoom2, viewport, span) => Math.max(0, (viewport - (span * zoom2 + CANVAS_MARGIN * 2)) / 2);
    const before = {
      layer: CANVAS_MARGIN - box.left * current,
      layerY: CANVAS_MARGIN - box.top * current,
      room: room(current, viewportWidth, box.width),
      roomY: room(current, viewportHeight, box.height)
    };
    const after = {
      layer: CANVAS_MARGIN - box.left * clamped,
      layerY: CANVAS_MARGIN - box.top * clamped,
      room: room(clamped, viewportWidth, box.width),
      roomY: room(clamped, viewportHeight, box.height)
    };
    const pointX = (offsetX + outer.scrollLeft - before.room - before.layer) / current;
    const pointY = (offsetY + outer.scrollTop - before.roomY - before.layerY) / current;
    pendingScroll.current = {
      left: after.layer + pointX * clamped + after.room - offsetX,
      top: after.layerY + pointY * clamped + after.roomY - offsetY
    };
    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);
  const onWheel = (0, import_react.useCallback)((event) => {
    const outer = canvas.current;
    if (outer === void 0) return;
    const rect = outer.getBoundingClientRect();
    zoomAround(
      zoomRef.current * (event.deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP),
      event.clientX - rect.left,
      event.clientY - rect.top
    );
  }, [zoomAround]);
  const stepZoom = (0, import_react.useCallback)((direction) => {
    const outer = canvas.current;
    const current = zoomRef.current;
    const rung = ZOOM_LEVELS.findIndex((level) => level >= current - 1e-6);
    const from = rung < 0 ? ZOOM_LEVELS.length - 1 : rung;
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, from + direction))];
    zoomAround(next, (outer?.clientWidth ?? 0) / 2, (outer?.clientHeight ?? 0) / 2);
  }, [zoomAround]);
  (0, import_react.useEffect)(() => {
    const outer = canvas.current;
    if (outer === void 0) return;
    const refuse = (event) => {
      event.preventDefault();
      onWheel(event);
    };
    outer.addEventListener("wheel", refuse, { passive: false });
    return () => {
      outer.removeEventListener("wheel", refuse);
    };
  }, [onWheel]);
  (0, import_react.useEffect)(() => {
    const pending = pendingScroll.current;
    if (pending === null) return;
    pendingScroll.current = null;
    const outer = canvas.current;
    if (outer === void 0) return;
    outer.scrollLeft = pending.left;
    outer.scrollTop = pending.top;
  }, [zoom]);
  (0, import_react.useEffect)(() => {
    if (phase !== "ready" || didCentre.current) return;
    didCentre.current = true;
    const outer = canvas.current;
    if (outer === void 0) return;
    const middleX = (contentBox.left + contentBox.right) / 2;
    const middleY = (contentBox.top + contentBox.bottom) / 2;
    const width = CANVAS_BOX.width * zoomRef.current + CANVAS_MARGIN * 2;
    const height = CANVAS_BOX.height * zoomRef.current + CANVAS_MARGIN * 2;
    const roomX = Math.max(0, ((outer.clientWidth ?? 0) - width) / 2);
    const roomY = Math.max(0, ((outer.clientHeight ?? 0) - height) / 2);
    outer.scrollLeft = Math.max(
      0,
      CANVAS_MARGIN + CANVAS_HALF_WIDTH * zoomRef.current + middleX * zoomRef.current + roomX - (outer.clientWidth ?? 0) / 2
    );
    outer.scrollTop = Math.max(
      0,
      CANVAS_MARGIN + CANVAS_HALF_HEIGHT * zoomRef.current + middleY * zoomRef.current + roomY - (outer.clientHeight ?? 0) / 2
    );
  }, [phase, contentBox]);
  const layerPoint = (0, import_react.useCallback)((event) => {
    const rect = layer.current?.getBoundingClientRect?.();
    const scale = zoomRef.current;
    if (rect === void 0 || scale <= 0) return { x: 0, y: 0 };
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }, []);
  const onWindowMove = (0, import_react.useCallback)((event) => {
    const held = drag.current;
    if (held === null) return;
    if (held.kind === "pan") {
      const outer = canvas.current;
      if (outer === void 0) return;
      outer.scrollLeft = held.left - (event.clientX - held.originX);
      outer.scrollTop = held.top - (event.clientY - held.originY);
      return;
    }
    if (held.kind === "marquee") {
      if (!held.moved) {
        if (Math.abs(event.clientX - held.originX) < DRAG_THRESHOLD && Math.abs(event.clientY - held.originY) < DRAG_THRESHOLD) return;
        held.moved = true;
      }
      const point = layerPoint(event);
      const box = {
        x: Math.min(held.start.x, point.x),
        y: Math.min(held.start.y, point.y),
        w: Math.abs(point.x - held.start.x),
        h: Math.abs(point.y - held.start.y)
      };
      setMarquee(box);
      const swept = itemsRef.current.filter((item) => overlaps(boxOf(item), box)).map((item) => item.id);
      held.chosen = [.../* @__PURE__ */ new Set([...held.base, ...swept])];
      setSelected(new Set(held.chosen));
      return;
    }
    const scale = zoomRef.current;
    const travel = {
      x: (event.clientX - held.originX) / scale,
      y: (event.clientY - held.originY) / scale
    };
    if (!held.moved) {
      if (Math.abs(travel.x) < DRAG_THRESHOLD && Math.abs(travel.y) < DRAG_THRESHOLD) return;
      held.moved = true;
      if (!held.group) applySelection(held.select);
      remember();
      raiseMany(held.ids);
    }
    moveMany(
      held.starts,
      Math.min(held.bounds.maxX, Math.max(held.bounds.minX, travel.x)),
      Math.min(held.bounds.maxY, Math.max(held.bounds.minY, travel.y))
    );
  }, [applySelection, layerPoint, moveMany, raiseMany, remember]);
  const stopDrag = (0, import_react.useCallback)(() => {
    const held = drag.current;
    drag.current = null;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    if (held === null) return;
    if (held.kind === "marquee") {
      setMarquee(null);
      if (!held.moved) {
        setSelected(/* @__PURE__ */ new Set());
        return;
      }
      const taken = held.chosen ?? [];
      if (taken.length > 0) say(t("selected", { count: taken.length }));
      return;
    }
    if (held.kind === "card" && !held.moved) applySelection(held.select);
  }, [applySelection, onWindowMove, say, t]);
  const startDrag = (0, import_react.useCallback)((event, item) => {
    if (event.button !== 0) return;
    const additive = event.ctrlKey === true || event.metaKey === true;
    const range = event.shiftKey === true;
    const inSelection = selected.has(item.id);
    const group = inSelection && !additive && !range;
    const ids = group ? [...selected] : [item.id];
    const chosen = new Set(ids);
    const starts = itemsRef.current.filter((row) => chosen.has(row.id)).map((row) => ({ id: row.id, ...boxOf(row) }));
    drag.current = {
      kind: "card",
      id: item.id,
      moved: false,
      ids,
      starts,
      // The travel every card of the group can take together. Computed once, from
      // where the cards are, because a drag never changes how big anything is.
      bounds: {
        minX: Math.max(...starts.map((start) => -CANVAS_HALF_WIDTH - start.x)),
        maxX: Math.min(...starts.map((start) => CANVAS_HALF_WIDTH - start.w - start.x)),
        minY: Math.max(...starts.map((start) => -CANVAS_HALF_HEIGHT - start.y)),
        maxY: Math.min(...starts.map((start) => CANVAS_HALF_HEIGHT - start.h - start.y))
      },
      // Whether this press is already part of a group drag: a press on a card the
      // selection holds moves all of it, and the click below would otherwise
      // collapse the selection onto the one under the pointer.
      group,
      select: { id: item.id, mode: additive ? "toggle" : range ? "add" : "only" },
      originX: event.clientX,
      originY: event.clientY
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }, [onWindowMove, selected, stopDrag]);
  const startMarquee = (0, import_react.useCallback)((event) => {
    const additive = event.ctrlKey === true || event.metaKey === true || event.shiftKey === true;
    const start = layerPoint(event);
    event.preventDefault();
    drag.current = {
      kind: "marquee",
      moved: false,
      start,
      base: additive ? new Set(selected) : /* @__PURE__ */ new Set(),
      originX: event.clientX,
      originY: event.clientY
    };
    setMarquee({ x: start.x, y: start.y, w: 0, h: 0 });
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }, [layerPoint, onWindowMove, selected, stopDrag]);
  const startPan = (0, import_react.useCallback)((event) => {
    if (event.button !== 1 && event.button !== 2) return;
    const outer = canvas.current;
    if (outer === void 0) return;
    drag.current = {
      kind: "pan",
      originX: event.clientX,
      originY: event.clientY,
      left: outer.scrollLeft,
      top: outer.scrollTop
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }, [onWindowMove, stopDrag]);
  const isCanvasBackground = (0, import_react.useCallback)((event) => {
    if (event.target === event.currentTarget) return true;
    const target = event.target;
    if (typeof target?.closest !== "function") return false;
    return target.closest("[data-card]") === null;
  }, []);
  const run = (0, import_react.useCallback)(async (label, action, describe) => {
    setBusy(label);
    try {
      const result = await action();
      say(describe(result));
      return result;
    } finally {
      setBusy("");
    }
  }, [say]);
  const act = (0, import_react.useCallback)(async (name2) => {
    say(t("working", { action: name2 === "save" ? t("save") : t("pull") }));
    const describe = name2 === "save" ? (result2) => {
      if (result2.ok) return result2.pushed === true ? t("savedAll") : t("savedNothing");
      if (result2.committed === true) {
        return result2.reason === "behind" ? t("savedBehind") : t("savedUnpushed", { message: result2.message ?? result2.reason });
      }
      return t("failed", { message: result2.message ?? result2.reason });
    } : (result2) => result2.ok ? t("pulled") : t("failed", { message: result2.message ?? result2.reason });
    const result = await run(name2, () => gitAction(name2, ""), describe);
    if (result.ok) await refresh();
  }, [gitAction, refresh, run, say, t]);
  const reload = (0, import_react.useCallback)(async () => {
    await refresh();
    say(t("refreshed"));
  }, [refresh, say, t]);
  const gitLine = (0, import_react.useMemo)(() => {
    if (git === null) return t("gitNone");
    if (git.detached === true) return t("gitDetached");
    const relation = git.relation === "up-to-date" ? t("gitUpToDate") : git.relation === "ahead" ? t("gitAhead", { ahead: git.ahead }) : git.relation === "behind" ? t("gitBehind", { behind: git.behind }) : git.relation === "diverged" ? t("gitDiverged", { ahead: git.ahead, behind: git.behind }) : t("gitNoUpstream");
    const changes = git.changes === 0 ? t("gitClean") : t("gitChanges", { count: git.changes });
    return `${t("gitBranch", { branch: git.branch })} \xB7 ${relation} \xB7 ${changes}`;
  }, [git, t]);
  const button = (label, onClick, disabled) => (0, import_react.createElement)("button", {
    type: "button",
    onClick,
    disabled: disabled === true || busy !== "",
    style: {
      font: "inherit",
      cursor: "pointer",
      height: 28,
      padding: "0 12px",
      borderRadius: 999,
      fontSize: 13,
      border: "1px solid var(--dsw-alias-border-l2, #d9dde6)",
      background: "var(--dsw-alias-bg-layer-1, #fff)",
      color: "var(--dsw-alias-label-primary, inherit)"
    }
  }, label);
  const itemCard = (item) => {
    const missing = item.kind === "file" && !present.has(item.file);
    const size = defaultSizeOf(item);
    const chosen = selected.has(item.id);
    return (0, import_react.createElement)(
      "div",
      {
        key: item.id,
        // Read by the canvas press handler to tell a card from the background: the
        // plane and the layer are pressed through, and both belong to the canvas.
        "data-card": item.id,
        style: {
          position: "absolute",
          left: item.x,
          top: item.y,
          zIndex: item.z,
          width: item.w ?? size.w,
          height: item.h ?? size.h,
          display: "flex",
          flexDirection: "column",
          borderRadius: 10,
          border: `1px solid ${chosen ? "var(--dsw-alias-brand-primary, #4f6ef7)" : "var(--dsw-alias-border-l2, #d9dde6)"}`,
          background: "var(--dsw-alias-bg-layer-1, #fff)",
          boxShadow: chosen ? "0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 35%, transparent)" : "0 2px 10px rgba(15, 23, 42, .08)",
          overflow: "hidden"
        }
      },
      (0, import_react.createElement)(
        "div",
        {
          onPointerDown: (event) => {
            startDrag(event, item);
          },
          title: t("titleHint"),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 5px 3px 8px",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            borderBottom: "1px solid var(--dsw-alias-border-l2, #eceff4)",
            fontSize: 12,
            color: "var(--dsw-alias-label-tertiary, #6b7280)"
          }
        },
        editing === item.id ? (0, import_react.createElement)("input", {
          value: draft,
          autoFocus: true,
          spellCheck: false,
          onChange: (event) => {
            setDraft(event.target.value);
          },
          onKeyDown: (event) => {
            if (event.key === "Enter") commitTitle();
            else if (event.key === "Escape") setEditing(null);
          },
          onBlur: commitTitle,
          style: {
            flex: "1 1 auto",
            minWidth: 0,
            font: "inherit",
            fontSize: 12,
            padding: "0 2px",
            border: "1px solid var(--dsw-alias-border-l2, #d9dde6)",
            borderRadius: 4,
            background: "var(--dsw-alias-bg-layer-1, #fff)",
            color: "var(--dsw-alias-label-primary, inherit)"
          }
        }) : (0, import_react.createElement)("span", {
          onDoubleClick: () => {
            setEditing(item.id);
            setDraft(titleOf(item) === t("titlePlaceholder") ? "" : titleOf(item));
          },
          style: { flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
        }, titleOf(item)),
        confirmRemove === item.id ? (0, import_react.createElement)(
          "span",
          { style: { display: "flex", alignItems: "center", gap: 4, flex: "0 0 auto" } },
          (0, import_react.createElement)("button", {
            type: "button",
            onClick: () => {
              dropItems([item]);
            },
            style: {
              font: "inherit",
              cursor: "pointer",
              border: "none",
              borderRadius: 6,
              padding: "0 5px",
              background: "var(--dsw-alias-state-danger-primary, #d9534f)",
              color: "#fff"
            }
          }, t("removeConfirm")),
          (0, import_react.createElement)("button", {
            type: "button",
            onClick: () => {
              setConfirmRemove(null);
              say("");
            },
            style: {
              font: "inherit",
              cursor: "pointer",
              border: "1px solid var(--dsw-alias-border-l2, #d9dde6)",
              borderRadius: 6,
              padding: "0 5px",
              background: "var(--dsw-alias-bg-layer-1, #fff)",
              color: "inherit"
            }
          }, t("removeCancel"))
        ) : (0, import_react.createElement)("button", {
          type: "button",
          onClick: () => {
            setConfirmRemove(item.id);
            say(t("confirmRemove", { name: titleOf(item) }));
          },
          title: t("remove"),
          style: {
            font: "inherit",
            cursor: "pointer",
            border: "none",
            background: "none",
            padding: "0 4px",
            color: "inherit",
            flex: "0 0 auto"
          }
        }, "\xD7")
      ),
      item.kind === "text" ? (0, import_react.createElement)("textarea", {
        value: item.text ?? "",
        placeholder: t("addTextBody"),
        // What a note holds is what somebody pasted: keys, paths, code. The
        // browser's spell checker would draw red under all of it.
        spellCheck: false,
        // Typing in a note is one undo step per visit to the field, not one per
        // keystroke: the focus is what marks the visit.
        onFocus: () => {
          editingNote.current = item.id;
        },
        onBlur: () => {
          editingNote.current = null;
        },
        onChange: (event) => {
          patchText(item.id, event.target.value);
        },
        style: {
          flex: "1 1 auto",
          minHeight: 0,
          resize: "none",
          border: "none",
          outline: "none",
          padding: "8px 10px",
          font: "inherit",
          fontSize: 13,
          lineHeight: 1.5,
          background: "transparent",
          color: "var(--dsw-alias-label-primary, inherit)"
        }
      }) : (0, import_react.createElement)(
        "div",
        {
          // The body moves the card the way the title bar does — a picture is the
          // obvious thing to grab — and keeps its own double-click for showing the
          // file where it lies.
          onPointerDown: (event) => {
            startDrag(event, item);
          },
          onDoubleClick: () => {
            revealItem(item);
          },
          title: t("revealHint"),
          style: {
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 8,
            cursor: "grab",
            touchAction: "none",
            userSelect: "none"
          }
        },
        !missing && isImage(item.file) ? (0, import_react.createElement)("img", {
          src: blobUrl(item.file),
          alt: titleOf(item),
          // A picture is draggable by default, and dragging one starts a browser
          // drag that offers the canvas a file: letting go over the canvas then
          // stored a second copy of a picture the space already had.
          draggable: false,
          style: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }
        }) : (0, import_react.createElement)(
          "span",
          { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #6b7280)" } },
          // A card renamed by hand still has to say which file it holds.
          missing ? `${item.file} \u2014 ${t("fileMissing")}` : `${titleOf(item) === item.file ? "" : `${item.file} \xB7 `}${files.find((row) => row.name === item.file)?.bytes ?? 0} B`
        )
      )
    );
  };
  (0, import_react.useEffect)(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tag = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
      if (tag === "TEXTAREA" || tag === "INPUT" || target?.isContentEditable === true) return;
      const primary = event.ctrlKey === true || event.metaKey === true;
      if (primary && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        undo();
        return;
      }
      if (primary && (event.key === "a" || event.key === "A")) {
        event.preventDefault();
        selectAll();
        return;
      }
      if (primary && (event.key === "c" || event.key === "C")) {
        event.preventDefault();
        copyToClipboard();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key === "Escape") setSelected(/* @__PURE__ */ new Set());
    };
    const onCopy = (event) => {
      const target = event.target;
      const tag = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
      if (tag === "TEXTAREA" || tag === "INPUT" || target?.isContentEditable === true) return;
      if (selectedRef.current.size === 0) return;
      event.preventDefault();
      copyToClipboard();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", pasteFromClipboard);
    window.addEventListener("copy", onCopy);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", pasteFromClipboard);
      window.removeEventListener("copy", onCopy);
    };
  }, [copyToClipboard, deleteSelection, pasteFromClipboard, selectAll, undo]);
  latest.current = { flush, refresh, stopDrag };
  selectedRef.current = selected;
  return (0, import_react.createElement)(
    "div",
    {
      style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }
    },
    (0, import_react.createElement)(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--dsw-alias-border-l2, #e6e9ef)"
        }
      },
      (0, import_react.createElement)("strong", { style: { fontSize: 14 } }, t("title")),
      (0, import_react.createElement)(
        "span",
        { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #6b7280)" } },
        t("usage", { used: formatBytes(usage.usedBytes), total: formatBytes(usage.maxTotalBytes) })
      ),
      // Cards that were removed leave their bytes behind, so the header says how many
      // and offers to take them out of the repository. Nothing counts as saved while
      // they are there, and nothing else in the panel would tell the person.
      orphans.length === 0 ? null : (0, import_react.createElement)("button", {
        type: "button",
        onClick: () => {
          guard(() => cleanOrphans());
        },
        style: {
          font: "inherit",
          cursor: "pointer",
          height: 24,
          padding: "0 10px",
          borderRadius: 999,
          fontSize: 12,
          border: "1px solid var(--dsw-alias-border-l2, #d9dde6)",
          background: confirmClean ? "var(--dsw-alias-state-danger-primary, #d9534f)" : "var(--dsw-alias-bg-layer-1, #fff)",
          color: confirmClean ? "#fff" : "var(--dsw-alias-label-secondary, #4b5563)"
        }
      }, `${t("orphans", { count: orphans.length, size: formatBytes(orphanBytes) })} \xB7 ${t("clean")}`),
      (0, import_react.createElement)("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #6b7280)" } }, gitLine),
      (0, import_react.createElement)("span", { style: { flex: "1 1 auto" } }),
      button("\u2212", () => {
        stepZoom(-1);
      }, false),
      (0, import_react.createElement)("button", {
        type: "button",
        onClick: () => {
          const outer = canvas.current;
          zoomAround(1, (outer?.clientWidth ?? 0) / 2, (outer?.clientHeight ?? 0) / 2);
        },
        title: t("zoomReset"),
        style: {
          font: "inherit",
          cursor: "pointer",
          height: 28,
          minWidth: 52,
          padding: "0 8px",
          borderRadius: 999,
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          border: "1px solid var(--dsw-alias-border-l2, #d9dde6)",
          background: "var(--dsw-alias-bg-layer-1, #fff)",
          color: "var(--dsw-alias-label-primary, inherit)"
        }
      }, `${Math.round(zoom * 100)}%`),
      button("+", () => {
        stepZoom(1);
      }, false),
      button(t("addText"), addText, false),
      button(t("save"), () => {
        guard(() => act("save"));
      }, false),
      button(t("pull"), () => {
        guard(() => act("pull"));
      }, false),
      button(t("refresh"), () => {
        guard(reload);
      }, false)
    ),
    notice === "" ? null : (0, import_react.createElement)("div", {
      style: {
        padding: "6px 14px",
        fontSize: 12,
        color: "var(--dsw-alias-label-secondary, #4b5563)",
        borderBottom: "1px solid var(--dsw-alias-border-l2, #eef1f5)"
      }
    }, notice),
    (0, import_react.createElement)(
      "div",
      {
        style: { flex: "1 1 auto", minHeight: 0, position: "relative" }
      },
      (0, import_react.createElement)(
        "div",
        {
          ref: canvas,
          onPointerDown: (event) => {
            const outer = canvas.current;
            if (outer === void 0) return;
            if (event.button === 2) {
              startPan(event);
              return;
            }
            if (!isCanvasBackground(event)) return;
            if (event.button === 1) {
              event.preventDefault();
              startPan(event);
              return;
            }
            if (event.button === 0) startMarquee(event);
          },
          onContextMenu: (event) => {
            event.preventDefault();
          },
          onClick: (event) => {
            if (!isCanvasBackground(event)) return;
            setConfirmRemove(null);
            setConfirmClean(false);
          },
          // A drag that began inside the panel — a card, a note's selected text — is not
          // a file arriving: refusing it here keeps the drop hint away and stops the
          // browser offering the canvas as a drop target for it at all.
          onDragStart: () => {
            internalDrag.current = true;
          },
          onDragEnd: () => {
            internalDrag.current = false;
            setDropping(false);
          },
          onDragOver: (event) => {
            if (internalDrag.current) return;
            event.preventDefault();
            setDropping(true);
          },
          onDragLeave: () => {
            setDropping(false);
          },
          onDrop: (event) => {
            const internal = internalDrag.current;
            internalDrag.current = false;
            if (internal) {
              setDropping(false);
              return;
            }
            void dropFiles(event);
          },
          title: t("zoomHint"),
          style: {
            // The scroller fills the column and is a flex box, so the plane below can
            // centre itself with `margin: auto` — which centres while the plane fits
            // and leaves it scrollable when it does not, unlike
            // `justify-content: center`, which would put the top-left corner of an
            // oversized plane out of reach.
            position: "absolute",
            inset: 0,
            overflow: "auto",
            display: "flex",
            alignItems: "flex-start",
            cursor: "default",
            background: dropping ? "color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 8%, transparent)" : "var(--dsw-alias-bg-base, #f7f8fa)",
            outline: dropping ? "1px dashed var(--dsw-alias-brand-primary, #4f6ef7)" : "none",
            outlineOffset: -6
          }
        },
        // Three things are drawn: the scrollable extent at the zoomed size, the layer
        // that keeps content coordinates and is scaled about its own origin, and the
        // plane itself inside that layer, so its edge is visible. The extent carries
        // `margin: auto`, which is what keeps the plane in the middle of its column
        // when it fits — at the smallest zoom included.
        (0, import_react.createElement)(
          "div",
          {
            style: {
              position: "relative",
              margin: "auto",
              width: CANVAS_BOX.width * zoom + CANVAS_MARGIN * 2,
              height: CANVAS_BOX.height * zoom + CANVAS_MARGIN * 2
            }
          },
          (0, import_react.createElement)(
            "div",
            {
              ref: layer,
              style: {
                position: "absolute",
                left: layerLeft,
                top: layerTop,
                width: 0,
                height: 0,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0"
              }
            },
            (0, import_react.createElement)("div", {
              style: {
                position: "absolute",
                left: CANVAS_BOX.left,
                top: CANVAS_BOX.top,
                width: CANVAS_BOX.width,
                height: CANVAS_BOX.height,
                background: "var(--dsw-alias-bg-layer-1, #fff)",
                border: "1px solid var(--dsw-alias-border-l2, #e6e9ef)",
                borderRadius: 8
              }
            }),
            // The sweep is drawn in content coordinates, inside the scaled layer, so it
            // covers exactly the cards it takes. Its border is divided by the zoom because
            // the layer scales: at 300% a plain 1px edge would be three pixels wide.
            marquee === null ? null : (0, import_react.createElement)("div", {
              style: {
                position: "absolute",
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
                border: `${1 / zoom}px solid var(--dsw-alias-brand-primary, #4f6ef7)`,
                borderRadius: 2 / zoom,
                background: "color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 12%, transparent)",
                pointerEvents: "none"
              }
            }),
            items.map(itemCard)
          )
        )
      ),
      // Outside the scroller on purpose: these two say something about the canvas
      // rather than belonging on it, and inside the scroller they would scroll out of
      // sight — the opening view is aimed at the cards, which is not the corner they
      // would be pinned to.
      phase === "loading" && items.length === 0 ? (0, import_react.createElement)("div", {
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          top: 18,
          textAlign: "center",
          fontSize: 13,
          color: "var(--dsw-alias-label-tertiary, #6b7280)"
        }
      }, t("loading")) : null,
      phase === "ready" && items.length === 0 ? (0, import_react.createElement)("div", {
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          top: 18,
          textAlign: "center",
          fontSize: 13,
          color: "var(--dsw-alias-label-tertiary, #6b7280)"
        }
      }, t("empty")) : null,
      dropping ? (0, import_react.createElement)("div", {
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 8,
          textAlign: "center",
          fontSize: 12,
          color: "var(--dsw-alias-brand-primary, #4f6ef7)"
        }
      }, t("dropHint")) : null
    )
  );
}
function TempSpaceIcon({ size, active }) {
  return (0, import_react.createElement)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: active ? 2 : 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    (0, import_react.createElement)("rect", { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
    (0, import_react.createElement)("circle", { cx: 8.5, cy: 8.5, r: 1.5 }),
    (0, import_react.createElement)("path", { d: "M4 17l5-5 4 4 3-3 4 4" })
  );
}
var name = "temp-space-client";
var inject = ["slots", "layout", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "temp-space: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      t,
      load: async () => readJson(await fetch(STATE_PATH, { headers: { accept: "application/json" } })),
      save: async (items, revision) => readJson(await fetch(STATE_PATH, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision, items })
      })),
      upload: async (file) => readJson(await fetch(`${BLOB_PATH}?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: file
      })),
      removeBlob: async (name2) => readJson(await fetch(`${BLOB_PATH}?name=${encodeURIComponent(name2)}`, {
        method: "DELETE"
      })),
      gitStatus: async () => readJson(await fetch(GIT_PATH)),
      gitAction: async (action, message) => readJson(await fetch(GIT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, message })
      })),
      reveal: async (name2) => readJson(await fetch(REVEAL_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name2 })
      })),
      clipboard: async (payload) => readJson(await fetch(CLIPBOARD_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }))
    })
  }, TempSpacePanel));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    order: 20,
    label: () => t("panel"),
    locale: NS
  }, TempSpaceIcon));
  ctx.effect(() => {
    const stop = ctx.reflect.provide("tempSpace", {
      open: () => {
        ctx.layout.selectPanel(PANEL_ID);
      },
      close: () => {
        ctx.layout.selectPanel(null);
      },
      isOpen: () => ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID
    });
    return () => {
      void stop();
    };
  }, "temp-space: panel service");
}
async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return { ok: false, reason: "transport", status: response.status, message: String(error) };
  }
}

    return module.exports;
  }
});
