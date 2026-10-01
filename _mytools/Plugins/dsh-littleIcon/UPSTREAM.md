# 本副本动过的上游文件

这个工作副本按约定不改上游（见仓库根 `AGENTS.local.md`），只有下面这几处例外，**记录在此以便合并上游后恢复**。

原因：插件的**对话**菜单项把 chat.deepseek.com 开在 DSH 自己的右侧 Browser 标签里，而那个内嵌浏览器的存储分区原来是进程级的——Cookie 与 localStorage 随 DSH 退出消失，所以每次重启都要重新登录一次 chat。分区归 `apps/desktop` 管，插件碰不到：宿主半边跑在 `ELECTRON_RUN_AS_NODE` 子进程里没有 Electron API，浏览器半边是 sandbox + contextIsolation，而 `platform-view.ts` 那条注入账号 Cookie 的路只认 `platform.deepseek.com` 的 `/usage` 与 `/top_up`。所以只能在上游把分区改成持久的。

## 改动清单

| 文件 | 恢复内容 |
| --- | --- |
| `apps/desktop/src/browser-guests.ts` | 新增 `browserPartition(workspace)`：`persist:dsh-sidebar-browser-` + 工作区标识的 sha256 前 32 位（标识形如 `cwd:D:\...`／`session:<id>`，带 `\`、`:` 不能直接当目录名）；`acquire()` 用它替换原来的 `` `dsh-sidebar-browser-${randomUUID()}` ``；类、`acquire`、`release` 的 JSDoc 改成「持久分区」的说法 |
| `apps/desktop/tests/browser-guests.spec.ts` | 新增文件，4 条断言：分区名形状、同一工作区复用且只配置一次、重启后同名、非法工作区仍报错 |
| `packages/client/ui-sidebar-browser/README.md`、`README.zh.md`、`README.i18n.yaml` | 把「进程内存储分区 / Cookie 不跨重启」那句改成「每个工作区一个持久分区 / 跨重启保留」，两侧改完用 `pnpm exec tsx scripts/verify-translation-pairing.ts --write packages/client/ui-sidebar-browser/README.md` 重新记录摘要 |
| `packages/client/ui-sidebar-browser/src/types.ts` | `DesktopBrowserReservation` 的 JSDoc：`process-local` 改成跨重启的持久分区 |
| `apps/desktop/src/main.ts` | 新增常量 `LITTLE_ICON_SHOW_WINDOW_MESSAGE = 0x8001`；`createMainWindow` 里（仅 win32）`window.hookWindowMessage(该消息, () => window.show())`。根因：点 X 时 `window.hide()` 让 Electron 节流渲染并保持页面 `visibilityState=hidden`；桌宠用外部 `ShowWindow(SW_RESTORE)` 恢复，Electron 只同步了 OS 层与 `isVisible()`，页面仍在 hidden、画面冻结。桌宠恢复后 `PostMessage` 该消息，主进程补一次 `show()`（对已可见窗口无害）把 `visibilityState` 翻回 visible。实测（Electron 44）：外部 SW_RESTORE / SW_MINIMIZE→SW_RESTORE / WM_SYSCOMMAND SC_RESTORE / SetForegroundWindow 都无法让 `document.visibilityState` 离开 hidden、定时器停在 1Hz；只有 `win.show()` 触发 `EVENT_SHOW` 后满速恢复；`hookWindowMessage` 能收到外部 PostMessage |
| `.gitignore` | 加两行本副本自己的忽略项：`.pnpm-store/` 之后加 `.pnpm-tools/`，末尾加 `_mytools/build/dsh-web*.log`（启动脚本写的日志，不该进 git） |

核心就是这一段（合并后若被上游改回 `randomUUID`，把它换回来）：

```ts
function browserPartition(workspace: string): string {
  const digest = createHash('sha256').update(workspace).digest('hex')
  return `persist:dsh-sidebar-browser-${digest.slice(0, 32)}`
}
```

## 重建与确认

改的是 Electron 主进程，**只重启不生效**（`start-desktop.bat` 是 `--skip-build`）。只动了主进程时不必走 `build.bat` 的全量流程，重建这一个包就够：

```powershell
pnpm --filter @deepseek-ai/dsh-desktop run build
(Select-String apps\desktop\lib\main.js -Pattern 'persist:dsh-sidebar-browser').Matches.Value   # 应出现
(Select-String apps\desktop\lib\main.js -Pattern 'dsh-sidebar-browser-\$\{randomUUID' -Quiet)  # 应消失
```

生效后应用用户数据下会出现 `Partitions\dsh-sidebar-browser-<32 位摘要>`；这个用户数据目录由 `start-desktop.bat` 用 `--user-data-dir` 指定，现在是 `$DSH_HOME\desktop\electron-user-data`——它以前在 `apps\desktop\.desktop-build\development\electron-user-data`，而 `pnpm run clean` 会删掉整棵 `.desktop-build`，所以上游这份持久分区虽然扛过了重启，却扛不过每次完整构建（表现就是「重新 build 后又要重新登录」）；把它挪出构建树的是工作副本自己的 `_mytools\build\migrate-desktop-user-data.bat`，不是上游改动。侧栏分区的键是**工作区**：当前对话属于某个工作区时是 `cwd:<路径>`（稳定，重启、换对话都共用），不属于任何工作区时退化成 `session:<对话 id>`（换新对话就是新分区）。

### main.ts + pet.ps1 的「外部恢复后补 show()」改动

`apps/desktop/src/main.ts` 与桌宠 `pet/pet.ps1` 一起改（配对改动，缺一不可）。桌宠侧同样是 `_mytools/Plugins/dsh-littleIcon/pet/pet.ps1`（不是上游文件，但同属这一处修复，记录在此一并说明）。

重建桌面包：

```powershell
pnpm --filter @deepseek-ai/dsh-desktop run build
(Select-String apps\desktop\lib\main.js -Pattern 'LITTLE_ICON_SHOW_WINDOW_MESSAGE').Matches.Value   # 应出现
(Select-String apps\desktop\lib\main.js -Pattern 'hookWindowMessage').Matches.Value                # 应出现
```

桌宠侧不用重建，改 `pet/pet.ps1` 后把设置里的**启用桌宠**关掉再打开（或重启 DSH）即可。

复现路径（验证改动是否生效）：点 DSH 右上角 X 隐藏到托盘 → 点桌宠恢复 → 页面应立即恢复响应（之前是恢复后卡住、画面冻结在隐藏前那一帧）。消息号 `0x8001` 在 main.ts 与 pet.ps1 两处各有一份，改一处必须同步另一处。

## 这处改动做不到什么

- **不是自动登录。** DSH 手里的凭据属于 `platform.deepseek.com`，chat.deepseek.com 是另一套 Web 会话；做到的只是「登录一次，之后跨重启保留」。DeepSeek 自己还会对嵌入式环境提示「使用环境异常」，那是服务端判断。
- **如果登录仍然不保留**，说明 chat 把会话放在 `sessionStorage` 或按设备指纹绑定——那要换方案，例如把菜单项改成开一个新的 DSH 会话（用的是已登录的 DSH 账号，不碰网页登录）。
