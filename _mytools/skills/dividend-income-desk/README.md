# dividend-income-desk

攒股收息持仓的「下一交易日加仓 + 止盈复核」决策助手，DSH skill 形式。

它做五件事：

1. 从持仓插件 `dsh-ths-holdings` 读取当前持仓（`$DSH_HOME/ths-holdings.location.json` 指定的快照文件）和账户总资产；
2. 拉实时行情、近年分红、最新财报、预约披露日、最近公告、机构目标价；
3. 算可用资金（总资产 − 持仓市值）、每股分红、现价股息率、成本股息率、派息率、目标价，标出需要解释的异常；
4. 按 `reference/framework.md` 的收息框架，回答**当前价格下该加仓哪只**：候选排名、挂单价格区间、触发条件、失效条件，买入金额不超过可用资金；现金不够时只写需回款多少，不替用户决定卖什么；
5. 回答**哪些持仓该复核止盈**：只看两条——浮盈是否达到 `takeProfitPct`，现价是否接近/达到机构目标价中位。不看技术形态，不从基本面推卖出。

**两套口径分开**：加仓看股息率与分红可持续性；止盈看浮盈与机构目标价。分红削减、利润崩塌、权重超限只让标的退出加仓候选，不构成卖出理由；止盈清单只写「到线了」与参考价位，卖不卖、卖多少由用户决定。

机构目标价来自同花顺 F10 研报摘要与东财研报库，**每家机构只取最新一次**再算中位与区间；只有 1 家给目标价时标「样本不足」，不当成共识。

## 安装

本仓库里 skill 源码放在 `_mytools/skills/dividend-income-desk`，安装方式是在 `%DSH_HOME%\skills` 下建一个目录联接（junction），让加载器直接读仓库这一份，不做副本：

```bat
_mytools\build\ensure-skills.ps1
```

`build\start-dsh.bat` 与 `build\start-desktop.bat` 每次启动都会调用它，按目录名幂等链接；已有真实目录、或指向别处且目标仍存在的链接不动，悬空的链接会重建。

## 使用

在对话里说「看看持仓，明天开盘该买什么」即可触发；也可以直接点名 `dividend-income-desk`。

手动跑脚本：

```sh
node scripts/next-trading-day.mjs --count 3
node scripts/dividend-dossier.mjs                      # Markdown
node scripts/dividend-dossier.mjs --json --no-news     # JSON，不拉公告
node scripts/dividend-dossier.mjs --out "$env:TEMP\dividend-desk.md"
node scripts/set-assets.mjs --total 1000000            # 写入账户总资产（也可在插件页填）
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
| `takeProfitPct` | 30 | 浮盈达到这个百分比就进止盈复核 |
| `nearTargetRatio` | 0.95 | 现价 ÷ 机构目标价中位 达到这个比例就进止盈复核（≥1 即已超目标价） |
| `minAnalystCount` | 2 | 目标价样本少于此数时标「样本不足」，只作参考 |
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
