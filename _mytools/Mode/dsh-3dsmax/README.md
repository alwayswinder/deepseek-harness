# dsh-mode-3dsmax — 3ds Max MCP 编辑模式

DSH 的一个 **Agent 模式（preset）**：在这个模式下的会话里，`3dsmax-mcp` 的工具会自动挂载，
3ds Max 专用技能也自动出现在技能目录里。**其它模式（standard / ptc）完全不受影响**，
所以不为它们付 MCP 的 token。

## 怎么用

1. 重启 DSH（宿主侧改动需要重启才生效）。
2. 新建会话时在**模式选择器**里选 **「3ds Max」**（`id: 3dsmax`，roster 里排第 5）。
3. 会话里应能看到一批 `mcp__3dsmax__*` 工具（`query_scene`、`manage_layers`、`merge_from_file`…），
   以及技能目录里的 `3dsmax-live-mcp`。

> 默认模式没有改动，仍是 `standard`。本模式是**可选**的。
>
> 选择器里没有「3ds Max」时，先看 **设置 → Agent 预设**：那里的卡片会显示挂载错误，
> 选择器则不显示挂载失败的 preset（见下面"上游更新后要重新生成 preset"）。

## 这个模式包含什么

`cordis.patch.yml` 插入一行 `preset-3dsmax`，它的 `plugins` 就是该模式的子插件清单：

| 组成 | 说明 |
|---|---|
| `@deepseek-ai/dsh-persona`、`tool-pwsh`、`tool-fs`、`todo`、`present`… | 与 `standard` 相同的完整工具栈（preset 没有继承机制，必须自带） |
| `skill-filesystem` + `customSkillDirs` | 指向本包的 `skills/`，**只在本模式注册** |
| `tool-skill` | 暴露 `skill` 工具，让技能可被加载 |
| `mcp-3dsmax` → `@deepseek-ai/dsh-mcp-client` | stdio 启动 `3dsmax-mcp`，工具名为 `mcp__3dsmax__<tool>` |

### 路径是怎么做到不写死盘符的

`customSkillDirs` 用 `!!js` 在加载时求值，走的是仓库里既有的写法（上游 preset 自己也这么干）：

```yaml
!!js process.getBuiltinModule('node:path').join(
       process.getBuiltinModule('node:path').dirname(
         process.getBuiltinModule('node:module').createRequire(baseUrl)
           .resolve('@local/dsh-mode-3dsmax/package.json')), 'skills')
```

即"从 profile 解析本包 → 取目录 → 拼 `skills/`"。换机器、换盘符都不用改。

### MCP 的路径与服务器来源

**服务器不在这份 git 里**（源码 22 MB + `.venv` 67 MB），而是由 `install.ps1` **clone 到仓库外**：

```
<仓库父目录>\dsh-3dsmax-mcp\                     ← 真实 checkout（本机 = E:\AI\dsh-3dsmax-mcp），不进 git
_mytools\Mode\dsh-3dsmax\upstream\3dsmax-mcp\    ← 指向它的 junction，preset 仍按包内路径解析
```

**为什么必须在仓库外**：DSH 的 Windows 沙箱会给**工作区根**（默认就是仓库根 `E:\AI\DSH`）
打一条 **Low 完整性标签 ACE**，带容器/对象继承（`packages/sandbox/sandbox-windows-acl/src/acl.ts`）。
标签会被整棵子树继承，而 **exe 文件上的标签决定进程的完整性等级** —— 从工作区里启动的进程一律是 Low。
3ds Max 通常以 **High（提权）** 运行，Low 进程写它的命名管道会被 mandatory no-write-up 拒掉，
表现就是**每个 MCP 调用都报 `Win32 error 5`**（`query_scene`、`capture_viewport` 全一样，
连 `scripts/mcpcall.py` 兜底路径也一起失败）。把真实 checkout（关键是 `.venv` 里的
`python.exe` / `3dsmax-mcp.exe`）放到仓库外就没有这条标签，进程与 DSH 同级（High），管道可用。
`install.ps1` 每次都会自检解释器的完整性等级并打印（期望 `High`）。

> 已经按旧布局装在仓库内的机器：`install.ps1` 会自动迁移 —— 用 **robocopy 复制**到仓库外
> （新文件重新继承目标目录的 ACE；用 `Move` 会把 Low 标签一起搬过去，等于没修），
> 旧目录删不掉时先 `takeown` + `icacls /reset`。**迁移时若 MCP 服务正在跑，先退出 DSH**，
> 否则 `.venv` 里的文件被占用，复制得出来但删不掉旧目录。

preset 的 `--directory` 仍从本包位置推导（和上面的 `customSkillDirs` 一个写法），经 junction 落到仓库外：

