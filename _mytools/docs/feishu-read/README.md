# 读取飞书链接（lark-cli）

一句话：这台机器上有一个**已经登录好的 `lark-cli`**，把飞书链接丢进去就能读 wiki / 文档 / 表格，**不需要开放平台 app_id + app_secret**。

它来自 WorkBuddy 的 `feishu` 连接器（连接器市场里那套 skill + CLI 的形态），凭据存在 `C:\Users\fulin.hou\.lark-cli\`，以本机登录用户（侯富林，user 身份）的 OAuth token 调飞书开放接口。

- 版本：`lark-cli 1.0.100`
- 可执行文件：`C:\Users\fulin.hou\.workbuddy\binaries\node\cli-connector-packages\lark-cli.cmd`（同目录还有 `lark-cli.ps1` / `lark-cli`）
- **不在 PATH 里**，要么写全路径，要么自己把它加进 PATH
- 配置文件：`C:\Users\fulin.hou\.lark-cli\config.json`（appId `cli_ab8a9919b8f9dc03`，brand `feishu`，appSecret 存 keychain）
- 命令自带技能文档：`lark-cli skills list` / `lark-cli skills read lark-doc`

## 快速开始

```powershell
$lark = "C:\Users\fulin.hou\.workbuddy\binaries\node\cli-connector-packages\lark-cli.cmd"

& $lark whoami
& $lark docs +fetch --doc="https://herogames.feishu.cn/wiki/SCokwxoidikRd5kh2dvcjjUOnPc" `
        --as user --doc-format markdown -q '.data.document.content'
```

只要链接指向的是文档（wiki 节点 → docx），这一条就够；读不到再往下看类型分派和排错。

## 1. 先确认身份

```powershell
& $lark whoami        # profile / appId / brand / identity / onBehalfOf.userName / tokenStatus
& $lark auth status   # 更详细：bot 与 user 两套身份、tokenType、有效期、scope 列表
```

实测输出要点：

| 字段 | 当前值 | 含义 |
|---|---|---|
| `appId` | `cli_ab8a9919b8f9dc03` | 应用（profile） |
| `brand` | `feishu` | 国内版飞书（国际版为 lark） |
| `identity` | `user` | 以个人身份调用，能读到「你有权限」的文档 |
| `onBehalfOf.userName` | `侯富林` | 实际授权人 |
| `tokenType` | `DPoP` | 带设备密钥的双绑定 token |
| `identities.user.expiresAt` | 会话 token（本次 2 小时） | 到期自动用 refresh 续 |
| `refreshExpiresAt` | 数天后（本次 7 天） | 超过才需要重新 `auth login` |

- `bot` 身份只能读应用自己可见的内容，**读个人文档一律用 `--as user`**。
- 换机器/换人：`& $lark auth login`（Device Flow，给验证 URL + 码），`& $lark auth list` 看已登录账号。
- 健康检查：`& $lark doctor`。

## 2. 链接形态 → 该用哪个命令

| 链接形态 | 资源类型 | 读法 |
|---|---|---|
| `.../wiki/<node_token>` | Wiki 节点（外壳） | 先 `wiki +node-get` 拿到 `obj_type` 再分派；文档可直接 `docs +fetch` |
| `.../docx/<doc_token>` | 新版文档 | `docs +fetch --doc=<链接>` |
| `.../docs/<token>` | 旧版文档 | 同上 |
| `.../sheets/<token>` | 电子表格 | `sheets +workbook-info` → `sheets +cells-get` |
| `.../base/<app_token>` | 多维表格 | `base +table-list` → `base +record-list`（未实测） |
| `.../mindnotes/<token>` | 思维笔记 | `mindnotes` 命令组 |
| `.../slides/<token>` | 幻灯片 | `slides` 命令组 |
| `.../minutes/<token>` | 妙记 | `minutes` 命令组 |
| `.../file/<token>` | 云空间文件 | `drive +download` |

通用规律：多数子命令同时接受 `--url=<完整链接>` 或对应的 `--xxx-token`（两者互斥），所以**能直接贴链接就别手工拆 token**。

