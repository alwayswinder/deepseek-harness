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

### MCP 的路径

`3dsmax-mcp` 仓库默认按 `E:/AI/3dMax/3dsmax-mcp-master` 启动。换机器若路径不同，设环境变量覆盖：

```powershell
setx DSH_3DSMAX_MCP_DIR "D:/somewhere/3dsmax-mcp-master"
```

## token 开销（实测）

`3dsmax-mcp` 默认 `tool_profile = full`，对外暴露 **184 个工具 / 274,564 字节** schema，
约 **7–9 万 token**，会进入**每个请求**。这是本模式的主要开销，也是"只在需要时才进这个模式"的原因。

想大幅压低，改 `3dsmax-mcp-master\mcp_config.ini`：

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

如果没有配 MCP，也可以用仓库自带的 `scripts/mcpcall.py` 走命令行（零 token 成本，做法见技能）。

## 换机器 / 新克隆后怎么装

代码跟着 `_mytools/` 走（已在 git 里），但 **profile 的安装记录在 `$DSH_HOME` 下、按机器独立**，所以要跑一次：

```powershell
powershell -ExecutionPolicy Bypass -File _mytools\Mode\dsh-3dsmax\install.ps1
```

它做三件幂等的事：把本包链接进 `desktop` 与 `web` 两个 profile 的 `node_modules/@local/`、
把 `@local/dsh-mode-3dsmax` 写进两个 profile 的 `dependencies` 与 `dsh.profile.bundles`（末尾）、
最后跑一遍 `_mytools\build\check-presets.mjs` 校验。然后重启 DSH。

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
