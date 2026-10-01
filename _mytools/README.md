# `_mytools` — 个人工作副本脚本层

本目录是本地覆盖层，不属于 DeepSeek 官方仓库（约定见仓库根 [AGENTS.local.md](../AGENTS.local.md)）。
所有脚本的路径都从**自身位置**推导，`$DSH_HOME` 读环境变量（未设置时回退 `~/.dsh`），没有盘符或用户名硬编码，换机器可直接用。

## 我该跑哪个

脚本都在 `build\` 下（`_mytools` 根目录只剩 `Plugins\`、素材和这份说明）；下面的路径相对 `_mytools\`。

| 场景 | 跑这个 |
| --- | --- |
| 新机器第一次用，或刚拉完上游 | `build\build.bat`（两端一次构建完） |
| 刚说完「更新上游」（让 AI 一条龙跑） | 直接说就行；手动跑 `build\update-and-build.bat` |
| DSH 正开着，改的是宿主侧代码 | `build\build.bat quick`，然后重启应用 |
| DSH 正开着，改的是客户端/Web 或刚合完上游 | `build\build.bat --detached --restart`（会关掉它，重建完自己回来） |
| 日常启动网页版（默认 3080） | `build\start-dsh.bat` |
| 日常启动桌面端 | 开始菜单/桌面上的「DeepSeek Harness」图标，或 `build\start-desktop.bat` |
| 还没装那个图标（每台机器一次） | `build\make-shortcut.bat`；不想要了 `build\make-shortcut.bat --remove` |
| 关掉网页版 | `build\stop-dsh.bat` |
| 持仓变了，更新对话上方那个数字 | 把账本导出的 `.xlsx` 拖到 [Plugins/dsh-ths-holdings/ths-export-positions.bat](Plugins/dsh-ths-holdings/ths-export-positions.bat) |
| 合完上游，build 报奇怪的错 | `build\build.bat`（它会先跑 preflight 把常见问题指名）；还不行就 `build\build.bat repair` |

## 启动 / 构建 / 停止

| 脚本 | 干什么 | 备注 |
| --- | --- | --- |
| `build\build.bat` | **两端的唯一构建入口**：清环境变量 → preflight → 树外插件两件套 → 依赖（`--frozen-lockfile` 顺便校验 lockfile 是否跟上游一致）→ 停本工作副本的 Electron → `clean` → `pnpm run build`（packages/CLI/Web）→ `build:desktop`（Electron 壳）→ `prepare-desktop.ts`（开发工程 + bundled runtime）→ 校验全部产物 → 写 revision → preset 体检。 | 拉完上游或改过 `packages\`、`apps\` 后跑一次。准备 runtime 会下载固定版本的 Node/Python（GitHub + PyPI），需要直连或代理；归档与 primary runtime 走 `.cache` 内容寻址缓存。 |
| `build\build.bat web` | 只构建 Web/CLI 那一半：不停 Electron 之外与上面同步骤，不做 `build:desktop`、不准备 runtime。 | 纯网页版、或不想下载运行时的时候用，快很多。 |
| `build\build.bat quick` | **不关 app 的宿主半边重建**：跳过 `clean` 与运行时准备，只跑 `build:lib:host` + `build:desktop`。 | **故意不碰 Web UI 与任何 `lib/client.js`**——运行中的宿主每 500ms 轮询这些 bundle（[packages/client/hmr](../packages/client/hmr/src/index.ts)）并让浏览器重载，就地重写会让浏览器 import 到半成品，页面白屏到刷新/重启为止（实测过）。宿主半边不写客户端 bundle，因此没有这个竞态；宿主代码是启动时读的，所以跑完仍需重启应用。**客户端/Web 的改动请走完整构建。** |
| `build\build.bat repair` | 停 app → 删掉工作副本里的 `node_modules`（`apps\desktop` 那个留着，里面是 Electron 二进制）→ 重装 → 走完整两端流程。 | 大合并后依赖树乱掉时的钝器；慢，但常常比逐个查快。 |
| `build\build.bat --detached [--restart]` | 用 WMI 把构建放到本进程树之外跑（父进程是 WmiPrvSE），控制台实时显示输出并同步写日志，结束时写结果文件；失败时窗口会留下来供查看，`--restart` 会在成功后自动 `start-desktop.bat` 把 app 拉回来。 | 这是「让 DSH 自己重建自己」的正规路径：构建要关掉 app，而任何从 app 里起的 shell 都会跟着死。 |
| `build\build-desktop.bat` | 兼容壳：转发到 `build.bat desktop`。 | 老快捷方式/笔记不用改。 |
| `build\start-dsh.bat [端口]` | 启动网页版（默认 3080）。仅在构建 revision 与当前 checkout 一致时使用本地产物；启动前幂等注册插件并同步 profile 副本，然后用 node 直接跑 `apps\cli\lib\bin.js web`。 | token 链接和日志在同目录 `dsh-web.log`。别用 `pnpm dsh web` 启动同一 checkout；本地产物不可用时会依次退回全局 `dsh`、`npx`。 |
| `build\start-desktop.bat` | 校验 CLI profile boot、Electron、Desktop Host 和 primary runtime 是否存在，同步 desktop profile 的插件副本后启动 Electron。Electron 的 `--user-data-dir` 固定在 `$DSH_HOME\desktop\electron-user-data`。 | 只在启动所需文件缺失或启动器失败时报错，不根据 Git revision 判断是否需要重建。使用 `$DSH_HOME`，未设置时回退 `~/.dsh`。浏览器数据放在 `$DSH_HOME` 下是为了躲开 `clean`，理由见下面「构建模式与『自己 build 自己』」。 |
| `build\stop-dsh.bat [端口]` | 按端口杀掉正在监听的进程（默认 3080）。 | 只用于网页版；桌面端关窗口就行。 |
| `build\start-dsh-service.vbs` | 供两个 `start-*.bat` 调用的隐藏启动器：把服务放进无窗口的独立进程，stdout/stderr 追加到指定日志。 | 不用直接运行。 |
| `build\make-shortcut.bat` | 把「DeepSeek Harness」装进开始菜单（默认还有桌面）：带应用图标、点开不弹控制台、失败时弹一个带日志尾巴的对话框。`--start-menu-only` 只要开始菜单，`--remove` 删掉。 | 每台机器跑一次；重复跑就是刷新。见下面「像应用一样启动」。 |
| `build\update-and-build.bat` | **「更新上游」一条龙入口**：`--check` 预检 → `git fetch <上游>` → `git merge --no-edit <上游>/master`（冲突即 `--abort` 停下，exit 2）→ preflight（exit 2 时停下，exit 3）→ `write-resume-plan.ps1` 写契约 → `build.bat --detached --restart`。上游 remote 名由脚本解析：有 `deepseek-ai` 就用它，否则用 `upstream`（两个都没有时报错并给出 `git remote add` 命令）。`--push` 才会在 merge 后推 `origin master`；`--check` 只查环境不做事；`--no-pause` 免按键。 | 说「更新上游」就按它跑（约定见仓库根 [AGENTS.local.md](../AGENTS.local.md) 的「更新上游」节）。**完整构建会停掉本副本的 Electron，而会话跑在 app 进程树里——被停瞬间当前 turn 中断是机制不是失败**；detached 构建活到完成、自动把 app 拉回来，回来后读 `resume-plan.json` + `last-build.json` 收尾。 |

### 像应用一样启动（图标 + 无控制台）

`build\make-shortcut.bat` 建的快捷方式指向 [build\launch-desktop.vbs](build/launch-desktop.vbs)，而不是那个 `.bat`：

```
快捷方式 → wscript.exe launch-desktop.vbs        （隐藏运行，设 DSH_NO_PAUSE=1）
        → start-desktop.bat                      （校验产物、同步插件副本、接管 stderr）
        → start-dsh-service.vbs → electron.exe   （脱离控制台运行）
