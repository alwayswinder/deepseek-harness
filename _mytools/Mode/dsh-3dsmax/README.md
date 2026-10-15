# dsh-mode-3dsmax — 3ds Max MCP 编辑模式

DSH 的一个 **Agent 模式（preset）**：在这个模式下的会话里，`3dsmax-mcp` 的工具会自动挂载，
3ds Max 专用技能也自动出现在技能目录里。**其它模式（standard / ptc）完全不受影响**，
所以不为它们付 MCP 的 token。

## 怎么用

1. 重启 DSH（宿主侧改动需要重启才生效）。
2. 新建会话时在**模式选择器**里选 **「3ds Max」**（`id: 3dsmax`，roster 里排第 5）。
3. 会话里应能看到一批 `mcp__3dsmax__*` 工具（`query_scene`、`manage_layers`、`merge_from_file`…），
   以及技能目录里的 `3dsmax-rig-controller-transfer` 与 `3dsmax-live-mcp`。

> 默认模式没有改动，仍是 `standard`。本模式是**可选**的。

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

**服务器不在这份 git 里**（源码 22 MB + `.venv` 67 MB），而是由 `install.ps1` **clone 到本包内部**：

```
_mytools\Mode\dsh-3dsmax\upstream\3dsmax-mcp\      ← 在 .gitignore 里，不进 git
```

preset 的 `--directory` 同样从本包位置推导（和上面的 `customSkillDirs` 一个写法）：

```yaml
- !!js process.env.DSH_3DSMAX_MCP_DIR || …resolve('@local/dsh-mode-3dsmax/package.json')
       → …/dsh-3dsmax/upstream/3dsmax-mcp
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

代码跟着 `_mytools/` 走（已在 git 里），但 **profile 安装记录、`upstream/` checkout 与 `.venv` 都在本机**，
所以每台新机器跑一次：

```powershell
# 若这台机器的全局 git 代理是坏的（见上），加 -BypassProxy
powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1 -BypassProxy
# 若 3ds Max 里还没有原生桥，再加 -InstallMaxBridge
```

它做四件幂等的事：

1. 把 `3dsmax-mcp` clone 到 `upstream\3dsmax-mcp`（钉定 tag；已有则校验/切换）
2. `uv sync` 准备 `.venv`（`uv` 缺失只告警，不拦）
3. 把本包链接进 `desktop` 与 `web` 两个 profile 的 `node_modules/@local/`，并写进 `dependencies`
   与 `dsh.profile.bundles`（末尾）
4. 跑 `check-presets.mjs` 校验

然后重启 DSH。常用开关：`-SkipUpstream`、`-SkipSync`、`-SkipCheck`、`-InstallMaxBridge`。

## 上游更新后要重新生成 preset

**preset 没有继承机制**，所以本文件的 `plugins` 清单是上游
`packages/bundle/web-app/presets/standard.patch.yml` 的复制。上游改了 standard（新增工具、改默认配置）后，
本模式不会自动跟上。发现模式里少了新工具时，重新生成：

```powershell
# 1. 取上游 plugins 块，套上本模式的头部与两处新增（skill-filesystem.customSkillDirs、mcp-3dsmax）
#    生成逻辑见 git 历史里本文件的首次提交；关键点：plugins 块原样复制，
#    再给 skill-filesystem 补 config.customSkillDirs、末尾追加 mcp-3dsmax 行。
# 2. 校验
node _mytools\build\check-presets.mjs     # 期望 exit 0，且 3dsmax: ok
```

> 校验脚本 `_mytools/build/check-presets.mjs` 2026-10-15 修过一处误报：它会把 preset 行自己的
> `name:`（显示名）当成包名。现在只统计 `plugins:` 之下的 `name:`。

## 技能副本与 3ds Max 仓库的关系

`skills/` 下的两个技能是从 `E:\AI\3dMax\3dsmax-mcp-master\.agents\skills\` 复制过来的：

- `3dsmax-rig-controller-transfer/`（含 `references/`、`scripts/` 6 个 .ms）
- `3dsmax-live-mcp/`

**注意这是两份副本，会漂移。** 建议把这里的 `_mytools` 版本当权威（它跟着 git 走到每台机器），
在 3ds Max 仓库那边改完技能后同步过来。

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
```

改完重启 DSH 即恢复原状。

## 已知限制

- **与上游 standard 漂移**：见上面"上游更新后要重新生成 preset"。这是 preset 无继承带来的固有成本。
- **需要重启 DSH 才生效**：预设是宿主侧组合，HMR 只覆盖客户端插件。
- **未实测**：本模式的技能注册、MCP 自动连接、会话内工具可见性都还没在运行中的 DSH 里验证过
  （截至 2026-10-15 19:07 只做到静态校验通过）。重启后请按"怎么用"一节逐条确认。
- 头面部不在控制器迁移技能范围内（技能自身已注明）。
