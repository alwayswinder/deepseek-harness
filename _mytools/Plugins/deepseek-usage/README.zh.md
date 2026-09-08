# deepseek-usage

[English](README.md) | 中文

DeepSeek Harness 的树外插件：在设置页（插件 → 插件配置）提供一张**用量与余额卡片**。按每个已配置的账户显示：

- **今日消费** —— 当日花费，由 DSH 已经记录在 `assistant/message` 会话事件上的 token 用量在本地计量，并按各账户配置的费率（¥/百万 token）计价。
- **总余额** —— 账户支持时，从该账户的官方端点（`GET {baseURL}/user/balance`）获取总余额，每 `refreshSeconds` 刷新一次（默认 300 秒）。
- 本次对话消耗金额（显示在对话输入框下方）、更新时间与时区提示。

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
        defaultRate: { input: 1.58, cacheHit: 0.05, output: 4.75 }
        # optional per-model override:
        # rates: { 'deepseek-v4-flash': { input: 1.58, cacheHit: 0.05, output: 4.75 } }
```

随附默认值：

| account | provider | balanceBaseUrl | credential |
|---|---|---|---|
| opencode | `opencode` | （无 —— opencode.ai/zen 没有余额接口） | `OPENCODE_API_KEY` |
| deepseek-official | `''`（兜底所有未匹配路由） | `https://api.deepseek.com` | `DEEPSEEK_OFFICIAL_API_KEY` |

## 计价说明

默认费率取自 DeepSeek 公布的 deepseek-v4-flash **非高峰时段美元价格，换算为人民币（约 7.2）**。token 计数互不重叠（`inputTokens` = 未命中缓存的输入，缓存读取与写入分别计算），计费输入 = 未命中缓存的输入 + 缓存写入；成本公式按缓存命中费率为缓存读取计价。这些是估算值：请按各账户的真实账单调整 `defaultRate`/`rates`，并注意：

- 本地计量只覆盖流经本 DSH 实例的请求。
- `opencode.ai/zen` **不提供**公开余额端点，因此 openCode 账户只显示消费，并带一个"该平台无余额接口"标记。
- 官方 DeepSeek 账户需要把密钥存为 `DEEPSEEK_OFFICIAL_API_KEY` 凭据（例如通过模型页面或 `$DSH_HOME/.credentials.yaml`）。
