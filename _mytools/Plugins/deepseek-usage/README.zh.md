# deepseek-usage

[English](README.md) | 中文

DeepSeek Harness 的树外插件：在设置页（插件 → 插件配置）提供一张**用量与余额卡片**。按每个已配置的账户显示：

- **今日消费** —— 当日花费，由 DSH 已经记录在 `assistant/message` 会话事件上的 token 用量在本地计量，并按各账户配置的费率（¥/百万 token）计价；所有会话都计入，包含子 agent。
- **总余额** —— 账户支持时，从该账户的官方端点（`GET {baseURL}/user/balance`）获取总余额，每 `refreshSeconds` 刷新一次（默认 300 秒）。
- **本次对话** —— 当前对话的花费（显示在对话输入框下方），包含该对话派生的子 agent，并标出它们所占的份额；卡片顶部另有更新时间与时区提示。

## 工作原理

- **Host 侧**（`index.js`，纯 ESM）：通过 harness 凭据服务解析每个账户的凭据、拉取余额，把会话 token 用量折算成按账户、按本地日期记账的账本，持久化在 `$DSH_HOME/storages/deepseek-usage-meter.json`，并把去抖后的快照发布到 `deepseek-usage` 设置命名空间。
- **浏览器侧**（`client.js`）：手工构建的 lazy-CJS 工厂 bundle，通过 `window.__ModuleLoader__.load` 注册。卡片经 `ctx.settingsScope` 绑定 `deepseek-usage` 命名空间；标准设置镜像把 Host 的发布送达浏览器，无需自定义 RPC。

不修改任何 harness 包。该插件位于包树之外，因此上游更新与构建不受影响。移除方式：`dsh plugin --profile web remove @local/dsh-deepseek-usage`。

## 安装

```sh
# from anywhere; resolves the package as a file dependency into the web profile
dsh plugin --profile web add file:<repo>/_mytools/Plugins/deepseek-usage
```

然后重启 `dsh web`（bundle 行在启动时激活，浏览器必须加载新的客户端 bundle），并打开 设置 → 插件 → 插件配置。`_mytools/start-dsh.bat` 会自己完成这次注册，并把 profile 里已安装的副本同步到最新，因此用该脚本启动无需手动执行上面的命令，之后对插件目录的改动也会被带进去。

## 配置

编辑本目录下的 `cordis.patch.yml`（或在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中覆盖 `deepseek-usage` 行）：

```yaml
- id: deepseek-usage
  name: '@local/dsh-deepseek-usage'
  config:
    refreshSeconds: 300
    accounts:
      <account-id>:
        id: <account-id>
        label: 显示名
        provider: <llm provider route; '' means catch-all for unmatched routes>
        balanceBaseUrl: ''            # '' disables the balance endpoint
        credential: <credential ref name>
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
```

每笔结算的路由取自该 `assistant/message` 事件自带的 `message.source`（provider 与 model），因此按模型的 `rates` 会作用于真正产生该消息的模型；事件没有 source 时回退到折叠出的 `request/header`。

随附默认值：

| account | provider | balanceBaseUrl | credential |
|---|---|---|---|
| opencode | `opencode` | （无 —— opencode.ai/zen 没有余额接口） | `OPENCODE_API_KEY` |
| deepseek-official | `''`（兜底所有未匹配路由） | `https://api.deepseek.com` | `DEEPSEEK_OFFICIAL_API_KEY` |

## 计价说明

费率是该服务商按账户货币公布的每百万 token 价格。token 计数互不重叠（`inputTokens` = 未命中缓存的输入，缓存读取与写入分别计算），计费输入 = 未命中缓存的输入 + 缓存写入；成本公式按缓存命中费率为缓存读取计价。

随附的 DeepSeek 费率是自北京时间 2026-09-10 12:00 起生效的 Flash 价目：空闲时段缓存命中 ¥0.02、缓存未命中 ¥1、输出 ¥4（每百万 token），官方公布的高峰时段（工作日北京时间 09:00–12:00 与 14:00–18:00）翻倍。内测路由 `deepseek-v4.1-flash-expires-on-0910` 按同一份 Flash 价目计费，费率相同。用账户自身的余额差核对 2026-09-10 当天：这组费率能把当日扣费复现到百分之几以内；此前随附的价目（1.58 / 0.05 / 4.75）是 DeepSeek 已作废的价格，会把花费高估约 1.5 倍。

### 自动校准

每个账户的展示金额都带一个**费率系数**。只要余额接口可用，每次刷新就把当天已结算的余额差与当天按列表价记账的金额相比；被采纳的比值按 `calibration.alpha` 折入系数（首次观测直接作为初值；超出 `minFactor`/`maxFactor` 的比值、或任一侧低于 `minObserved` 的观测都丢弃）。账本始终按列表价记账，所以这个比较始终是两个独立量的比较。因此服务商调价后，卡片与对话条上的数字会自动跟上——卡片显示当前系数，对话条给已校准的金额标上 `≈`——不需要改这个目录；把 `calibration.enabled` 设为 `false` 即可完全沿用配置费率。

由此带来两条限制：

- 该系数假定余额差全部来自本机的请求。如果同一账户还在其他机器或工具上使用，它们的消费也会计入余额差，从而把系数推高（`maxFactor` 限制了偏离幅度）。
- 当天已聚合的 token 没有模型与高峰时段之分，因此每个账户只得到一个标量系数；没有余额接口的账户永远保持系数 1。

这些仍是估算值——请按各账户的真实账单调整 `defaultRate`/`rates`——并注意：

- 价目变化后，下一次加载会用新价目重新计算**当天**已经记账的 token（聚合后的 token 没有模型与高峰时段之分，按账户的 `defaultRate` 计价）；更早的日期保留当时价目下的花费。
- 本地计量只覆盖流经本 DSH 实例的请求。
- 官方余额比产生它的请求晚几分钟结算，因此余额差会短暂落后于本地计量值。
- `assistant/attempt` 结算（已中断或报错、但仍上报了用量的流）不计入。
- 子 agent 的花费按会话血缘归属：子 agent 会话（`origin: 'subagent'` 且带 `parentSession`）会折进每一个拥有它的对话，而共用同一父会话的普通分叉仍各自独立；父会话不在运行中的子 agent 只保留自己那条记录。
- `opencode.ai/zen` **不提供**公开余额端点，因此 openCode 账户只显示消费，并带一个“该平台无余额接口”标记；它的随附费率只是占位值。
- 官方 DeepSeek 账户需要把密钥存为 `DEEPSEEK_OFFICIAL_API_KEY` 凭据（例如通过模型页面或 `$DSH_HOME/.credentials.yaml`）。