## 3. 读文档（wiki / docx / docs）

### 3.1 一步到位

```powershell
& $lark docs +fetch --doc="<飞书链接或 doc_token>" --as user --doc-format markdown -q '.data.document.content'
```

- 返回 JSON 里是 `data.document.content` + `document_id` + `revision_id`；正文默认是 DocxXML，`--doc-format markdown` 转成 Markdown。
- 两种 Markdown 的差别（实测同一文档 902 vs 866 字符）：`markdown` 保留 `<title>…</title>`；`im-markdown` 把标题降成 `# 标题`，更适合直接塞进对话。两者都会保留 `<sub-page-list …>` / `<cite …>` 这类仍是结构化块的片段（不是乱码，是子页面目录与引用块）。
- `--detail` 控制粒度：`simple`（默认，纯内容）| `with-ids`（带 block id，便于后续精确修改）| `full`（连样式）。

### 3.2 先看节点类型再决定怎么读

```powershell
& $lark wiki +node-get --node-token "https://herogames.feishu.cn/wiki/SCokwxoidikRd5kh2dvcjjUOnPc" --as user
```

返回 `title` / `obj_type`（`docx` `sheet` `bitable` `mindnote` `slides`…）/ `obj_token` / `space_id` / `parent_node_token` / `has_child` / `updated_at`。`--node-token` 既吃 node_token 也吃整条 URL。

- `obj_type=docx` → 用 `docs +fetch`（可直接把这条 wiki URL 传给它，实测可行）。
- `obj_type=sheet` → 走第 4 节。

### 3.3 长文档：先看目录，再定点读

```powershell
# 只要标题树
& $lark docs +fetch --doc=<链接> --as user --doc-format markdown --scope outline

# 按关键词切片（支持 '|' 表示 OR）
& $lark docs +fetch --doc=<链接> --as user --doc-format markdown --scope keyword --keyword="RMA|金属度"

# 从某个 block 展开一节，或取 block 区间（没有 --section 这种按标题名的参数）
& $lark docs +fetch --doc=<链接> --scope section --start-block-id <id> --context-after 3
& $lark docs +fetch --doc=<链接> --scope range --start-block-id <id> --end-block-id <id>

# 取历史版本
& $lark docs +fetch --doc=<链接> --revision-id 441
```

`--scope outline` 返回 `<fragment mode="outline">`，几十行的标题树，比读全文快一个数量级，适合先定位再全文。

`--scope keyword` 返回 `<fragment mode="keyword" hit-block-ids="doxcn… doxcn…">`，里面是若干 `<excerpt top-block-id="…">` 片段（命中行的上下文行，实测搜 `RMA` 命中了规范里的「粗糙金属 | [命名]_RMA」行）。命中块 id 可以直接喂给 `--scope section/range` 做定点展开。**关键词无命中时 `ok` 仍为 `true`、`content` 为空字符串**，不要误判成文档为空。

`--scope section` 的定位参数是 `--start-block-id`（块 id，不是标题文字）：块 id 来自 `--detail with-ids` 的输出或 keyword 片段的 `hit-block-ids`。

### 3.4 子页面（wiki 目录树）

`docs +fetch` 读到的父页面经常只是一个索引（几百字 + `<sub-page-list>`），正文在各子页里。此时用 `wiki +node-list`：

```powershell
& $lark wiki +node-list --space-id 7206138260752531457 `
        --parent-node-token SCokwxoidikRd5kh2dvcjjUOnPc --as user `
        -q '.data.nodes[] | {title: .title, obj_token: .obj_token, obj_type: .obj_type, has_child: .has_child}'
```

- `--parent-node-token` 决定下钻层级；省略则列该 space 的根节点。
- `--space-id my_library` 表示个人知识库；`& $lark wiki +space-list` 先查可用 space。
- 结果字段是 `.data.nodes[]`（不是 `items`），单个节点里标题字段是 `title`、表格里是 `sheet_name`。

### 3.5 落盘

`lark-cli` 输出是 stdout 上的 JSON，PowerShell 里必须显式指定 UTF-8，否则中文会乱码：

