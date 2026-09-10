# deepseek-usage

English | [中文](README.zh.md)

Out-of-tree DeepSeek Harness plugin: a **usage & balance card** on the settings
page (Plugins → 插件配置). Shows, per configured account:

- **今日消费** — today's spend, metered locally from the token usage DSH already
  records on `assistant/message` session events, priced with each account's
  configured rates (¥/1M tokens). Every session counts here, subagents included.
- **总余额** — total balance from the account's official endpoint
  (`GET {baseURL}/user/balance`) when the account supports one, refreshed every
  `refreshSeconds` (default 300s).
- **本次对话** — the current conversation's spend, shown under the composer. It
  includes the subagents that conversation spawned and names their share. The
  header also reports the update time and timezone.

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
dsh plugin --profile web add file:<repo>/_mytools/Plugins/deepseek-usage
```

Then restart `dsh web` (the bundle row activates at boot; the browser must load
the new client bundle) and open Settings → Plugins → 插件配置.
`_mytools/start-dsh.bat` runs this registration itself and also refreshes the
profile's installed copy, so a launch through that script needs no manual step
and picks up later edits to this directory.

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

Each settlement takes its route from the `assistant/message` event's own
`message.source` (provider and model), so per-model `rates` price the model that
actually produced the message; the folded `request/header` supplies the fallback
for events that carry no source.

Shipping defaults:

| account | provider | balanceBaseUrl | credential |
|---|---|---|---|
| opencode | `opencode` | (none — opencode.ai/zen has no balance API) | `OPENCODE_API_KEY` |
| deepseek-official | `''` (catch-all) | `https://api.deepseek.com` | `DEEPSEEK_OFFICIAL_API_KEY` |

## Pricing notes

Rates are the provider's published prices in the account currency per 1M
tokens. Token counts are disjoint (`inputTokens` = uncached input; cache
read/write separate), and billed input = uncached input + cache write; the cost
formula prices cache reads at the cache-hit rate.

The shipped DeepSeek rates are the Flash price list in force since 2026-09-10
12:00 Beijing time: cache hit ¥0.02, cache miss ¥1, output ¥4 per 1M tokens
off-peak, doubled inside the published peak windows (weekdays 09:00–12:00 and
14:00–18:00 Beijing time). The beta route `deepseek-v4.1-flash-expires-on-0910`
bills on the same Flash list and carries the same rates. Checked against the
account's own balance delta on 2026-09-10, these rates reproduce the day's
charge within a few percent; the previously shipped list (1.58 / 0.05 / 4.75)
was DeepSeek's superseded pricing and overstated spend by about 1.5x.

### Self-calibration

Displayed amounts carry a per-account **price factor**. While the balance
endpoint answers, each refresh compares the settled day delta with the same
day's metered cost at list prices; an accepted ratio moves the factor by
`calibration.alpha` (the first observation seeds it, and ratios outside
`minFactor`/`maxFactor`, or observations below `minObserved` on either side, are
ignored). The ledger keeps metering at list prices, so the comparison always
weighs two independent quantities. A provider price change therefore reaches
every figure — the card shows the factor, and the conversation strip marks
calibrated amounts with `≈` — without editing this directory; set
`calibration.enabled: false` to pin the configured rates exactly.

Two limits follow from what is observable:

- The factor assumes the balance delta belongs to this machine's requests. An
  account shared with other machines or tools shows their spend in the delta
  too, which inflates the factor (`maxFactor` bounds the damage).
- The day's metered tokens carry no model or peak split once aggregated, so the
  observation yields one scalar for the whole account, and an account without a
  balance endpoint keeps factor 1.

These remain estimates — adjust `defaultRate`/`rates` to each account's real
billing — and note that:

- A changed price table re-prices the current day's already-metered tokens on
  the next load (aggregated tokens carry no model or peak split, so the
  account's flat `defaultRate` prices them); earlier days keep what they cost
  under the table in force then.
- Local metering covers only requests that flowed through this DSH instance.
- The official balance settles a few minutes behind the requests that produced
  it, so the balance delta trails the locally metered figure briefly.
- `assistant/attempt` settlements (an aborted or errored stream that still
  reported usage) are not metered.
- Subagent spend is attributed by session lineage: a subagent session
  (`origin: 'subagent'` plus `parentSession`) folds into every conversation that
  owns it, while an ordinary fork of the same parent stays separate. A subagent
  whose parent is not live keeps its own entry only.
- `opencode.ai/zen` exposes **no** public balance endpoint, so the openCode
  account shows spend only and a "该平台无余额接口" badge; its shipped rates are
  placeholders.
- The official DeepSeek account needs its key stored as the `DEEPSEEK_OFFICIAL_API_KEY`
  credential (e.g. via the Models page or `$DSH_HOME/.credentials.yaml`).