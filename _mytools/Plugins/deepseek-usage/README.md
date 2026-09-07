# deepseek-usage

Out-of-tree DeepSeek Harness plugin: a **usage & balance card** on the settings
page (Plugins → 插件配置). Shows, per configured account:

- **今日消费** — today's spend, metered locally from the token usage DSH already
  records on `assistant/message` session events, priced with each account's
  configured rates (¥/1M tokens).
- **总余额** — total balance from the account's official endpoint
  (`GET {baseURL}/user/balance`) when the account supports one, refreshed every
  `refreshSeconds` (default 300s).
- 月度估算（本月累计本地记账值）、更新时间与时区提示。

## How it works

- **Host half** (`index.js`, plain ESM): resolves each account's credential
  through the harness credentials service, fetches balances, folds session
  token usage into a per-account per-local-day ledger persisted at
  `$DSH_HOME/storages/deepseek-usage-meter.json`, and publishes a debounced
  snapshot into the `deepseek-usage` settings namespace.
- **Browser half** (`client.js`): a hand-built lazy-CJS factory bundle
  registered via `window.__ModuleLoader__.load`. The card binds the
  `deepseek-usage` namespace through `ctx.settingsScope`; the standard settings
  mirror delivers Host publishes with no custom RPC.

No harness package is modified. The plugin lives outside the package tree, so
upstream updates and builds are unaffected. To remove it:
`dsh plugin --profile web remove @local/dsh-deepseek-usage`.

## Installing

```sh
# from anywhere; resolves the package as a file dependency into the web profile
dsh plugin --profile web add file:C:/AI/DSH/_mytools/Plugins/deepseek-usage
```

Then restart `dsh web` (the bundle row activates at boot; the browser must load
the new client bundle) and open Settings → Plugins → 插件配置.

## Configuration

Edit `cordis.patch.yml` in this directory (or override the `deepseek-usage` row
in `$DSH_HOME/profiles/web/cordis.patch.yml`):

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

Shipping defaults:

| account | provider | balanceBaseUrl | credential |
|---|---|---|---|
| opencode | `opencode` | (none — opencode.ai/zen has no balance API) | `OPENCODE_API_KEY` |
| deepseek-official | `''` (catch-all) | `https://api.deepseek.com` | `DEEPSEEK_OFFICIAL_API_KEY` |

## Pricing notes

The default rates are the published DeepSeek **off-peak USD prices of
deepseek-v4-flash converted to ¥ (~7.2)**. Token counts are disjoint
(`inputTokens` = uncached input; cache read/write separate), and billed input =
uncached input + cache write; the cost formula prices cache reads at the
cache-hit rate. These are estimates: adjust `defaultRate`/`rates` to each
account's real billing, and note that:

- Local metering covers only requests that flowed through this DSH instance.
- `opencode.ai/zen` exposes **no** public balance endpoint, so the openCode
  account shows spend only and a "该平台无余额接口" badge.
- The official DeepSeek account needs its key stored as the `DEEPSEEK_OFFICIAL_API_KEY`
  credential (e.g. via the Models page or `$DSH_HOME/.credentials.yaml`).