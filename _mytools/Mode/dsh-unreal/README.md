# dsh-mode-unreal — Unreal Engine 5.8 MCP 编辑模式

DSH 的一个 **Agent 模式（preset）**：在这个模式下的会话里，UE 编辑器内置的 MCP 服务
（`ModelContextProtocol` 插件）的工具会自动挂载，UE 专用技能也自动出现在技能目录里。
**其它模式（standard / ptc / 3ds Max）完全不受影响**，所以不为它们付 MCP 的 token。

## 怎么用

1. 启动 UE 编辑器（**先起编辑器，再起 DSH**；见下面"已知限制"）。
2. 重启 DSH（预设是宿主侧组合，只有重启才生效）。
3. 新建会话时在**模式选择器**里选 **「Unreal Engine」**（`id: unreal`，roster 里排第 6）。
4. 会话里应能看到 3 个 `mcp__unreal__*` 工具（`list_toolsets` / `describe_toolset` /
   `call_tool`），以及技能目录里的 `unreal-editor-mcp`。

> 默认模式没有改动，仍是 `standard`。本模式是**可选**的。

## 这个模式包含什么

`cordis.patch.yml` 插入一行 `preset-unreal`，它的 `plugins` 就是该模式的子插件清单：

| 组成 | 说明 |
|---|---|
| `@deepseek-ai/dsh-persona`、`tool-pwsh`、`tool-fs`、`todo`、`present`… | 与 `standard` 相同的完整工具栈（preset 没有继承机制，必须自带） |
| `skill-filesystem` + `customSkillDirs` | 指向本包的 `skills/`，**只在本模式注册** |
| `tool-skill` | 暴露 `skill` 工具，让技能可被加载 |
| `mcp-unreal` → `@deepseek-ai/dsh-mcp-client` | **streamable-http** 直连 `http://127.0.0.1:8000/mcp`，工具名为 `mcp__unreal__<tool>` |

### 路径是怎么做到不写死盘符的

`customSkillDirs` 用 `!!js` 在加载时求值，走的是仓库里既有的写法（上游 preset 自己也这么干）：

```yaml
!!js process.getBuiltinModule('node:path').join(
       process.getBuiltinModule('node:path').dirname(
         process.getBuiltinModule('node:module').createRequire(baseUrl)
           .resolve('@local/dsh-mode-unreal/package.json')), 'skills')
```

即"从 profile 解析本包 → 取目录 → 拼 `skills/`"。换机器、换盘符都不用改。MCP 的 URL 同理：

```yaml
url: !!js "process.env.DSH_UNREAL_MCP_URL || 'http://127.0.0.1:8000/mcp'"
```

## 为什么是 HTTP 直连，而不是像 3ds Max 模式那样 stdio 起一个桥

| | 3ds Max 模式 | 本模式 |
|---|---|---|
| 传输 | stdio，`uv run 3dsmax-mcp` | Streamable HTTP，`http://127.0.0.1:8000/mcp` |
| 上游 checkout | 有（钉 tag、`.venv`、仓库外放置） | **没有**：服务在编辑器里 |
| 子进程 | 有（Python 解释器） | **没有** |
| Windows 沙箱完整性标签坑 | 有（`Win32 error 5`） | **没有**（不启动进程，不涉及 Low 完整性） |
| 工具数 | 184（full profile） | 3（渐进模式，见下） |

UE 5.8 的 `ModelContextProtocol` 插件自带 MCP 服务，`bAutoStartServer=True` 时随编辑器启动，
所以这个模式**没有任何要 clone、要 `uv sync`、要钉版本的东西** —— `install.ps1` 只做 profile 注册与校验。

> 项目里还装了 `McpAutomationBridge`（`DefaultGame.ini` 里 `bEnableNativeMCP=True`、
> `NativeMCPPort=3000`），那条路需要额外的 Node 桥进程（`npx unreal-engine-mcp-server`）
> 和插件 WebSocket（8090/8091）。实测这台机器上 3000/8090/8091 **都没在监听**，
> 而内置服务在 8000 上正常工作，所以本模式走内置服务。

### UE 侧的事实（来自 `Sources`，不是猜的）

