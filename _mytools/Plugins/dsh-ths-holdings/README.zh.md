# dsh-ths-holdings

[English](README.md) | 中文

<p align="center">
  <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="Awesome DSH Plugin"></a>
  <a href="https://www.npmjs.com/package/dsh-ths-holdings"><img src="https://img.shields.io/npm/v/dsh-ths-holdings?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/PM25000/dsh-ths-holdings"><img src="https://img.shields.io/github/stars/PM25000/dsh-ths-holdings?style=flat-square" alt="GitHub stars"></a>
  <img src="https://img.shields.io/badge/license-MIT-ff1493?style=flat-square" alt="MIT">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）网页 GUI 上的**持仓盈亏悬浮卡片**。自动从[同花顺投资账本](https://tzzb.10jqka.com.cn)同步你的**真实持仓数据**——无需手动添加股票。实时显示**今日盈亏**、**上证指数**和当日分时走势图，遵循 A 股红涨绿跌惯例。

与自选股盯盘工具不同，这个插件读取的是你的**真实持仓**，显示**真实盈亏**——百分比和金额都支持——每 20 秒自动刷新。

## 截图

![dsh-ths-holdings 卡片](assets/screenshot.png)

## 安装

```sh
dsh plugin --profile web add dsh-ths-holdings
```

安装实际上是在 web profile 里执行 `pnpm add`：包的 `dsh.bundle.patch` 会自动并入 profile 层。然后**重启 `dsh web`**，右下角出现悬浮卡片。

`0.1.8` 支持 DSH `0.2.0-rc.1` 及后续 `0.2.x` 版本。更早的插件版本面向 DSH `0.1.x`，会被 DSH 的兼容性检查拒绝。

不用 `dsh plugin` 手动安装：编辑 `$DSH_HOME/profiles/web/package.json`：

```jsonc
{
  "dependencies": {
    "dsh-ths-holdings": "^0.1.8"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...existing bundles,
        "dsh-ths-holdings"
      ]
    }
  }
}
```

然后 `cd $DSH_HOME/profiles/web && pnpm install` 并重启 `dsh web`。插件行由包的 `cordis.patch.yml` 提供，不需要手写。

## 使用

**推荐方式（自动获取）**：

1. 打开 DSH 网页 GUI，点击卡片上的 **⚙**。
2. 点击 **🖥 自动获取 Cookie（推荐）**——会弹出系统浏览器窗口（Edge / Chrome，自动选择已安装者）。
3. 在弹出的窗口里完成同花顺投资账本登录（扫码 / 账号密码）。
4. 登录成功后窗口自动关闭，Cookie 自动保存，卡片立即刷新并显示你的持仓。
5. 插件自动发现你的组合——如有多个，从下拉框选一个即可。

> 自动获取的 Edge 窗口带有反自动化伪装（隐藏 `navigator.webdriver`、关闭 AutomationControlled 特性）以通过同花顺风控。若个别网络/时段下页面仍显示 **Nginx forbidden**，在弹出窗口里按 `F5` 刷新或手动访问 [https://tzzb.10jqka.com.cn](https://tzzb.10jqka.com.cn) 即可，登录完成后点卡片上的「**我已登录，继续 →**」；Cookie 仅保留 `10jqka` 域字段，不会整段明文落盘。

**手动方式（如偶尔需要）**：

1. 打开 [https://tzzb.10jqka.com.cn](https://tzzb.10jqka.com.cn) 并登录。
2. 按 **F12 → 控制台**，运行：
   ```javascript
   copy(document.cookie)
   ```
3. Cookie 已复制到剪贴板。
4. 打开 DSH 网页 GUI，点击卡片上的 **⚙**，把 Cookie 粘贴进 **STOCK_PNL_COOKIE** → **保存**。
5. 保存后卡片会当场校验 Cookie——显示 **✓ 有效** 或 **✗ 无效**（无效会给出原因与提示）。

会话 Cookie 会过期——过期时卡片显示 **Token 已过期** 横幅，重开 ⚙ 点 **自动获取**（或重复手动步骤 1–4）即可（`v` 反爬令牌自动处理，无需关心）。

> 💡 完成一笔新交易后，请在投资账本 **APP** 上重新上传数据到网页版，避免两端持仓不一致。
>
> ![上传数据教程](assets/update.png)

## 管理持仓（插件自己的页面）

这份工作副本的 `dsh-ths-holdings` 只发宿主半边，持仓的日常维护放在**插件自己的页面**上——和桌宠的设置同一个位置：**设置 → 插件 → 点开 `dsh-ths-holdings` 这一条**，页面里就是「持仓管理」（`plugins.bundle.config`，按包名挂在自己的 bundle 页上）。

- **看** — 每只持仓的代码、名称、数量、成本，以及公开行情算出的现价、市值、累计盈亏（相对成本）和今日盈亏（相对昨收）；表格上方是整仓合计，没有报价的行会单独说明。
- **改** — 直接改表格里的代码 / 名称 / 数量 / 成本，点「保存」写回持仓文件；「放弃修改 / 重新载入」退回上一次载入的状态。
- **增删** — 「添加一行」加一条空行，行尾的「删除」去掉一条。
- **先校验再落盘** — 保存前整份列表都会被检查（6 位代码、数量 > 0、成本 ≥ 0、代码不重复）；不合格的行标红并逐条给出原因，只要有一行不合格就什么都不写。
- **写回** — 保存原子替换当前持仓文件，保留导出流程写入的 `exported_at` / `export_date` / `source_file`，另记一个 `updated_at`；盈亏卡片在下一次轮询（约 20 秒）后使用新数据，不需要重启。
- **选文件** — 表格上方的「持仓文件位置」一行会显示当前文件以及这个路径的来源。可以直接填绝对路径，或点「选择目录…」用外壳的目录选择器；**保存位置** 只在本机记住它（写在 `$DSH_HOME/ths-holdings.location.json`），**恢复默认** 忘掉这个选择。默认位置是 `$DSH_HOME/ths-holdings/positions.json`；本机没有选过路径时使用 profile 里的 `positionsFile` 配置，选过的路径优先于它。
- **总资产与可用资金** — 「总资产」一行填账户总资产（现金 + 持仓市值），页面随即显示 **可用资金 = 总资产 − 已保存持仓的市值** 及其占比；这个数只记在本机（`$DSH_HOME/ths-holdings.assets.json`），不写进持仓快照，也不上传。留空或点「清除」表示不设置——那时可用资金显示为未知，而不是 0。总资产小于持仓市值时可用资金为负并给出提示，通常意味着填少了或持仓含融资。

> 已配置账本 Cookie 时，卡片的数字来自账本接口，这一页的编辑只在「导出持仓 + 公开行情」这条本地通路上生效——页面顶部会如实说明这一点。

持仓快照属于个人数据，不会放在这个包里：把上面的位置指向你实际保存它的地方即可，例如私有仓库里的 `D:\holdings\positions.json`。这条通路与 `.xlsx` 导入共用同一个文件：随时可以再把账本导出的表格拖到 `ths-export-positions.bat` 上整份覆盖（它写入同一个配置路径），之后继续在插件页面里微调。

## 特性

- **📊 实时持仓盈亏** — 每 20 秒（可配置）轮询你的真实组合
- **¥ / % 切换** — 今日盈亏可按金额、百分比或两者同时显示
- **📈 当日走势图** — 迷你折线 + 零轴虚线，红涨绿跌
- **🇨🇳 上证指数** — 与你的盈亏并列显示
- **🔄 自动发现** — `fund_key` 从组合列表自动获取；多账户可通过下拉框选择
- **🖥 自动获取 Cookie** — 一键弹出 Edge 登录窗口，登录即自动保存，无需 F12
- **✓ 保存即校验** — 粘贴或自动获取后当场验证 Cookie 是否被账本接受
- **⚙ 持仓管理页** — 设置 → 插件 → 点开 `dsh-ths-holdings`：改成本 / 数量、增删持仓，带实时市值与盈亏
- **📁 文件位置设置** — 自己选持仓快照放在哪（默认 `$DSH_HOME/ths-holdings/positions.json`），真实持仓因此不进入这个公开包，也可以放进私有仓库
- **💰 总资产与可用资金** — 填一次账户总资产，页面显示可用资金（总资产 − 持仓市值）与占比；设置只留在本机
- **↕ 可拖动** — 沿右侧边缘上下拖动标题栏（位置存 localStorage）
- **⚙ 就地设置** — 粘贴 Cookie、选择组合，全在卡片上完成
- **🔒 凭据安全** — Cookie 始终留在宿主进程

## 工作原理

```text
┌─────────────── Web browser ───────────────┐
│  client.js (browser module)               │
│  · plugins.bundle.config → holdings page   │
│  · React (editable table over host routes) │
│          │ fetch (same-origin)             │
└──────────┼─────────────────────────────────┘
           ▼
┌─────────────── DSH Host (index.js) ───────┐
│  cordis plugin: webServer routes          │
│  · GET /api/stock-pnl          snapshot    │
│  · GET /api/stock-pnl/portfolios  accounts │
│  · GET /api/stock-pnl/verify     cookie ok?│
│  · POST /api/stock-pnl/acquire*   sign-in │
│  · GET|POST /api/stock-pnl/positions hold. │
│  resolves Cookie via ctx.credentials      │
│  auto-discovers user_id + fund_key        │
│  POSTs Tonghuashun ledger APIs            │
└───────────────────────────────────────────┘
```

node 半区每次请求通过凭据引用通道（`ctx.credentials`）读取登录 Cookie——浏览器端永远看不到它。携带凭据的请求不跟随重定向。`v` 反爬令牌按 User-Agent 每次现算，存储的 Cookie 只需会话字段。

「自动获取 Cookie」走宿主进程内的 `acquire.ts` 状态机：点按钮 → 弹出反自动化的 Edge 窗口打开投资账本 → 检测到登录态（`userid` cookie）后自动收集该域 Cookie、写入凭据并关闭窗口；超时 / 用户关窗 / 页面被风控拦截都会在卡片上显示可操作提示。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `cookieEnv` | `STOCK_PNL_COOKIE` | 存放账本 Cookie 的凭据引用。 |
| `fundKeyEnv` | `STOCK_PNL_FUND_KEY` | 存放组合 key 的凭据引用（从卡片 ⚙ 表单保存）。 |
| `user_id` | Cookie 的 `userid` | 账本用户 id，表单载荷中都会包含；为空时回退到 Cookie 自身的 `userid`。 |
| `fund_key` | 自动发现 | 选择所管理组合的账本 fund key；设置了 `fundKeyEnv` 凭据时覆盖，为空时从组合列表自动发现。 |
| `pnlUrl` | 同花顺 `time_share` 端点 | 盈亏端点覆盖（测试指向脚本化服务器）。 |
| `indexUrl` | 同花顺 `getQuotes` 端点 | 指数端点覆盖（测试指向脚本化服务器）。 |
| `quoteUrl` | 腾讯 `qt.gtimg.cn/q=` | 本地行情源的批量报价端点覆盖，盈亏卡片与持仓管理页共用（测试指向脚本化服务器）。 |
| `positionsFile` | `$DSH_HOME/ths-holdings/positions.json` | 导出的持仓快照路径，持仓管理页读写的也是这个文件。插件页面上选过的路径优先于这个值（见「管理持仓」）。 |
| `pollMs` | `20000` | 卡片使用的轮询间隔（毫秒）；随每次响应的 `poll_ms` 上报给浏览器。 |
| `minuteRefreshMs` | `120000` | 一张分时曲线缓存多久（毫秒）。 |

## 目录结构

这份工作副本按桌宠那套写法维护：**手写的 ESM / lazy-CJS 就是最终产物**，没有 `src/` → `lib/` 这一步，因此**没有 `node_modules`、没有构建脚本、没有 lockfile**。运行时只需要 `_mytools\Plugins\node_modules` 里由 `ensure-plugin-modules.bat` 维护的 peer 链接（junction，0 字节）。

```
dsh-ths-holdings/
├── index.js                # host half: webServer routes + credential resolution + config
├── fetch.js                # Tonghuashun ledger API calls + auto-discovery + cookie verify
├── acquire.js              # auto-acquire cookie (playwright-core drives Edge/Chrome)
├── local.js                # local quote source: exported holdings + Tencent quote feed
├── location.js             # where the holdings file lives: default, machine choice, validation
├── positions.js            # holdings page: validate and write
├── client.js               # browser half: the holdings manager on this plugin's own page
├── cordis.patch.yml        # dsh.bundle patch layer
├── package.json            # dsh.bundle + dsh.client manifests
├── vitest.config.ts        # the plugin's own test config (the repository's covers no path here)
├── tests/                  # ledger / verify / acquire / holdings-route specs + two keyless smokes
└── README.md
```

测试（在插件目录里跑；不需要先构建任何东西）：

```sh
..\..\..\node_modules\.bin\vitest.CMD run    # host half: 43 specs
node tests\positions-ui.smoke.mjs            # browser half: register, render, edit, save
node tests\host.smoke.mjs                    # boot the package by row name and drive the routes
```

## FAQ / 故障排查

| 现象 | 原因与解决 |
|---|---|
| 卡片显示 `请配置 Cookie` | `STOCK_PNL_COOKIE` 为空——在 ⚙ 面板点「自动获取」或手动粘贴。 |
| 卡片显示 `Token 已过期` | 会话 Cookie 过期——在 ⚙ 面板点「自动获取」重新登录，或手动重新 `copy(document.cookie)` 粘贴。 |
| 点「自动获取」提示缺少 playwright-core | 本副本不含构建依赖，`playwright-core` 需要单独装：`npm i -g playwright-core`（插件目录、web profile、全局 npm 根都会被查找），然后**重启 dsh web** 再试。 |
| 自动获取弹出窗口后没有反应 | 在弹出窗口完成登录（扫码 / 账号），登录后窗口会自动关闭并保存。 |
| 弹出窗口显示 `Nginx forbidden` | 同花顺风控偶发拦截——在窗口里 F5 刷新或手动访问登录页重试；登录完成后点「我已登录，继续 →」。 |
| 保存后徽标显示 `✗ 无效` | 粘贴的 Cookie 已失效或不是投资账本会话——重新登录获取后再试；面板会给出具体原因。 |
| 下拉框没有组合 | 组合列表需要有效的 Cookie——先保存有效 Cookie，再点 ↻ 刷新。 |
| 有多个组合 | 从下拉框选一个——选择会保存为 `STOCK_PNL_FUND_KEY`。 |
| 粘贴的 Cookie 带换行 | 插件保存时会去掉空白，换行粘贴也没问题。 |
| 在插件列表里找不到这一条 | 这一半走宿主启动时算出的插件清单：改完插件要**重启 DSH**（桌面端重启应用，网页版重启 `dsh web`）；位置是 **设置 → 插件 → `dsh-ths-holdings`**（在 bundle 那一组里，和桌宠同一条路）。 |
| 保存成功但卡片数字没变 | 卡片按 `pollMs`（默认 20 秒）轮询一次，等一轮即可；若已配置账本 Cookie，卡片走账本通路，本页只改本地快照。 |
| 保存被拒、某行标红 | 按提示修该字段：代码必须是 6 位数字、数量 > 0、成本 ≥ 0、代码不能重复；全部合格才会写文件。 |
| 持仓管理页一片空白 | 当前持仓文件里还没有持仓——「持仓文件位置」那一行会显示当前用的是哪个文件；直接「添加一行」保存即可创建，或把位置指到已经有持仓的文件。 |
| 持仓文件不在插件目录里了 | 现在默认如此：插件不再随包提供、也不读取包目录里的 `positions.json`。某台机器还需要旧列表时，把「持仓文件位置」指到列表实际所在处（例如私有仓库的克隆），或重新跑一次 `ths-export-positions.bat`；旧的已提交副本仍留在这个仓库的历史里。 |

## Model Experience

无——卡片是宿主数据路由上的浏览器端叠加层，不注册任何面向模型的内容。

#### KV Cache 影响

无——插件不贡献任何 prompt、schema 或结果。

## 已知限制

- **账本 API 是未公开的、需登录的端点** — 响应格式可能变化，Cookie 会过期；插件以错误呈现，而不是重试或缓存。
- **组合列表端点（`account_list`）需要先保存 Cookie** — 粘贴有效 Cookie 后组合选择器才会出现。
- **自动获取复用系统浏览器** — 依赖 `playwright-core`（本副本不再随包安装，需要 `npm i -g playwright-core` 或放进插件目录的 `node_modules`），自动选择已安装的 Edge / Chrome；找不到时自动获取不可用（退化为手动粘贴），页面会给出明确提示。
- **无服务端轮询** — 路由按请求拉取，卡片按配置的 `pollMs` 间隔轮询；没有共享缓存或推送通道。
- **持仓管理页只改本地快照** — 它读写当前配置的持仓文件，不会写回同花顺账本；账本侧仍需在投资账本里维护（改完再导出一次 `.xlsx` 即可整份覆盖）。
- **它挂在插件自己的页面上** — 用的是 Plugins 页给 bundle 的 `plugins.bundle.config` 位置（与桌宠设置同一处），因此只有这一条 bundle 被打开时才渲染；这一页需要浏览器重新加载插件清单，所以改完插件必须重启 DSH。

## License

[MIT](LICENSE)
