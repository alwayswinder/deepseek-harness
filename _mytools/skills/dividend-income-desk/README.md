# dividend-income-desk

攒股收息持仓的「近期操作建议（加仓 + 止盈提醒 + 逻辑复核 + 评级）」决策助手，DSH skill 形式。

它做七件事：

1. 从持仓插件 `dsh-ths-holdings` 读取当前持仓（`$DSH_HOME/ths-holdings.location.json` 指定的快照文件）和账户总资产；
2. 拉实时行情、近年分红、最新财报、预约披露日、最近公告、机构目标价；
3. 算可用资金（总资产 − 持仓市值）、每股分红、现价股息率、成本股息率、派息率、目标价，标出需要解释的异常；
4. 按 `reference/framework.md` 的收息框架，回答**未来几天该加仓哪只**：候选排名、价格区间、触发条件、失效条件、建议金额（按元，不折算股数）；买入上限 = 可用资金 − 计划现金，不设单日额度；
5. 回答**哪些持仓该做止盈提醒**：只看两条——浮盈是否达到 `takeProfitPct`，现价是否接近/达到机构目标价中位。**只报机构参考价、现价、比例与差距，不给动作**，卖不卖由用户决定；
6. 回答**哪些持仓触发退出逻辑复核**：分红削减、连续两期扣非下滑、治理事件、行业衰退**加速**；命中后先看「是否已被股价计入」——价格在近一年 30% 分位以下且浮盈 ≥ -10% 时判「已计入」不触发，但加速恶化不豁免。结论只有「保留 / 降级观察」，不输出卖点；
7. 给出**五档评级**（加仓/持有/观察/减仓/卖出）：按分红、盈利、估值、价格、风险五个维度打分，再叠加治理、止盈、盈利、息率、权重五条封顶规则。

**三条判断线 + 一个评级**：加仓看股息率与分红可持续性；止盈只看浮盈与机构目标价；逻辑复核看分红、扣非、治理与经营量是否在加速恶化；评级把三者合成五档。止盈与逻辑复核都不输出卖点，卖出只在评级里给，且只给批次与价位，卖不卖、卖多少由用户决定。

机构目标价来自同花顺 F10 研报摘要与东财研报库，**每家机构只取最新一次**再算中位与区间；只有 1 家给目标价时标「样本不足」，不当成共识。

## 安装

本仓库里 skill 源码放在 `_mytools/skills/dividend-income-desk`，安装方式是在 `%DSH_HOME%\skills` 下建一个目录联接（junction），让加载器直接读仓库这一份，不做副本：

```bat
_mytools\build\ensure-skills.ps1
```

`build\start-dsh.bat` 与 `build\start-desktop.bat` 每次启动都会调用它，按目录名幂等链接；已有真实目录、或指向别处且目标仍存在的链接不动，悬空的链接会重建。

## 使用

在对话里说「看看持仓，最近该买什么」即可触发；也可以直接点名 `dividend-income-desk`。

手动跑脚本：

```sh
node scripts/next-trading-day.mjs --count 3
node scripts/dividend-dossier.mjs                      # Markdown
node scripts/dividend-dossier.mjs --json --no-news     # JSON，不拉公告
node scripts/dividend-dossier.mjs --out "$env:TEMP\dividend-desk.md"
node scripts/set-assets.mjs --total 1000000            # 写入账户总资产（也可在插件页填）
node scripts/rate-holdings.mjs --file dossier.json     # 五档评级（先跑 dossier --json）
node scripts/peer-strength.mjs                          # 与同行中位比，判断行业性/个体性
node --test "tests/*.spec.mjs"                          # 纯计算用例
```

## 参数

`config.json`：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `targetYieldPct` | 4.5 | 目标股息率，用来算目标价 |
| `minYieldToBuyPct` | 4.0 | 现价股息率低于此值不进加仓候选 |
| `trimYieldPct` | 2.5 | 现价股息率低于此值不进加仓候选（不代表要卖） |
| `maxSingleWeightPct` | 15 | 单只权重上限 |
| `maxIndustryWeightPct` | 35 | 行业权重上限，超过在报告里标 ⚠ |
| `cashReservePct` | 10 | 计划保留的现金比例 |
| `takeProfitPct` | 30 | 浮盈达到这个百分比就进止盈提醒 |
| `nearTargetRatio` | 0.85 | 现价 ÷ 机构目标价中位 达到这个比例就进止盈提醒（≥1 即已超目标价） |
| `minAnalystCount` | 2 | 目标价样本少于此数时标「样本不足」，只作参考 |
| `riskReview` | 见下 | 退出逻辑复核的阈值组 |
| `rating` | 见下 | 五档评级的分数线与封顶规则 |
| `cycleReview` | 见下 | 周期底部五问的阈值与排除清单 |