```yaml
- !!js process.env.DSH_3DSMAX_MCP_DIR || …resolve('@local/dsh-mode-3dsmax/package.json')
       → …/dsh-3dsmax/upstream/3dsmax-mcp   （junction → <仓库父目录>\dsh-3dsmax-mcp）
```

所以换机器、换盘符都不用改；只有在你想用**另一份**已有的 checkout（比如 `E:\AI\3dMax\3dsmax-mcp-master`）
时才需要覆盖：

```powershell
setx DSH_3DSMAX_MCP_DIR "E:/AI/3dMax/3dsmax-mcp-master"
```

#### 版本由脚本锁定

| 项 | 值 |
|---|---|
| 上游 | `https://github.com/cl0nazepamm/3dsmax-mcp`（MIT） |
| **当前钉定** | **`v1.7.6`**（2026-10-14，commit `5a92193e5a`） |
| 为什么不是 v1.7.5 | `scripts/mcpcall.py`（技能里的零 token 兜底路径）**是 v1.7.6 才加入的**；钉 v1.7.5 会没有它 |
| PyPI | 最新只到 **1.6.8**，更旧；而且 wheel 里**不含** `scripts/mcpcall.py`（`force-include` 没带上它）→ 不要走 PyPI |
| 手上那份 `E:\AI\3dMax\3dsmax-mcp-master` | **不对应任何 tag**：它是两版之间的 master 状态（`scripts/` 里同时有 v1.7.5 的 `gen_tool_catalog.py` 与 v1.7.6 的 `hot_core.py`/`mcpcall.py`），再叠加你们自己的 `maxscript/rig_*.ms` 与技能 |

**升级版本**：改 `install.ps1` 顶部的 `$UpstreamTag` → 重跑脚本（会重新 checkout + `uv sync`）。

#### 这台机器的 git 代理是坏的（会影响所有 HTTPS 的 git 拉取）

全局配置里有一行**格式错误**的代理（host 被解析成 `git`，且串里带着看起来像密码的内容）：

```powershell
git config --global --get http.proxy
```

后果：任何 `git clone/fetch` 走 HTTPS 都会失败，报"连不上 `github.com` 端口 1080"，而 1080 上没有代理在监听。
安装脚本为此带一个开关，**只对本次 clone/fetch** 清空代理，不改全局配置：

```powershell
... install.ps1 -BypassProxy
```

要根治，得在全局配置里删掉或改对那一行 —— 脚本不擅自动它。

> ⚠️ 那行代理里含一段看起来像**密码**的字符串。如果它是真的凭证，建议更换：它已经出现在本次会话的工具输出里。

#### 3ds Max 侧的原生桥（git 管不了）

`native/bin/mcp_bridge_20XX.gup`（Max 2023–2027 各一份）要装进 3ds Max 的插件目录，这是**每台机器、每个 Max 版本一次**的动作：

```powershell
powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1 -InstallMaxBridge
```

它跑上游的 `uv run python install.py`。不装桥时，脚本末尾会提示；MCP 会走 TCP 兜底（需要先在 Max 里跑
`maxscript/mcp_server.ms`）。

## token 开销（实测）

`3dsmax-mcp` 默认 `tool_profile = full`，对外暴露 **184 个工具 / 274,564 字节** schema，
约 **7–9 万 token**，会进入**每个请求**。这是本模式的主要开销，也是"只在需要时才进这个模式"的原因。

想大幅压低，改 checkout 里的 `mcp_config.ini`（默认在 `upstream\3dsmax-mcp\mcp_config.ini`）：

```ini
tool_profile = progressive
```

progressive 只暴露 7 个工具（3 个元工具 + 4 个实例路由）= **2,047 字节 ≈ 600 token**（省 134 倍）。
代价是每次要先 `list_toolsets` / `describe_toolset` 发现工具。

| 档 | 工具数 | 字节 | 约合 token |
|---|---|---|---|
| `full`（默认） | 184 | 274,564 | 7–9 万 |
| `core` | 118 | 127,649 | 3–4 万 |
| `progressive` | 7 | 2,047 | ~600 |

如果没有配 MCP，也可以用 checkout 里的 `scripts/mcpcall.py` 走命令行（零 token 成本，做法见技能）。

## 换机器 / 新克隆后怎么装

代码跟着 `_mytools/` 走（已在 git 里），但 **profile 安装记录、仓库外的 checkout 与 `.venv` 都在本机**，
所以每台新机器跑一次：

```powershell
# 若这台机器的全局 git 代理是坏的（见上），加 -BypassProxy
powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1 -BypassProxy
# 若 3ds Max 里还没有原生桥，再加 -InstallMaxBridge
```