```powershell
$md = & $lark docs +fetch --doc="<链接>" --as user --doc-format markdown -q '.data.document.content'
$md | Out-File -LiteralPath "$env:TEMP\lark_doc.md" -Encoding UTF8
```

需要完整块结构/样式时用 `--doc-format xml`（默认）。`docs +fetch` **没有** `--output-path`，要整篇落盘用 `drive +export`（第 5 节），或直接把 `-q` 的结果 `Out-File`。

## 4. 读表格（sheet / base）

电子表格是两步：先拿 `sheet_id`，再读区域。

```powershell
$tok = "NW3Ws472Uh8GPbtdCv8cNvMsn2d"

# 1) 有哪些子表
& $lark sheets +workbook-info --spreadsheet-token $tok --as user `
        -q '.data.sheets[] | {sheet_id: .sheet_id, sheet_name: .sheet_name, rows: .row_count, cols: .column_count}'

# 2) 读区域（--url 直接贴链接也行）
& $lark sheets +cells-get --spreadsheet-token $tok --sheet-id=321284 --range=A1:D5 --as user --format pretty
```

- `--range` 不带表名前缀，表由 `--sheet-id` / `--sheet-name` 二选一指定。
- 大表用 `--output-path ./out.json`，stdout 只回执 `complete` / `truncated`，务必看回执别默认拿全了。
- `--format pretty|table|csv|json` 只影响 stdout 展示，不改数据。
- 多维表格（`/base/`）：`base +table-list --base-token <token>` → 再按 `table_id` 用 `base +record-list`，本次未实测，字段以 `base <cmd> --help` 为准。

## 5. 搜索与其它入口

```powershell
& $lark docs +search --query "美术资产命名" --as user --page-size 20   # 搜文档 / Wiki / 表格

# 整篇导出为本地文件（实测：贴图规范 15320 字节 markdown）
& $lark drive +export --url="<链接>" --file-extension markdown --output-dir "$env:TEMP"

