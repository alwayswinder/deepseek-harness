# 本副本动过的上游文件

这个工作副本按约定不改上游（见仓库根 `AGENTS.local.md`），只有下面这一处例外，**记录在此以便合并上游后恢复**。

原因：插件的**对话**菜单项把 chat.deepseek.com 开在 DSH 自己的右侧 Browser 标签里，而那个内嵌浏览器的存储分区原来是进程级的——Cookie 与 localStorage 随 DSH 退出消失，所以每次重启都要重新登录一次 chat。分区归 `apps/desktop` 管，插件碰不到：宿主半边跑在 `ELECTRON_RUN_AS_NODE` 子进程里没有 Electron API，浏览器半边是 sandbox + contextIsolation，而 `platform-view.ts` 那条注入账号 Cookie 的路只认 `platform.deepseek.com` 的 `/usage` 与 `/top_up`。所以只能在上游把分区改成持久的。

## 改动清单

| 文件 | 恢复内容 |
| --- | --- |
| `apps/desktop/src/browser-guests.ts` | 新增 `browserPartition(workspace)`：`persist:dsh-sidebar-browser-` + 工作区标识的 sha256 前 32 位（标识形如 `cwd:D:\...`／`session:<id>`，带 `\`、`:` 不能直接当目录名）；`acquire()` 用它替换原来的 `` `dsh-sidebar-browser-${randomUUID()}` ``；类、`acquire`、`release` 的 JSDoc 改成「持久分区」的说法 |
| `apps/desktop/tests/browser-guests.spec.ts` | 新增文件，4 条断言：分区名形状、同一工作区复用且只配置一次、重启后同名、非法工作区仍报错 |
| `packages/client/ui-sidebar-browser/README.md`、`README.zh.md`、`README.i18n.yaml` | 把「进程内存储分区 / Cookie 不跨重启」那句改成「每个工作区一个持久分区 / 跨重启保留」，两侧改完用 `pnpm exec tsx scripts/verify-translation-pairing.ts --write packages/client/ui-sidebar-browser/README.md` 重新记录摘要 |
| `packages/client/ui-sidebar-browser/src/types.ts` | `DesktopBrowserReservation` 的 JSDoc：`process-local` 改成跨重启的持久分区 |

核心就是这一段（合并后若被上游改回 `randomUUID`，把它换回来）：

```ts
function browserPartition(workspace: string): string {
  const digest = createHash('sha256').update(workspace).digest('hex')
  return `persist:dsh-sidebar-browser-${digest.slice(0, 32)}`
}
```

## 重建与确认

改的是 Electron 主进程，**只重启不生效**（`start-desktop.bat` 是 `--skip-build`）。只动了主进程时不必走 `build-desktop.bat` 的全量流程，重建这一个包就够：

```powershell
pnpm --filter @deepseek-ai/dsh-desktop run build
(Select-String apps\desktop\lib\main.js -Pattern 'persist:dsh-sidebar-browser').Matches.Value   # 应出现
(Select-String apps\desktop\lib\main.js -Pattern 'dsh-sidebar-browser-\$\{randomUUID' -Quiet)  # 应消失
```

生效后应用用户数据下会出现 `Partitions\dsh-sidebar-browser-<32 位摘要>`；开发流程用的是 `apps/desktop/.desktop-build/development/electron-user-data/`。侧栏分区的键是**工作区**：当前对话属于某个工作区时是 `cwd:<路径>`（稳定，重启、换对话都共用），不属于任何工作区时退化成 `session:<对话 id>`（换新对话就是新分区）。

## 这处改动做不到什么

- **不是自动登录。** DSH 手里的凭据属于 `platform.deepseek.com`，chat.deepseek.com 是另一套 Web 会话；做到的只是「登录一次，之后跨重启保留」。DeepSeek 自己还会对嵌入式环境提示「使用环境异常」，那是服务端判断。
- **如果登录仍然不保留**，说明 chat 把会话放在 `sessionStorage` 或按设备指纹绑定——那要换方案，例如把菜单项改成开一个新的 DSH 会话（用的是已登录的 DSH 账号，不碰网页登录）。