| 设置 | 位置 | 本机值 |
|---|---|---|
| `bAutoStartServer` | `UModelContextProtocolSettings`（`EditorPerProjectUserSettings`） | `True` |
| `ServerPortNumber` | 同上 | `8000` |
| `ServerUrlPath` | 同上 | `/mcp` |
| `bEnableToolSearch` | 同上 | `True`（= 只暴露 3 个元工具） |

`bEnableToolSearch=False` 会把**每个 toolset 工具都原生注册**成一个 MCP 工具。本机实测
`list_toolsets` 当前有 **23 个 toolset**（含 `PCGToolset`、`MetaHumanToolset`，随插件加载变化），
全展开是数百个工具 —— 每个请求都要付这份 schema。**别为了让工具"直接可调"去关它**，
本模式的省 token 前提就是它开着。

## token 开销（实测）

| 档 | 工具数 | schema 字节 | 约合 token |
|---|---|---|---|
| `bEnableToolSearch=True`（默认，本模式采用） | 3 | 1,284 | ~350 |
| `bEnableToolSearch=False`（全原生） | 数百（19→23 个 toolset 随插件变化） | — | 数万 |

代价是每次操作要先 `list_toolsets` → `describe_toolset` → `call_tool` 三步（技能里写了路由规则）。
如果某个任务就是要连打十几条命令，用 `ProgrammaticToolset.execute_tool_script` 一次编排，
或者用下面的零 token 兜底脚本。

## 零 token 兜底：`tools/ue-mcp.ps1`

不经 MCP 客户端注册，因此不进任何请求的 prompt / tool schema：

```powershell
node --version    # 不需要 node；纯 PowerShell
_mytools\Mode\dsh-unreal\tools\ue-mcp.ps1 -Toolsets
_mytools\Mode\dsh-unreal\tools\ue-mcp.ps1 -Describe EditorToolset.LogsToolset
_mytools\Mode\dsh-unreal\tools\ue-mcp.ps1 -Toolset EditorToolset.LogsToolset -Tool GetLogEntries `
    -Arguments '{"category":"","pattern":"Error","maxEntries":20}'
