# deepseek-usage

[English](README.md) | 中文

DeepSeek Harness 的树外插件：在设置页（插件 → 插件配置）提供一张**用量卡片**。每个已配置的账户按它的 `kind` 显示：

- **`balance`** —— 预付费钱包。卡片显示**今日消费**（由 DSH 已记录在 `assistant/message` 会话事件上的 token 用量在本地计量，并按账户配置的费率计价，单位为账户货币/百万 token）与**总余额**，余额每 `refreshSeconds` 刷新一次。`balanceVia`（默认 `auto`）决定余额来源：该账户存了 API Key 时用官方端点（`GET {balanceBaseUrl}/user/balance`），否则读**本应用已登录的平台钱包**——就是账户页显示的那个数，经 harness 的账户服务读取、完全不需要 API Key；`api` 或 `platform` 可各自固定一种来源。
- **`quota`** —— 订阅制。卡片显示该服务商控制台计量的额度窗口：5 小时、本周、本月三档，每档带已用比例、对应金额与重置时间。订阅没有钱包，因此这一类型没有余额行，也没有费率系数。

对话输入框下方的汇总条只报**一个**账户：当前对话正在使用的 LLM 路由所属的那个。每个账户用 `providers` 列出自己名下的路由 id，所以在服务商之间切换模型时，条上的数字跟着换，而不是并排多出一组。没有任何账户认领的路由完全不计量；刚启动、还没见过请求的 Host 没有路由，此时列出全部账户。

## 工作原理

- **Host 侧**（`index.js`，纯 ESM）：通过 harness 凭据服务解析每个账户的凭据、拉取余额或额度读数，把会话 token 用量折算成按账户、按本地日期记账的账本并持久化在 `$DSH_HOME/storages/deepseek-usage-meter.json`，同时跟踪每个非 subagent 会话最近一次请求的路由，再把去抖后的快照发布到 `deepseek-usage` Config 的热更新 `metrics` 字段。
- **浏览器侧**（`client.js`）：手工构建的 lazy-CJS 工厂 bundle，通过 `window.__ModuleLoader__.load` 注册。卡片经 `ctx.configForms` 读取 `deepseek-usage` 表单并渲染其中的 `metrics` 字段；标准配置镜像把 Host 的发布送达浏览器，无需自定义 RPC。

不修改任何 harness 包。该插件位于包树之外，因此上游更新与构建不受影响。移除方式：`dsh plugin --profile web remove @local/dsh-deepseek-usage`。

## 安装

```sh
# from anywhere; resolves the package as a file dependency into the web profile
dsh plugin --profile web add file:<repo>/_mytools/Plugins/deepseek-usage
```

然后重启 `dsh web`（bundle 行在启动时激活，浏览器必须加载新的客户端 bundle），并打开 设置 → 插件 → 插件配置。`_mytools/build/start-dsh.bat` 会自己完成这次注册，并把 profile 里已安装的副本同步到最新，因此用该脚本启动无需手动执行上面的命令，之后对插件目录的改动也会被带进去。

Desktop 使用自己的配置（`$DSH_HOME/profiles/desktop`）并拒绝 `dsh plugin --profile desktop`：请在应用的**插件 → 添加插件**对话框中填入本目录的绝对路径，每台机器安装一次。Host 半需要从插件自身目录解析 `@deepseek-ai/schemastery`，该依赖由 `_mytools/build/ensure-plugin-modules.bat` 提供，所有构建与启动脚本都会调用它。

## 配置

编辑本目录下的 `cordis.patch.yml`（或在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 中覆盖 `deepseek-usage` 行）：

```yaml
- id: deepseek-usage
  name: '@local/dsh-deepseek-usage'
  config:
    refreshSeconds: 30
    accounts:
      <account-id>:
        id: <account-id>
        label: 显示名
        # balance (default): prepaid wallet plus the local daily ledger.
        # quota: the vendor console's own usage meters.
        kind: balance
        # The route ids that bill this account; a session on any of them is
        # priced into this entry, and a route listed nowhere is not metered.
        providers: [<route-id>, <another-route-id>]
        balanceBaseUrl: ''            # '' disables the balance endpoint
        credential: <credential ref name>
        # auto (default): the endpoint above when a key is stored for this account,
        # otherwise the Platform login this app holds. api / platform pin one source.
        balanceVia: auto
        currency: CNY
        defaultRate: { input: 1, cacheHit: 0.02, output: 4 }
        # optional per-model override, keyed by the route model id:
        # rates: { 'deepseek-v4-flash': { input: 1, cacheHit: 0.02, output: 4 } }
        # optional peak-hours rule; omit the block for one flat price:
        # peak:
        #   timezone: Asia/Shanghai     # windows are that provider's own clock
        #   multiplier: 2
        #   windows: ['09:00-12:00', '14:00-18:00']
        #   weekdaysOnly: true
        # optional self-calibration against this account's own balance delta:
        # calibration:
        #   enabled: true
        #   alpha: 0.3            # share of each observed ratio folded in
        #   minObserved: 0.25     # ignore observations below this spend
        #   minFactor: 0.2        # accepted ratio band; outside it is rejected
        #   maxFactor: 5
      <quota-account-id>:
        id: <quota-account-id>
        label: 显示名
        kind: quota
        providers: [<route-id>]
        credential: <credential ref name>
        currency: USD
        quota:
          # The console endpoint that answers this subscription's meters.
          baseUrl: 'https://<vendor>/console/api/go/status'
          # The workspace the console scopes the answer to; the endpoint rejects
          # a request without it. It is the id in the console page URL.
          orgId: '<org-id>'
```