它做五件幂等的事：

1. **布局**：真实 checkout 放仓库外的 `<仓库父目录>\dsh-3dsmax-mcp`，包内 `upstream\3dsmax-mcp`
   建 junction 指过去；发现旧布局（包内是真目录）自动复制迁移出去（复制前先退出 DSH）
2. 把 `3dsmax-mcp` clone 到那个仓库外目录（钉定 tag；已有则校验/切换）
3. `uv sync` 准备 `.venv`（`uv` 缺失只告警，不拦）
4. 把本包链接进 `desktop` 与 `web` 两个 profile 的 `node_modules/@local/`，并写进 `dependencies`
   与 `dsh.profile.bundles`（末尾）
5. 跑 `check-presets.mjs` 校验，并自检 checkout 解释器的完整性等级（期望 `High`）

然后重启 DSH。常用开关：`-SkipUpstream`、`-SkipSync`、`-SkipCheck`、`-InstallMaxBridge`。
脚本在 Windows PowerShell 5.1 与 PowerShell 7 下都能跑（README 里的 `powershell -File` 写法可用）。

## 上游更新后要重新生成 preset

**preset 没有继承机制**，所以本文件的 `plugins` 清单是上游
`packages/bundle/web-app/presets/standard.patch.yml` 的复制。上游改了 standard（新增工具、改默认配置）后，
本模式不会自动跟上，必须重新生成 —— 由 `sync-preset.mjs` 做：

```powershell
node _mytools\Mode\dsh-3dsmax\sync-preset.mjs          # 重新生成 cordis.patch.yml
node _mytools\Mode\dsh-3dsmax\sync-preset.mjs --check   # 只检查是否漂移（exit 1 = 漂移）
node _mytools\build\check-presets.mjs                   # 期望 exit 0，且 3dsmax: ok
```

生成器把上游 `plugins` 块原样复制，再套上本模式的四处差异：preset 的
`id` / `name` / `description` / `order`，`skill-filesystem` 的 `config.customSkillDirs`，
末尾追加的 `mcp-3dsmax` 行。上游结构变了（找不到它要改的行）时它 exit 2 报错，不会写出半成品。

`install.ps1` 的校验段会顺带跑 `--check`，漂移时只告警、不自动改写。

### 为什么"模式不见了"通常就是 preset 挂载失败

模式选择器只列**能组出会话的** preset（选择器选的是下一个会话的组合方式），
挂载失败的 preset 会被过滤掉：

- `packages/client/ui-agent-preset/src/client/settings-store.ts` 里
  `presets.filter(preset => preset.broken === undefined)` 就是那道过滤；
- 挂载失败的原因不打印在日志里，只挂在 roster 行的 `broken` 字段上 —— 在
  **设置 → Agent 预设** 里能看到带错误标记的卡片，模式选择器里看不到。

**2026-10-19 实测**：上游删掉了 `tool-subagent` 的 `toolFilter`（改由 Agent Preset 配置
persona/工具，见 `packages/subagent/tool-subagent/src/index.ts` 那句
"toolFilter is no longer supported"），而本 preset 还是旧副本，于是整个 preset 挂载失败，
选择器里只剩 standard / PTC / 极简 / 创造。用 `sync-preset.mjs` 重新生成即修复。

复现这条链路不用重启 DSH：desktop host 带 `--inspect=127.0.0.1:9230`，`tools/probe-presets.mjs`
连上去读活着的 roster（含每行的 `broken`）：

```powershell
node _mytools\Mode\dsh-3dsmax\tools\probe-presets.mjs        # 打印 5 行 preset 与各自的 broken
node _mytools\Mode\dsh-3dsmax\tools\probe-presets.mjs 9231   # 指定的 inspector 端口
```