& $lark api GET /open-apis/... --params '@./params.json'     # 没有类型化命令时的兜底
& $lark schema docx.document.get                             # 查接口参数与所需 scope
```

`drive +export` 的要点：`--file-extension` 取 `docx|pdf|xlsx|csv|markdown|base|pptx`；wiki 链接会自动解析到下层文档（回执里有 `wiki_node` / `saved_path` / `size_bytes`）；**文件名里的 `/` 会被去掉**（「贴图/材质 命名及属性规范」存成了 `材质 命名及属性规范.md`），要固定名字加 `--file-name`。

## 6. PowerShell 踩坑对照表（都是实测报错）

| 报错/现象 | 真实原因 | 解法 |
|---|---|---|
| `unknown command "docx" for "lark-cli"` | 命令域叫 `docs`，不是 `docx` | `lark-cli docs +fetch` |
| `unknown flag "--node-token" for "lark-cli wiki +node-list"` | 列子节点用父节点参数 | `--space-id <id> --parent-node-token <token>` |
| `jq error: cannot iterate over: null` | 字段猜错 | node-list 用 `.data.nodes[]`；表名是 `.sheet_name` |
| `positional arguments are not supported (got ["A1:D5"])` | PowerShell 把带 `:`/`,` 的值拆成了位置参数 | 写 `--range=A1:D5`（等号形式），URL 也一样 `--doc=<url>` |
| 中文乱码 | `Out-File` 默认不是 UTF-8 | 加 `-Encoding UTF8` |
| 只读到几百字就结束 | 父页面是索引页，正文在子页 | `wiki +node-list` 下钻后逐页 `docs +fetch` |
| `ok: false` + `type: api` | 无权限 / token 过期 / token 类型不对 | 见第 7 节 |

脚本里判断成功与否看 JSON 的 `"ok": true`，失败对象形如 `{"ok": false, "error": {"type": ..., "subtype": ..., "message": ...}}`。

## 7. 权限与报错

- 能读到什么，取决于**授权人本人**在飞书里的权限；`--as user` 读不到就是真没权限，不是你命令写错。
- 403 时的路：让对方加你为文档协作者，或 `& $lark drive +apply-permission --url=<链接>` 发申请（命令存在，本次未实测）。
- 需要确认具体权限时：`& $lark auth scopes`（应用已开通）与 `& $lark auth check --scope "docx:document:readonly"`。
- 当前 token 已覆盖常用读权限：`wiki:node:read`、`docx:document:readonly`、`docs:document.content:read`、`sheets:spreadsheet:read`、`base:table:read`、`drive:drive.metadata:readonly`。
- token 过期不会静默失败：`whoami` 里 `tokenStatus` 会变，重跑 `auth login` 即可（refresh token 有效期内一般自动续）。

## 8. 实战案例（本文所有命令的来源）

**A. 「1.1.3 美术资产命名规则」**

```powershell
& $lark wiki +node-get --node-token "https://herogames.feishu.cn/wiki/SCokwxoidikRd5kh2dvcjjUOnPc" --as user
# title=1.1.3 美术资产命名规则  obj_type=docx  obj_token=UlcGdc5TioMnfixHICXcqLn6nCc
# space_id=7206138260752531457  parent_node_token=IQpAwHB3EigJDtkM0CNcpMECnXb  has_child=true
```

`docs +fetch` 全文只有约 900 字：一个 `<sub-page-list>`（7 篇子页：角色 / 场景 / 动画序列 / 怪物动作 / 特效 / 归档 / UI）+ 通用命名规则（`[资产类前缀]_[驼峰资产名]_([中缀]*n)_([尾缀])`，示例 `T_Common_SmallTree01_Def`，并 cite 了 `1.1.1 美术 P4 库目录结构`）。**父页是索引，细节在子页**。

该节点的直接子节点（`wiki +node-list` 实测）：

| title | obj_type | obj_token |
|---|---|---|
| 伍六七-中英文资产名对照表 | sheet | `NW3Ws472Uh8GPbtdCv8cNvMsn2d`（sheet_id `321284`，217 行 × 21 列） |
| 贴图/材质 命名及属性规范 | docx | `OZCBdrJRIo51ckxYzHLc5jQlnuf`（revision 441） |
| UI | docx | `NzG5dYRoMoC3K4xzVrkcSTfwnWe` |

**B. 「贴图/材质 命名及属性规范」outline**

```powershell
& $lark docs +fetch --doc="https://herogames.feishu.cn/wiki/ZNmewg3Qfi2zL1kdkkScPvNQn7b" --as user --doc-format markdown --scope outline
# 贴图 / 场景贴图 / 天空盒 / 角色贴图 / UI 贴图 / 特效贴图 / 贴图属性规范总表 / 贴图批量检查工具
# 材质 / 次表面描述文件
```

**C. 可复用函数**

```powershell
function Get-LarkDoc {
    param(
        [Parameter(Mandatory)][string]$Url,
        [string]$Out,
        [string]$Scope = "full"
    )
    $lark = "C:\Users\fulin.hou\.workbuddy\binaries\node\cli-connector-packages\lark-cli.cmd"
    $md = & $lark docs +fetch --doc=$Url --as user --doc-format markdown --scope $Scope -q '.data.document.content'
    if ($md -match '"ok":\s*false') { throw ($md -join "`n") }
    if ($Out) { $md | Out-File -LiteralPath $Out -Encoding UTF8; return "saved: $Out" }
    return ($md -join "`n")
}

Get-LarkDoc -Url "https://herogames.feishu.cn/wiki/ZNmewg3Qfi2zL1kdkkScPvNQn7b" -Scope outline
```

## 9. 边界

- 这套能力绑定在 WorkBuddy 的飞书连接器上：没装 WorkBuddy 的机器上没有这个 `lark-cli`，需要另装并 `auth login`。
- 只有链接、没有权限时，命令行读不出来；要么申请权限，要么让对方导出成文件（`drive +export`）。
- 本文只覆盖**读**。写（`docs +update`、`sheets +cells-set`、`base +record-create` 等）风险等级更高，命令里标了 `high-risk-write` 的必须 `--yes`，改真实文档前先 `--dry-run`。
