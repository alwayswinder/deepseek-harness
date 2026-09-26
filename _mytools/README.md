# `_mytools` — 个人工作副本脚本层

本目录是本地覆盖层，不属于 DeepSeek 官方仓库（约定见仓库根 [AGENTS.local.md](../AGENTS.local.md)）。
所有脚本的路径都从**自身位置**推导，`$DSH_HOME` 读环境变量（未设置时回退 `~/.dsh`），没有盘符或用户名硬编码，换机器可直接用。

## 我该跑哪个

| 场景 | 跑这个 |
| --- | --- |
| 新机器第一次用，或刚拉完上游 | `build.bat`（用桌面端就 `build-desktop.bat`） |
| 日常启动网页版（默认 3080） | `start-dsh.bat` |
| 日常启动桌面端 | `start-desktop.bat` |
| 关掉网页版 | `stop-dsh.bat` |
| 持仓变了，更新对话上方那个数字 | 把账本导出的 `.xlsx` 拖到 [Plugins/dsh-ths-holdings/ths-export-positions.bat](Plugins/dsh-ths-holdings/ths-export-positions.bat) |
| 合完上游，怀疑 preset 指向了不存在的包 | 先运行 `build.bat`，再运行 `node _mytools/build/check-presets.mjs` |

## 启动 / 构建 / 停止