> `tools/probe-host.mjs "<表达式>"` 是同一套连接方式，用来在 host 进程里求值任意表达式
> （排查其它宿主侧状态时用）。两个脚本都在 `tools/`（验证产物落在 `D:\AI\work\`，不进 git；仓库里不再建 `work/`）。
>
> 判断"改完的 preset 到底能不能挂载"，不必动正在跑的 DSH：用一个临时 `DSH_HOME`
> 另起一个 web profile（把 `profiles\web` 的几个小文件复制过去、重建 `node_modules\@local`
> 的 junction），带 `--inspect=9231` 启动 `node apps\cli\lib\bin.js web --no-open --port <port>`，
> 再按上面第二行读 roster，`broken: null` 即挂载成功；测完杀掉进程、删掉临时目录。

> 校验脚本 `_mytools/build/check-presets.mjs` 2026-10-15 修过一处误报：它会把 preset 行自己的
> `name:`（显示名）当成包名。现在只统计 `plugins:` 之下的 `name:`。它只验证**包能不能解析**，
> 验证不了 config 键是否受支持 —— 上面那种 `toolFilter` 失效它检不出来，那正是 `--check` 的由来。

## 技能与 rig 文档的关系

`skills/` 下现在只有 `3dsmax-live-mcp/`（从 `E:\AI\3dMax\3dsmax-mcp-master\.agents\skills\` 复制）。

**`3dsmax-rig-controller-transfer/` 已于 2026-10-16 移除**：它描述的 `S7_*` 驱动点直接驱动 B 骨架构，与已验收的路线 1（由迁移过来的环驱动骨、`BIPDRV_*` 只作测量基准）冲突，留着会让人照旧做法复现"动控制器不驱动角色"。它的内容由 `docs/` 接管：

- 入口：`docs/README.md`（索引、输入分类与通过范围）、`docs/quick-runbook.md`（阶段顺序与门槛）
- 规范：`docs/character-adaptation-guide.md`（profile 与记录）、`docs/biped-rebuild-guide.md`（阶段 0–3）、`docs/controller-migration-guide.md`（阶段 4–10）
- 历史留档：`docs/stan-biped-controller-migration-task.md`（冻结的个案记录）、`docs/references/seven-stan.md`（路线 2 故障复盘）、`docs/references/seven-quinn.md`
- 未迁入、留在 3ds Max 仓库（只作追溯，勿按它执行）：`E:\AI\3dMax\3dsmax-mcp-master\.agents\skills\3dsmax-rig-controller-transfer\`（`SKILL.md`、`recipe.md`、`scripts/01/04/05/06`）

> `3dsmax-live-mcp` 仍是两份副本、仍会漂移：改完以 `_mytools` 这份为准，再同步回 3ds Max 仓库。

## 回滚

```powershell
# 从两个 profile 移除（不改 `_mytools` 里的文件）
$h = $env:DSH_HOME
foreach ($p in 'desktop','web') {
  $f = "$h\profiles\$p\package.json"
  (Get-Content -Raw $f) -replace '\s*"@local/dsh-mode-3dsmax"[^\r\n]*\r?\n','' `
                       -replace '\s*,?\s*"@local/dsh-mode-3dsmax"(?=\s*\])','' |
    Set-Content $f -NoNewline
}
Remove-Item "$h\profiles\desktop\node_modules\@local\dsh-mode-3dsmax" -Force
Remove-Item "$h\profiles\web\node_modules\@local\dsh-mode-3dsmax" -Force

# 仓库外那份 checkout 与包内 junction（只有确认不再用这个模式时才删）
cmd /c rmdir "_mytools\Mode\dsh-3dsmax\upstream\3dsmax-mcp"   # 只删 junction，不动目标
Remove-Item "<仓库父目录>\dsh-3dsmax-mcp" -Recurse -Force
```

改完重启 DSH 即恢复原状。

## 实测记录

- **2026-10-16，模式在运行中的 DSH 里验证通过**：会话内可见 `mcp__3dsmax__*` 工具与
  `3dsmax-live-mcp` 技能（rig 迁移技能同日移除，见上）；`query_scene`、`capture_viewport`
  对 pid 17464（`Seven_Skin.max`）可用（截图 534×1128 PNG，`source: active`），
  另一个实例 pid 61676（`Stan01.max`）也能通过 `select_max_instance` 切换后驱动。
- **同一轮定位到上面那个 Low 完整性标签坑**：checkout 在 `E:\AI\DSH` 下时，MCP 的
  `3dsmax-mcp.exe` / `python.exe` 实测都是 **Low (4096)**，而两个 3ds Max 是 **High (12288)**，
  每个 MCP 调用报 `Win32 error 5`；同一份 `python.exe`（两处 SHA256 相同）放在 `E:\AI\3dMax` 下
  跑出来是 High。按"复制到仓库外"处理后自检与调用都恢复正常。

## 已知限制

- **与上游 standard 漂移**：见上面"上游更新后要重新生成 preset"。这是 preset 无继承带来的固有成本。
- **需要重启 DSH 才生效**：预设是宿主侧组合，HMR 只覆盖客户端插件。
- **依赖 checkout 留在工作区之外**：工作区根上的 Low 完整性标签会让树里的 exe 以 Low 运行，
  连不上提权运行的 3ds Max（每个 MCP 调用 `Win32 error 5`）。`install.ps1` 会自检并告警；
  如果 DSH 本身没有提权，而 3ds Max 提权了，则无论 checkout 放哪都连不上 —— 两边要么都提权，要么都不提权。
- 头面部不在控制器迁移技能范围内（技能自身已注明）。
