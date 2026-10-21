# web-search-opencode

给 DSH 提供 `opencode` 搜索 provider：会话里的 `web_search` 走 OpenCode 的
Anthropic 兼容网关（`zen/go`），由 OpenCode 计费，不再落到 DeepSeek 官方账户。

## 为什么需要它

DSH 的 `web_search` 是一个独立的搜索能力位（`ctx.web`），默认组合把它固定为
`deepseek-official`：打 `https://api.deepseek.com/anthropic/v1/messages`，密钥取
`DEEPSEEK_API_KEY`。对话模型即使走 `opencode-go`，搜索也仍然由官方账户付费 ——
2026-10-21 那天 18 次搜索就因此产生了 ¥0.44。

OpenCode 网关本身支持 Anthropic 的原生 `web_search_20250305` 服务端工具，但要求
每个请求带 `x-opencode-session` 头；DSH 自带的 DeepSeek provider 不发这个头，
所以只改 `baseURL` 通不了，需要这个插件。

## 配置

profile 里的 `web-search-opencode` 行，字段全部可选：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `baseURL` | `https://opencode.ai/zen/go/v1` | Anthropic 兼容基址，自动追加 `/messages` |
| `model` | `deepseek-v4.1-flash` | 网关模型；必须能执行原生 `web_search`（见下表） |
| `apiKeyEnv` | `OPENCODE_GO_API_KEY` | 凭据引用名；依次查凭据服务、进程环境变量 |
| `apiVersion` | `2023-06-01` | `anthropic-version` 头 |
| `maxTokens` | `4096` | 单次搜索的输出上限 |
| `maxUses` | `5` | 单次请求内服务端搜索次数上限 |
| `sessionHeader` | `x-opencode-session` | 网关要求的会话头名；换成别的网关时改这里 |
| `disableThinking` | `true` | 发送 `thinking: {type: disabled}`，省掉没有消费者的推理 token |

插件同时把 web 能力位的 `searchProvider` 改成 `opencode`；`deepseek-official`
provider 仍然注册着，只是不再被选中。

### Go 套餐里哪些模型能搜索（2026-10-21 实测）

Go 档网关（`GET /zen/go/v1/models`）共 37 个模型，Claude 只有 `claude-haiku-5-5`；
能否搜索与“是不是 Claude”无关，取决于网关是否代跑 `web_search`：

| 模型 | 实测 |
|---|---|
| `deepseek-v4.1-flash` | ✅ 10 条来源，5.9 s（默认，也是对话模型） |
| `claude-haiku-5-5` | ✅ 9 条来源，7.9 s |
| `kimi-k3` | ✅ 7 条来源，24.6 s（慢） |
| `qwen3.8-flash` / `qwen3.8-max` | ❌ 模型拒答“不能联网”，无工具结果块 |
| `minimax-m3` | ❌ 只有文本回答，无 `web_search_tool_result` 块 |
| `claude-sonnet-5-5` / `claude-opus-5` | ❌ Go 档不可用（400 / 402 / 403，属 zen 按量计费） |

## 安装

```powershell
# 从仓库根目录执行。pnpm 按 profile 目录（$DSH_HOME/profiles/web）解析 file: 路径，
# 相对路径会落到 profile 里找不到，所以这里给仓库根目录的绝对路径、正斜杠。
dsh plugin --profile web add "file:$($PWD.Path.Replace('\','/'))/_mytools/Plugins/web-search-opencode"
```

Desktop profile 拒绝 `dsh plugin --profile desktop`，按既有约定用应用的
**Plugins → Add plugin** 对话框填这个目录的绝对路径；`_mytools/build/start-desktop.bat`
里的 `sync-plugins.bat` 已登记本插件目录，装成副本的机器每次启动会刷新。

改完重启应用生效（provider 在启动时注册）。

## 校验

`tests/live-search.mjs` 用真实凭据打一次真实搜索，验证解析链路：

```sh
node _mytools/Plugins/web-search-opencode/tests/live-search.mjs "DeepSeek API 价格"
```

它打印来源数量与前三条 URL，失败退出码 1。会消耗一次网关调用（默认模型档，
一次约 ¥0.01 量级）。

## 已知限制

- 搜索质量取决于网关侧执行的 `web_search`；换 `model` 到不支持的模型会得到
  “no web_search_tool_result blocks” 错误。
- `x-opencode-session` 每次搜索随机生成，没有任何持久会话语义。
- 网关不跟随重定向（`redirect: 'error'`），凭据不会被转发到别的源。