`riskReview` 段：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `dividendCutPct` | 30 | 每股分红同比降幅达到此值即触发 |
| `deductProfitYoYPct` | -20 | 扣非同比低于此值计入「盈利恶化」 |
| `consecutivePeriods` | 2 | 需要连续几期 |
| `penaltyPctOfProfit` | 10 | 处罚/减值金额占净利润超过此比例触发 |
| `volumeDeclineQuarters` | 3 | 经营量连续萎缩季数（未加速时用） |
| `accelerationMinPct` | 5 | 同比降幅扩大多少个百分点算「加速」 |
| `lowCostGainPct` | -10 | 浮盈高于此值视为「成本不高」 |
| `pricedInPercentile` | 30 | 现价处于近一年收盘价分位低于此值视为「已计入」 |
| `relativeStrengthMinPct` | 10 | 扣非同比优于/差于同行中位多少个百分点算「行业性 / 个体」 |
| `minPeerCount` | 3 | 同行少于该家数时只标「样本不足」，不下行业性/个体结论 |
| `peers` | 见 config | 每只持仓的同行对照清单（代码数组） |

`rating` 段：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `addMinScore` | 75 | 综合分达到即「加仓」 |
| `holdMinScore` | 60 | 达到即「持有」 |
| `watchMinScore` | 45 | 达到即「观察」 |
| `reduceMinScore` | 30 | 达到即「减仓」，低于即「卖出」 |
| `sellBufferGainPct` | -15 | 治理事件下浮亏深于此值时，卖出降为减仓 |
| `governanceCodes` | `["600598"]` | 手工登记治理风险的代码，公告只取最近 6 条看不到时兜底 |

`cycleReview` 段：

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `pbPercentileMax` | 20 | PB 处近 5 年该分位以下算「估值在底部」 |
| `peerLossPctMin` | 50 | 同行扣非为负的家数占比达到此值算「行业亏损面够大」 |
| `minSignals` | 3 | 五项里成立几项才算「周期底部候选」 |
| `maxTranchePct` | 33 | 周期底部买入时单笔不超过计划额度的百分比 |
| `structuralCodes` | `["601006","002027"]` | 需求结构性下台阶、不套周期底部逻辑的代码 |
| `overrides` | `{}` | 按代码覆盖阈值，例如 `{"601888": {"targetYieldPct": 2.0}}` |
| `repairCodes` | `["601888","513330"]` | 价值修复类持仓：不套用股息率阈值与目标价，只回答「现在买不买」 |

## 目录

```
SKILL.md                  模型执行流程
config.json               个人阈值
reference/framework.md    收息决策框架：股息率口径、分红可持续性、红利税、仓位、执行
reference/data-sources.md 接口与字段说明、失败降级
scripts/dividend-dossier.mjs  持仓 + 行情 + 分红 + 财报 + 公告
scripts/announcement.mjs      公告标题与正文
scripts/set-assets.mjs        写入 / 清除账户总资产
scripts/rate-holdings.mjs     把 dossier JSON 打成五档评级
scripts/peer-strength.mjs     扣非同比与同行中位对比，判断行业性还是个体性
scripts/next-trading-day.mjs  下一交易日与当前时段
scripts/shared/analysis.mjs   分红汇总、股息率、权重与提醒（纯计算）
scripts/shared/calendar.mjs   交易日与时段（纯计算）
scripts/shared/text.mjs       公告正文 HTML 实体解码（纯计算）
tests/*.spec.mjs              node:test 用例，不联网
```

## 账户总资产

可用资金 = 总资产 − 持仓市值，总资产记在 `$DSH_HOME/ths-holdings.assets.json`，由持仓插件页的「总资产」一行维护；本 skill 的 `set-assets.mjs` 写的是同一个文件，写完立即生效（宿主每次请求都会重读）。没设置时可用资金显示为「未知」，权重退回按持仓市值计算。

## 已知限制

- 交易日只跳过周末，不查法定节假日：春节、国庆这类长假需要自己核对交易所通知。
- 持仓快照需要用户自己保持更新（插件页编辑或重新导出账本）；脚本只提示「N 天前」，不会自动同步账本。
- 数据来自东方财富、腾讯、新浪的公开接口，限流或改版会导致个别标的「数据问题」，脚本降级不中断。
- 基金分红按「最近一个完整年度」算股息率与目标价，没有完整年度时退回近 12 个月；分红趋势只比两个完整年度，避免拿未过完的当年比上一年整年。
- 东方财富的分红送配表（`RPT_SHAREBONUS_DET`）不收录特别分红这类临时分派，会让 TTM 股息率偏低。脚本用公告标题交叉核对：公告说已实施分派、分红表里却没有对应记录时，取公告正文补录每股金额与除息日，补录只进 TTM，年度股息率与目标价仍按分红表口径，避免把一次性分红当成经常性收益。加 `--no-news` 会跳过分红缺口核对。
- 本机 `web_fetch` 会报 `multiple usable web providers are registered`、`web_search` 走 OpenCode 网关时也可能拿不到结果，skill 里所有取数都走直连接口。