```

所以点它没有黑框一闪；失败时 `launch-desktop.vbs` 会把 `%TEMP%\dsh-desktop-launch.log` 的尾巴弹成对话框（隐藏运行看不到控制台，错误必须自己冒出来）。`build\start-desktop.bat` 里四个 `pause` 都改成 `call :maybePause`，只有 `DSH_NO_PAUSE` 未定义时才真的等按键。

图标由 [build\make-app-icon.mjs](build/make-app-icon.mjs) 从 **`apps\desktop\resources\icon-windows.svg`** 现场光栅化成 9 个尺寸（16…256）的 `.ico`，写到 `$DSH_HOME\build\dsh.ico`——不进仓库。**不用**已提交的 `resources\tray-windows.ico`：那是为 16px 托盘特意放大过鲸鱼的版本，放到 48px 以上会显得太满。

**一个说清楚的限制**：dev 模式下**窗口和任务栏图标仍是 Electron 的**——`apps\desktop\src\main.ts` 里只有退出确认对话框设了图标，`createWindow` 没设，窗口图标于是来自 `electron.exe`。想要连任务栏、exe、卸载项都正式，那是**打包**那条路：

```powershell
pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:unsigned   # → deepseek-harness-<版本>-win-x64-unsigned.exe
```

它产出 NSIS 安装包（`productName: DeepSeek Harness`、开始菜单项、卸载器、exe 图标），代价是**冻结快照**：每次合完上游都要重新打包重装，而且未签名会吃 SmartScreen 提示。所以日常用「快捷方式 + 本仓库构建」，只有在想要一个真正像产品的入口时才打包。

### 构建模式与「自己 build 自己」

完整构建的第一步是 `clean`，而 [scripts/clean.ts](../scripts/clean.ts) 会删 `apps\desktop\.desktop-build`——**那正是运行中的桌面端所在的地方**（宿主进程的 `project\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js` 就在里面；Electron 的 `--user-data-dir` 本来也在里面，现已挪到 `$DSH_HOME\desktop\electron-user-data`）。所以完整构建必须先停掉本工作副本的 Electron；而任何从 DSH 里起的 shell 都是它的后代，会跟着一起死。三条出路：

1. **`build\build.bat quick`**：不关 app，只重建**宿主半边**（packages host 面、CLI、Electron 壳），跑完重启应用生效。日常改宿主侧代码用它就够。
2. **`build\build.bat --detached --restart`**：完整构建，但用 WMI 起进程脱离这棵树，因此 app 关掉它还能继续；日志与结果落盘，成功后自己把 app 拉回来。会话是持久的，app 回来后同一个对话里读结果接着干。**上游合并、客户端/Web 改动都走这条。**
3. **`build\build.bat repair`**：上面两条都不灵时的钝器。

**为什么不能在 app 开着的时候就地重建客户端那一半**：宿主里的 `packages/client/hmr` 每 500ms 轮询每个 `lib/client.js`，一变就把「重建了」推给浏览器去重新 import。就地重写这些文件时，浏览器会撞上写到一半的 bundle，整个客户端图起不来（表现就是窗口还在、内容全白），要刷新甚至重启才恢复。`quick` 因此刻意只做宿主半边；客户端那一半只在 app 已经关掉的完整构建里重写，没有这个竞态。构建记录（`.dsh-build\client-build-environment.json`）只有发布打包和 `test:web` 读，运行时不校验，但它会因此过期，下次完整构建重写。

### 构建日志与结果

每次都写 `$DSH_HOME\build\last-build.json`（模式、走到哪一步、退出码、revision、日志路径、时间）；`--detached` 的控制台实时显示构建输出，并把同一份内容写进 `$DSH_HOME\build\logs\build-<时间戳>.log`。构建失败时窗口保留最终错误、失败步骤和日志路径，按 Enter 后关闭；这两个文件也可供 app 重新打开后继续核验。「更新上游」那条链路（`update-and-build.bat`）还会在构建前多写一个 `$DSH_HOME\build\resume-plan.json`——任务契约（仓库、revision、日志路径、预期产物清单），app 回来后的下一轮 turn 照它核验"这场构建该有什么"，而不是只看结果状态。

`build\preflight.mjs` 在任何破坏性动作之前跑，专门抓上游合并最常踩的几件事并指名修法：Node/pnpm 与 `engines` 不符、**tsconfig 引用的包在磁盘上不存在**（上游删包/改名的经典伤）、存在但没被任何编译面引用的包、树外插件的 peer 链接缺失。退出码 2 = 拦下（此时什么都还没动）。

### 完整构建失败、桌面端起不来了怎么办

完整构建先 `clean`，产物（`apps\cli\lib`、`apps\web\dist`、`apps\desktop\lib`、`packages\*\lib`）会被删掉；如果构建没能跑完，桌面端就没有可启动的东西了，我也就没有运行环境可说话。这时用**不依赖本地产物的入口**回来：`build\start-dsh.bat` 在本地产物缺失时会依次退回全局 `dsh`、`npx --yes @deepseek-ai/dsh web`（见脚本里的 launch order），起一个网页版。会话存在 `$DSH_HOME\sessions\`（不分 profile），所以那个网页版里能看到同一个会话列表，把这段对话接着往下聊，我就能照 `$DSH_HOME\build\last-build.json` 与日志把它修好。


## 插件支持脚本（工作副本级）

| 脚本 | 干什么 |
| --- | --- |
| `build\ensure-plugin-modules.bat` | 给 `Plugins\` 下的树外插件链接它们要从**自己目录** import 的 peer 包：`@deepseek-ai/schemastery` → `vendor\schemastery`，`@deepseek-ai/dsh-credentials` → `packages\credentials\credentials`。链接已正确就跳过，缺了就补。 |
| `build\ensure-plugin-builds.bat` | 每次都按插件自己的 lockfile 同步依赖，再重新构建"有源码"的树外插件（目前只有 `dsh-ths-holdings`），避免更新后沿用旧 `node_modules` 或 `lib\`。 |
| `build\sync-plugins.bat <profile>` | 把**以 `file:` 副本装进 profile** 的插件（`appearance-plus`、`deepseek-usage`、`dsh-fish-tank`、`dsh-aquarium3d`、`dsh-littleIcon`）刷新成 `Plugins\` 里的最新源码，含插件自带的 `assets\`、`pet\`、`locale\`、`src\`、`vendor\`、`tools\` 目录；内容相同就不写。装成 `link:`（junction）的插件实测跳过——profile 加载的就是源码本身，没有副本要刷新。由 `start-dsh.bat`、`start-desktop.bat` 在每次启动前调用。 |

`build\ensure-plugin-*.bat` 由 `build\build.bat`（任何模式）自动调用，`build\sync-plugins.bat` 由两个 `start-*.bat` 自动调用，平时都不用手点。

完整构建在第一次使用新流程时会把旧的 `apps\desktop\.desktop-build\downloads` 内容迁移到 `.cache\desktop-downloads`。后续 `clean` 仍会删除编译产物和开发工程，但保留下载归档，以及按目标、Desktop 版本和 payload 摘要索引的 `.cache\desktop-primary-runtime`；归档只在锁定哈希变化时重新下载，primary runtime 只在目标、版本、解释器、wheel 或 pnpm 输入变化时重新展开。构建目录通过 junction 使用缓存的 primary runtime，Office skill 资产仍从当前源码刷新，所有 native-target 检查仍会执行。

同一个道理，Electron 的浏览器数据（`--user-data-dir`：侧栏内嵌浏览器的 Cookie 与 localStorage、platform 账号页的存储都在这里）以前待在 `clean` 会删的那棵树里，于是每次完整构建都要重新登录 chat.deepseek.com 一次。现在它固定在 `$DSH_HOME\desktop\electron-user-data`，`build\start-desktop.bat` 每次都指向那里；[build\migrate-desktop-user-data.bat](build/migrate-desktop-user-data.bat) 在 `build.bat` 的 `clean` 之前、以及每次启动之前把旧位置的数据整体搬过来——只在目标还没有 `Partitions` 时搬（Electron 已经在那里建过存储就说明那里有不能覆盖的东西），拷贝失败（上一个实例还占着 Cookie 数据库）就整份丢弃，下次启动重试。

以 `file:` 依赖装进 profile 的插件是**一次性副本**（pnpm 不记录内容哈希），所以只改 `Plugins\` 里的源码而不重启启动脚本，界面会一直是旧的。以 `link:` 装的插件本身指向源码目录（`dsh-ths-holdings`，以及本机 desktop profile 里的全部 5 个），不需要这一步。**装成了哪一种要实测，不要按插件名推断**：`Get-Item <profile>\node_modules\@local\<包名> | Select-Object LinkType,Target` 有值就是链接、是空就是副本（2026-10-01 实测：desktop 全是 junction，web 里 `dsh-deepseek-usage` 是副本）。

## 树外插件（`Plugins\`）

| 插件 | 作用 | 装在哪个 profile |
| --- | --- | --- |
| `appearance-plus` | 插件页增加五套护眼配色、背景图片编辑器，以及空闲锁屏壁纸：无操作满设定秒数后整屏换成锁屏图；桌面端连系统标题栏和三个窗口按钮一起清掉，窗口状态不变。 | web、desktop |
| `deepseek-usage` | 设置页的用量/余额卡片；**对话输入框上方那条汇总**（余额、今日消费 —— 现在最前面还有一个不标单位的持仓盈亏数字）。 | web、desktop |
| `dsh-littleIcon` | 桌面桌宠：独立于 DSH 窗口的置顶透明小窗（PowerShell + WPF），可拖动、按 agent 状态换表情，单击收起/恢复 DSH 主窗口；右键与托盘菜单第一项「对话」在 DSH 自己的右侧 Browser 标签里开 chat.deepseek.com，第二项「Git 改动」在右侧栏开插件自己的仓库页（左：当前会话工作目录里未提交的改动，右：最近十次提交；双击任意一行看详情；「拉取」用 `git pull --ff-only` 更新到上游最新；「提交并推送」仍只把「审查本地改动，没有问题就提交并推送吧」作为用户消息发进当前对话，由 AI 去执行），第三项「打开工作目录」把当前会话的工作目录交给宿主，用资源管理器打开（打不开时桌宠弹一句说明）；分隔线下可以「更新 DSH」（构建当前工作副本，成功后自动重启）、「重启 DSH」或「退出 DSH」。DSH 切到后台就自动收起，等用户回答时举着「惊讶」。桌宠自己不在菜单里退出，生死由「启用桌宠」开关控制。 | desktop（web 可装，但那里不控制窗口；Git 页两边都能用） |
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
| `build\check-presets.mjs` | 让已构建的本地 CLI 组合 Web profile，再检查每个 `preset-*` 声明引用的插件包能否从该 profile 解析。用法 `node _mytools/build/check-presets.mjs`，退出码 1 表示有坏的。由 `build\build.bat`（web/desktop/repair，构建之后）自动调用，也可以单独跑。 |
| `build\preflight.mjs` | 构建前的体检（上游合并最常踩的几件事）。由 `build\build.bat` 自动调用；`--root <路径>` 可以检查别的 checkout，方便自测。退出码 2 = 拦下。 |
| `build\finish.ps1` | 记录一次构建的结果到 `$DSH_HOME\build\last-build.json`，`-Restart` 时在成功后拉起 `build\start-desktop.bat`。由 `build\build.bat` 在每条出口调用。 |
| `build\write-resume-plan.ps1` | 把「更新上游」的**任务契约**写进 `$DSH_HOME\build\resume-plan.json`：仓库、revision、构建日志路径、预期产物清单。由 `build\update-and-build.bat` 在构建启动前调用；输出日志路径一行供调用方捕获。 |
| `build\detach.ps1` | 用 WMI 把构建放到本进程树之外（父进程 WmiPrvSE），日志默认落在 `$DSH_HOME\build\logs\build-<时间戳>.log`。由 `build\build.bat --detached` 调用。 |
| `build\run-detached-build.ps1` | 在脱离的控制台中运行实际构建，把每行输出同时显示并写进日志；成功后自动关窗，失败后等待确认。由 `build\detach.ps1` 调用。 |
| `build\resolve-dsh-home.ps1` | 按 harness 的规则解析 `$DSH_HOME`（空白=未设置、展开开头的 `~`、转绝对路径），供上面几个 PS1 共用。 |
| `build\migrate-desktop-user-data.bat` | 把 Electron 的浏览器数据从 `apps\desktop\.desktop-build\development\electron-user-data` 搬到 `$DSH_HOME\desktop\electron-user-data`（`Partitions` 与解密 Cookie 用的 `Local State` 一起搬）。由 `build\build.bat` 在 `clean` 前、`build\start-desktop.bat` 在启动前调用；只在旧目录还在、且新目录还没有 `Partitions` 时动手，失败就整份丢弃等下次，任何情况下都退出 0。 |
| `build\launch-desktop.vbs` | 开始菜单/桌面快捷方式背后的隐藏启动器：隐藏跑 `build\start-desktop.bat`，失败时弹带日志尾巴的对话框。 |
| `build\install-shortcut.ps1` | 建/删那两个快捷方式；`build\make-shortcut.bat` 的实体。 |
| `build\make-app-icon.mjs` | 从 `apps\desktop\resources\icon-windows.svg` 光栅化 9 个尺寸的 `.ico` 到 `$DSH_HOME\build\dsh.ico`。 |
| `build\prepare-desktop.ts` | 桌面端开发工程的准备逻辑，由 `build\build.bat`（desktop/repair）调用。 |
| `.gitattributes` | 固定 `*.bat` 以 CRLF 检出（cmd 按 CRLF 解析）。 |
| `build\dsh-web.log` | `build\start-dsh.bat` 本次启动的日志；服务还在跑时该文件被占用，会改用 `dsh-web-<随机>.log`。 |
| `ai-game\` | 个人东西（ATB 回合制战斗 demo，纯 HTML/CSS/JS），与 DSH 运行无关。 |
| `bg\` | 背景图素材。 |

## 约定

- 只在本目录内改动；`packages/`、`apps/`、`scripts/`、`docs/`、`snapshots/` 是上游文件，保持原样。**目前只有一处例外**：为让侧栏内嵌浏览器保住登录，改过 `apps/desktop/src/browser-guests.ts`（另加一个测试文件）并同步了 `packages/client/ui-sidebar-browser` 的文档与类型 JSDoc；改动清单、重建命令与「合并上游后怎么恢复」见 [Plugins/dsh-littleIcon/UPSTREAM.md](Plugins/dsh-littleIcon/UPSTREAM.md)。
- 新增脚本：路径从自身位置推导，不写盘符/用户名；`.bat` 保持 CRLF。
- 不把凭证（`$DSH_HOME\.credentials.yaml`）和持仓数据提交进仓库 —— 这个 fork 是公开的。