| 脚本 | 干什么 | 备注 |
| --- | --- | --- |
| `build.bat` | 构建整个工作副本：仅关闭当前工作副本的 Electron → 同步依赖 → `clean` → 构建 packages/CLI/Web UI，校验 CLI、profile boot 和 Web 产物，并写入当前 Git revision。 | 拉完上游或改过 `packages\`、`apps\` 后跑一次。树外插件的依赖或构建失败会立即终止。 |
| `build-desktop.bat` | 桌面端全流程：仅关闭当前工作副本的 Electron → 同步依赖 → `clean` → 构建 packages/CLI/Web UI 和 Electron shell → 准备 `.desktop-build\development` 工程与 bundled runtime，校验全部启动产物后写入 Web revision。 | 准备 runtime 会下载固定版本的 Node/Python（GitHub + PyPI），需要直连或代理；下载归档和已展开的 primary runtime 使用根目录 `.cache` 下的内容寻址缓存。 |
| `start-dsh.bat [端口]` | 启动网页版（默认 3080）。仅在构建 revision 与当前 checkout 一致时使用本地产物；启动前幂等注册插件并同步 profile 副本，然后用 node 直接跑 `apps\cli\lib\bin.js web`。 | token 链接和日志在同目录 `dsh-web.log`。别用 `pnpm dsh web` 启动同一 checkout；本地产物不可用时会依次退回全局 `dsh`、`npx`。 |
| `start-desktop.bat` | 校验 CLI profile boot、Electron、Desktop Host 和 primary runtime 是否存在，同步 desktop profile 的插件副本后启动 Electron。 | 只在启动所需文件缺失或启动器失败时报错，不根据 Git revision 判断是否需要重建。使用 `$DSH_HOME`，未设置时回退 `~/.dsh`。 |
| `stop-dsh.bat [端口]` | 按端口杀掉正在监听的进程（默认 3080）。 | 只用于网页版；桌面端关窗口就行。 |
| `build\start-dsh-service.vbs` | 供两个 `start-*.bat` 调用的隐藏启动器：把服务放进无窗口的独立进程，stdout/stderr 追加到指定日志。 | 不用直接运行。 |

## 插件支持脚本（工作副本级）

| 脚本 | 干什么 |
| --- | --- |
| `build\ensure-plugin-modules.bat` | 给 `Plugins\` 下的树外插件链接它们要从**自己目录** import 的 peer 包：`@deepseek-ai/schemastery` → `vendor\schemastery`，`@deepseek-ai/dsh-credentials` → `packages\credentials\credentials`。链接已正确就跳过，缺了就补。 |
| `build\ensure-plugin-builds.bat` | 每次都按插件自己的 lockfile 同步依赖，再重新构建"有源码"的树外插件（目前只有 `dsh-ths-holdings`），避免更新后沿用旧 `node_modules` 或 `lib\`。 |
| `build\sync-plugins.bat <profile>` | 把以 `file:` 依赖装进 profile 的插件副本（`appearance-plus`、`deepseek-usage`、`dsh-fish-tank`、`dsh-littleIcon`）刷新成 `Plugins\` 里的最新源码，含插件自带的 `assets\`、`pet\`、`locale\` 目录；内容相同就不写。由 `start-dsh.bat`、`start-desktop.bat` 在每次启动前调用。 |

`build\ensure-plugin-*.bat` 由 `build.bat` / `build-desktop.bat` 自动调用，`build\sync-plugins.bat` 由两个 `start-*.bat` 自动调用，平时都不用手点。

`build-desktop.bat` 在第一次使用新流程时会把旧的 `apps\desktop\.desktop-build\downloads` 内容迁移到 `.cache\desktop-downloads`。后续 `clean` 仍会删除编译产物和开发工程，但保留下载归档，以及按目标、Desktop 版本和 payload 摘要索引的 `.cache\desktop-primary-runtime`；归档只在锁定哈希变化时重新下载，primary runtime 只在目标、版本、解释器、wheel 或 pnpm 输入变化时重新展开。构建目录通过 junction 使用缓存的 primary runtime，Office skill 资产仍从当前源码刷新，所有 native-target 检查仍会执行。

以 `file:` 依赖装进 profile 的插件是**一次性副本**（pnpm 不记录内容哈希），所以只改 `Plugins\` 里的源码而不重启启动脚本，界面会一直是旧的。以 `link:` 装的插件（`dsh-ths-holdings`）本身指向源码目录，不需要这一步。

## 树外插件（`Plugins\`）

| 插件 | 作用 | 装在哪个 profile |
| --- | --- | --- |
| `appearance-plus` | 插件页增加五套护眼配色、背景图片编辑器，以及空闲锁屏壁纸：无操作满设定秒数后整屏换成锁屏图；桌面端连系统标题栏和三个窗口按钮一起清掉，窗口状态不变。 | web、desktop |
| `deepseek-usage` | 设置页的用量/余额卡片；**对话输入框上方那条汇总**（余额、今日消费 —— 现在最前面还有一个不标单位的持仓盈亏数字）。 | web、desktop |
| `dsh-littleIcon` | 桌面桌宠：独立于 DSH 窗口的置顶透明小窗（PowerShell + WPF），可拖动、按 agent 状态换表情，单击收起/恢复 DSH 主窗口；右键与托盘菜单第一项「对话」在 DSH 自己的右侧 Browser 标签里开 chat.deepseek.com，最后一项「退出 DSH」结束应用；DSH 切到后台就自动收起，等用户回答时举着「惊讶」。桌宠自己不在菜单里退出，生死由「启用桌宠」开关控制。 | desktop（web 可装，但那里不控制窗口） |
| `dsh-ths-holdings` | 持仓实时盈亏的数据源：注册 `/api/stock-pnl`，用导出的持仓 + 腾讯公开行情算出当日盈亏、上证指数和分时。 | desktop |
| `dsh-pocket` | 手机扫码访问电脑上的 DSH：设置页「手机访问」，局域网二维码（代理监听 3081）+ cloudflared 公网隧道，WebSocket 透传实时同屏。第三方插件（作者 shaobeichen，GPL-2.0）。 | desktop |

`Plugins\node_modules\@deepseek-ai\` 是给上面这些插件用的 peer 链接，由 `build\ensure-plugin-modules.bat` 维护，不要手改。

`dsh-pocket` 的 `lib\service.mjs` 用 `require('qrcode')` 生成二维码，而它以 `link:` 装进 profile（不是 `file:` 副本），所以要在**插件目录自己**装依赖：新机器上先 `cd Plugins\dsh-pocket && npm ci --omit=dev --legacy-peer-deps`，否则设置页里二维码是空图。它不跟着 `build\sync-plugins.bat` 走 —— 那里的文件清单只覆盖 `index.js`/`client.js` 这类布局，而它是 `lib\` + `client\`，`link:` 生效靠的是 junction。

### `dsh-ths-holdings` 的数据

| 文件 | 说明 |
| --- | --- |
| `positions.json` | **唯一需要维护的数据文件**，每条 `code / name / qty / cost`。已被 `.gitignore` 忽略（真实持仓，而这个仓库是公开的）。 |
| `ths-export-positions.bat` | 把账本导出的 `.xlsx` 拖上来 → 重写同目录的 `positions.json`。不用重启，20 秒内生效。 |
| `ths-export-positions.py` | 上面那个的实体（xlsx → json）。需要一个装了 openpyxl 的 Python：脚本优先用 DSH 桌面运行时自带的那个，找不到会给出提示。 |

- 没配 Cookie 时走"导出持仓 + 公开行情"这条本地通路；以后若在设置里存了 `STOCK_PNL_COOKIE`，插件会自动切回账本接口。
- 换机器：代码跟仓库走，`positions.json` 不跟（隐私）——新机器上拖一次 xlsx 就有数了。

## 其它文件

| 文件 | 说明 |
| --- | --- |
| `build\check-presets.mjs` | 让已构建的本地 CLI 组合 Web profile，再检查每个 `preset-*` 声明引用的插件包能否从该 profile 解析。用法 `node _mytools/build/check-presets.mjs`，退出码 1 表示有坏的。 |
| `build\prepare-desktop.ts` | 桌面端开发工程的准备逻辑，由 `build-desktop.bat` 调用。 |
| `.gitattributes` | 固定 `*.bat` 以 CRLF 检出（cmd 按 CRLF 解析）。 |
| `dsh-web.log` | `start-dsh.bat` 本次启动的日志；服务还在跑时该文件被占用，会改用 `dsh-web-<随机>.log`。 |
| `ai-game\` | 个人东西（ATB 回合制战斗 demo，纯 HTML/CSS/JS），与 DSH 运行无关。 |
| `bg\` | 背景图素材。 |

## 约定

- 只在本目录内改动；`packages/`、`apps/`、`scripts/`、`docs/`、`snapshots/` 是上游文件，保持原样。**目前只有一处例外**：为让侧栏内嵌浏览器保住登录，改过 `apps/desktop/src/browser-guests.ts`（另加一个测试文件）并同步了 `packages/client/ui-sidebar-browser` 的文档与类型 JSDoc；改动清单、重建命令与「合并上游后怎么恢复」见 [Plugins/dsh-littleIcon/UPSTREAM.md](Plugins/dsh-littleIcon/UPSTREAM.md)。
- 新增脚本：路径从自身位置推导，不写盘符/用户名；`.bat` 保持 CRLF。
- 不把凭证（`$DSH_HOME\.credentials.yaml`）和持仓数据提交进仓库 —— 这个 fork 是公开的。
