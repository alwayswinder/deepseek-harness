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
| 合完上游，怀疑 preset 指向了不存在的包 | `node _mytools/check-presets.mjs` |

## 启动 / 构建 / 停止

| 脚本 | 干什么 | 备注 |
| --- | --- | --- |
| `build.bat` | 构建整个工作副本：装依赖 → `clean` → 构建 packages/CLI/Web UI，最后校验 `apps\cli\lib\bin.js` 与 `apps\web\dist\index.html` 都在。 | 拉完上游或改过 `packages\`、`apps\` 后跑一次。中途会调用下面两个 `ensure-plugin-*.bat`。 |
| `build-desktop.bat` | 桌面端全流程：上面那些 → Electron shell（`build:desktop`）→ 准备 `.desktop-build\development` 工程与 bundled runtime，并写 `build-revision.txt`。 | 准备 runtime 会下载固定版本的 Node/Python（GitHub + PyPI），需要直连或代理。 |
| `start-dsh.bat [端口]` | 启动网页版（默认 3080）。启动前幂等地把 `deepseek-usage` 注册进 web profile 并刷新 profile 里的插件副本，然后用 node 直接跑 `apps\cli\lib\bin.js web`；token 链接和日志在同目录 `dsh-web.log`。 | 别用 `pnpm dsh web` 起同一棵树（会串模块面，工具全部报 `prepare` 未定义）。本地没构建时会依次退回全局 `dsh`、`npx`。 |
| `start-desktop.bat` | 启动 Electron 桌面端，加载 `apps\desktop\.desktop-build\development` 里已准备好的工程，profile 用 `$DSH_HOME\profiles\desktop`。 | 必须先跑过 `build-desktop.bat`。关窗口即停。 |
| `stop-dsh.bat [端口]` | 按端口杀掉正在监听的进程（默认 3080）。 | 只用于网页版；桌面端关窗口就行。 |
| `start-dsh-service.vbs` | 供两个 `start-*.bat` 调用的隐藏启动器：把服务放进无窗口的独立进程，stdout/stderr 追加到指定日志。 | 不用直接运行。 |

## 插件支持脚本（工作副本级）

| 脚本 | 干什么 |
| --- | --- |
| `ensure-plugin-modules.bat` | 给 `Plugins\` 下的树外插件链接它们要从**自己目录** import 的 peer 包：`@deepseek-ai/schemastery` → `vendor\schemastery`，`@deepseek-ai/dsh-credentials` → `packages\credentials\credentials`。链接已正确就跳过，缺了就补。 |
| `ensure-plugin-builds.bat` | 给"有源码、没 `lib\`"的树外插件做一次性构建（目前只有 `dsh-ths-holdings`）。已构建就跳过；首次会 `pnpm install --frozen-lockfile`，需要能访问 npm 镜像。 |

这两个都由 `build.bat` / `build-desktop.bat` 自动调用，平时不用手点。

## 树外插件（`Plugins\`）

| 插件 | 作用 | 装在哪个 profile |
| --- | --- | --- |
| `appearance-plus` | 插件页增加五套护眼配色、背景图片编辑器，以及空闲锁屏壁纸：无操作满设定秒数后整屏换成锁屏图；桌面端连系统标题栏和三个窗口按钮一起清掉，窗口状态不变。 | web、desktop |
| `deepseek-usage` | 设置页的用量/余额卡片；**对话输入框上方那条汇总**（余额、今日消费 —— 现在最前面还有一个不标单位的持仓盈亏数字）。 | web、desktop |
| `dsh-ths-holdings` | 持仓实时盈亏的数据源：注册 `/api/stock-pnl`，用导出的持仓 + 腾讯公开行情算出当日盈亏、上证指数和分时。 | desktop |

`Plugins\node_modules\@deepseek-ai\` 是给上面这些插件用的 peer 链接，由 `ensure-plugin-modules.bat` 维护，不要手改。

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
| `check-presets.mjs` | 体检 `$DSH_HOME\.agent-presets` 里的 preset 是否还指向存在的包（合上游后行名很容易过期）。用法 `node _mytools/check-presets.mjs [--all]`，退出码 1 表示有坏的。 |
| `prepare-desktop.ts` | 桌面端开发工程的准备逻辑，由 `build-desktop.bat` 调用。 |
| `.gitattributes` | 固定 `*.bat` 以 CRLF 检出（cmd 按 CRLF 解析）。 |
| `dsh-web.log` | `start-dsh.bat` 本次启动的日志；服务还在跑时该文件被占用，会改用 `dsh-web-<随机>.log`。 |
| `ai-game\` | 个人东西（ATB 回合制战斗 demo，纯 HTML/CSS/JS），与 DSH 运行无关。 |
| `bg\` | 背景图素材。 |

## 约定

- 只在本目录内改动；`packages/`、`apps/`、`scripts/`、`docs/`、`snapshots/` 是上游文件，保持原样。
- 新增脚本：路径从自身位置推导，不写盘符/用户名；`.bat` 保持 CRLF。
- 不把凭证（`$DSH_HOME\.credentials.yaml`）和持仓数据提交进仓库 —— 这个 fork 是公开的。