每笔结算的路由取自该 `assistant/message` 事件自带的 `message.source`（provider 与 model），因此按模型的 `rates` 会作用于真正产生该消息的模型；事件没有 source 时回退到折叠出的 `request/header`。

随附默认值：

| account | kind | providers | 数据来源 | credential |
|---|---|---|---|---|
| deepseek-official | `balance` | `deepseek-official`、`deepseek-account` | `https://api.deepseek.com`，否则用平台登录 | `DEEPSEEK_API_KEY` |
| opencode-go | `quota` | `opencode-go` | `https://opencode.ai/console/api/go/status` | `OPENCODE_GO_API_KEY` |

OpenCode Go 控制台的额度以金额计量：每档返回 `usedMicroCents` 与 `limitMicroCents`，卡片显示 `100 × 已用 / 上限` 以及这两个金额。5 小时、本周、本月分别是一个模型月额度的 20%、50%、100%，所以三行通常按这个比例分布。换了可用模型后，控制台在下一次刷新就返回新的上限，这里无需改动。

## 计价说明

费率是该服务商按账户货币公布的每百万 token 价格。token 计数互不重叠（`inputTokens` = 未命中缓存的输入，缓存读取与写入分别计算），计费输入 = 未命中缓存的输入 + 缓存写入；成本公式按缓存命中费率为缓存读取计价。

随附的 DeepSeek 费率是自北京时间 2026-09-10 12:00 起生效的 Flash 价目：空闲时段缓存命中 ¥0.02、缓存未命中 ¥1、输出 ¥4（每百万 token），官方公布的高峰时段（工作日北京时间 09:00–12:00 与 14:00–18:00）翻倍。内测路由 `deepseek-v4.1-flash-expires-on-0910` 按同一份 Flash 价目计费，费率相同。用账户自身的余额差核对 2026-09-10 当天：这组费率能把当日扣费复现到百分之几以内；此前随附的价目（1.58 / 0.05 / 4.75）是 DeepSeek 已作废的价格，会把花费高估约 1.5 倍。

### 自动校准

每个账户的展示金额都带一个**费率系数**。只要余额接口可用，每次刷新就把当天已结算的余额差与当天按列表价记账的金额相比；被采纳的比值按 `calibration.alpha` 折入系数（首次观测直接作为初值；超出 `minFactor`/`maxFactor` 的比值、或任一侧低于 `minObserved` 的观测都丢弃）。账本始终按列表价记账，所以这个比较始终是两个独立量的比较。因此服务商调价后，显示的消费金额会自动跟上，卡片同时显示当前系数，无需修改这个目录；把 `calibration.enabled` 设为 `false` 即可完全沿用配置费率。

由此带来两条限制：

- 该系数假定余额差全部来自本机的请求。如果同一账户还在其他机器或工具上使用，它们的消费也会计入余额差，从而把系数推高（`maxFactor` 限制了偏离幅度）。
- 当天已聚合的 token 没有模型与高峰时段之分，因此每个账户只得到一个标量系数；没有余额接口的账户永远保持系数 1。

这些仍是估算值——请按各账户的真实账单调整 `defaultRate`/`rates`——并注意：

- 价目变化后，下一次加载会用新价目重新计算**当天**已经记账的 token（聚合后的 token 没有模型与高峰时段之分，按账户的 `defaultRate` 计价）；更早的日期保留当时价目下的花费。
- 本地计量只覆盖流经本 DSH 实例的请求。
- 官方余额比产生它的请求晚几分钟结算，因此余额差会短暂落后于本地计量值。
- `assistant/attempt` 结算（已中断或报错、但仍上报了用量的流）不计入。
- 官方端点需要把密钥存为 `DEEPSEEK_API_KEY` 凭据（例如通过模型页面或 `$DSH_HOME/.credentials.yaml`）。平台来源不需要密钥，但它取决于本应用的登录状态：未登录时卡片会如实说明而不是显示 0；并且**可用状态**在平台来源下按「钱包里有钱」判断，因为平台汇总里没有 `is_available` 字段。
- `quota` 账户在账本里只有 token 数、没有金额：订阅不按 token 计费，剩余多少只看它自己的控制台读数。