_mytools\Mode\dsh-unreal\tools\ue-mcp.ps1 -Toolset editor_toolset.toolsets.scene.SceneTools -Tool get_current_level -Arguments '{}'
```

会话 id 缓存在 `%TEMP%\ue-mcp.session`，编辑器重启后自动重新 `initialize`。
端点和 preset 用同一个契约：`DSH_UNREAL_MCP_URL`。

> UE 项目仓库里也有一份同源脚本 `Scripts\ue-mcp.ps1`（在项目里干活时顺手可用）。
> **两份副本会漂移，改完以本包这份为准**，再同步回项目仓库。

## 三个 schema 陷阱（技能里也写了，因为每次都要踩）

1. `tool_name` 传**短名**：`GetLogEntries`。`describe_toolset` 打印的是全名
   `EditorToolset.LogsToolset.GetLogEntries`，传全名会得到 `Unknown tool`。
2. 对象引用是**对象不是字符串**：`{"refPath": "/Game/Map.Map:PersistentLevel.Brush_0"}`。
3. 有些"看起来可选"的参数是必填：`SceneTools.find_actors` 的
   `name` / `tag` / `collision_channels` 都必须给，传 `""`、`""`、`[]` 表示不过滤。
   另外 `LogsToolset.GetLogEntries` 的 `category` 默认值是 `"LogsToolset"` —— 这个分类不存在，
   不显式传 `""` 会直接报错。

## 安装：`install.ps1`

```powershell
powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-unreal\install.ps1
# 编辑器换了端口：... -Endpoint http://127.0.0.1:9000/mcp
# 只刷新注册、不校验：... -SkipCheck
```

它做四件幂等的事：

1. 把本包链接进 `desktop` 与 `web` 两个 profile 的 `node_modules/@local/`，并写进
   `dependencies` 与 `dsh.profile.bundles`（末尾）
2. 探测 UE MCP 端点：报告在不在、暴露几个工具、是不是渐进模式
3. 用 `@deepseek-ai/dsh-mcp-client` 自己的 schema 校验 MCP 行（`tools/check-config.mjs`）
4. 跑 `check-presets.mjs`（期望 `unreal: ok`）与 `sync-preset.mjs --check`

然后重启 DSH。

## 上游更新后要重新生成 preset

**preset 没有继承机制**，所以本文件的 `plugins` 清单是上游
`packages/bundle/web-app/presets/standard.patch.yml` 的复制。上游改了 standard 后：

```powershell
node _mytools\Mode\dsh-unreal\sync-preset.mjs          # 重新生成 cordis.patch.yml
node _mytools\Mode\dsh-unreal\sync-preset.mjs --check   # 只检查是否漂移（exit 1 = 漂移）
node _mytools\Mode\dsh-unreal\tools\check-config.mjs    # MCP 行的 config 键是否仍被接受
node _mytools\build\check-presets.mjs                   # 期望 exit 0，且 unreal: ok
```

生成器把上游 `plugins` 块原样复制，再套上本模式的四处差异：preset 的
`id` / `name` / `description` / `order`，`skill-filesystem` 的 `config.customSkillDirs`，
末尾追加的 `mcp-unreal` 行。上游结构变了（找不到它要改的行）时 exit 2 报错，不会写半成品。

MCP 行的配置写成 `sync-preset.mjs` 里的 `mcpConfig` **对象**而不是硬编码 YAML 文本，
就是为了让 `check-config.mjs` 能用同一份对象跑真实 schema：
`check-presets.mjs` 只验包能不能解析，**验不了 config 键**；而键被改名会让整个 preset
挂载失败 —— 那种失败只会让模式从选择器里消失，日志里没有线索。

### "模式不见了"怎么查

模式选择器只列**能组出会话的** preset（`presets.filter(preset => preset.broken === undefined)`），
挂载失败的 preset 只在 **设置 → Agent 预设** 里带错误标记显示。

不重启 DSH 也能验证：desktop host 带 `--inspect=127.0.0.1:9230`，本包 `tools/probe-presets.mjs`
连上去读活着的 roster（含每行的 `broken`）：

```powershell
node _mytools\Mode\dsh-unreal\tools\probe-presets.mjs        # 默认 9230
node _mytools\Mode\dsh-unreal\tools\probe-presets.mjs 9231   # 指定 inspector 端口
```

**2026-10-20 实测**：用一个临时 `DSH_HOME`（只放 `profiles\web` 的几个小文件 + `node_modules\@local`
junction）跑 `node --inspect=9231 apps\cli\lib\bin.js web --no-open --port 3123`，
roster 返回 5 行，其中 `{"id":"unreal","order":6,"broken":null}` —— 挂载成功。测完杀进程、删临时目录。

### "模式在，但会话里没有 `mcp__unreal__*`"怎么查

先跑端点自检（用的是宿主实际加载的那份 MCP SDK，与 `connection.ts` 同一组 connect 选项）：

```powershell
node _mytools\Mode\dsh-unreal\tools\verify-endpoint.mjs
# 成功：protocol: 2025-11-25 / tools (3) / smoke call 返回当前关卡路径
# 失败：连不上（编辑器没开、端口不对）或工具数 > 3（bEnableToolSearch 被关）
```

端点正常但仍无工具，就是宿主侧没连上：重启 DSH（预设与 MCP 客户端都是启动时挂载的），
或者用 `DSH_UNREAL_MCP_URL` 指向实际地址后再重启。

## 与 3ds Max 模式的差异（维护视角）

| 关注点 | 3ds Max 模式 | 本模式 |
|---|---|---|
| 装机成本 | clone + `uv sync` + 装 Max 桥插件 | 只写 profile 注册 |
| 版本锁定 | `install.ps1` 顶部 `$UpstreamTag` | 不需要：服务随编辑器 |
| 失败模式 | 完整性标签 → 每个调用 `Win32 error 5` | 编辑器没开 → 没有工具（模式仍挂载） |
| 工具发现 | full profile 直接调用 | 必须走 3 个元工具 |
| 技能数量 | 1（`3dsmax-live-mcp`） | 1（`unreal-editor-mcp`） |

## 已知限制

- **编辑器必须先开着**。`failOnStartupError: false` 保证编辑器不在时 DSH 照样启动、模式照样能选，
  但那时没有任何 `mcp__unreal__*` 工具；DSH 会按重连策略（0.5s 起、翻倍到 30s、10 次）尝试，
  预算耗尽后工具不再出现 —— 这时重启 DSH，或用兜底脚本。
- **需要重启 DSH 才生效**：预设是宿主侧组合，HMR 只覆盖客户端插件。
- **一次只能连一个编辑器实例**：服务端口是项目设置里的单值（默认 8000），两个编辑器抢同一个端口时
  后启动的那个起不来。要连另一个实例就改端口，然后用 `DSH_UNREAL_MCP_URL` 指过去。
- **三层调用有额外 token 成本**：每次不熟悉的操作多一次 `describe_toolset`（一次几 KB 的 schema）。
  技能里的 toolset 地图就是为了少查。
- **工具集随插件加载变化**：`PCGToolset`、`MetaHumanToolset` 这类要插件加载后才出现，
  编辑器刚起来那一小段 `list_toolsets` 可能还不全。
- **头面部/MetaHuman 工作流**没有本模式专属技能，用 `MetaHumanToolset` 前先 `describe_toolset`。

## 回滚

```powershell
$h = $env:DSH_HOME
foreach ($p in 'desktop','web') {
  $f = "$h\profiles\$p\package.json"
  (Get-Content -Raw $f) -replace '\s*"@local/dsh-mode-unreal"[^\r\n]*\r?\n','' `
                       -replace '\s*,?\s*"@local/dsh-mode-unreal"(?=\s*\])','' |
    Set-Content $f -NoNewline
  Remove-Item "$h\profiles\$p\node_modules\@local\dsh-mode-unreal" -Force
}
```

改完重启 DSH 即恢复原状（`_mytools` 里的文件不动）。

## 实测记录（2026-10-20）

- 端点 `http://127.0.0.1:8000/mcp` 握手成功，`tools/list` 返回 3 个工具 / 1,284 字节 schema
- 用 mcp-client 依赖的同一个 SDK（`@modelcontextprotocol/client@2.2.0`）与同一组 connect 选项
  （`versionNegotiation: { mode: 'auto' }`）连通，协商到协议 `2025-11-25`（服务器上限，
  客户端偏好 2026-07-28 时自动回落）
- `call_tool` → `SceneTools.get_current_level` 返回 `/Game/_MyTest/PCG/M_PCG_Test`
- 传全名 `editor_toolset.toolsets.scene.SceneTools.get_current_level` 得到 `Unknown tool`（已验证的坑）
- `check-config.mjs` 通过（`transport: streamable-http`、`url`、`toolCallTimeoutMs` 都被当前 schema 接受）
- `check-presets.mjs`：`unreal: ok (2 disabled)`
- 临时 `DSH_HOME` 挂载测试：roster 里 `unreal` `broken: null`

## 文件清单

| 文件 | 作用 |
|---|---|
| `package.json` | 包声明，`dsh.bundle.patch` 指向 `cordis.patch.yml` |
| `cordis.patch.yml` | **生成物**，别手改；由 `sync-preset.mjs` 从上游 standard 复制并改写 |
| `sync-preset.mjs` | 生成器；导出 `mcpConfig` 给 `check-config.mjs` 复用 |
| `install.ps1` | 幂等装机：profile 注册 + 端点探测 + 三项校验 |
| `tools/check-config.mjs` | 用 mcp-client 的 schema 校验 MCP 行 |
| `tools/verify-endpoint.mjs` | 用宿主同一个 MCP SDK 直连端点并试调一次（排查"模式里没有工具"） |
| `tools/ue-mcp.ps1` | 零 token 兜底客户端 |
| `tools/probe-presets.mjs` | 连 inspector 读活着的 preset roster |
| `skills/unreal-editor-mcp/` | UE 专用技能（调用形状、工具地图、安全边界、恢复路径） |
| `locale/{en,zh}.json` | 插件卡片显示名（不影响模式选择器里的 preset 名） |
| `work/` | 本机验证产物（临时脚本/输出），不进 git |
