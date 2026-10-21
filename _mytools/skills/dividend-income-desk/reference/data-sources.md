# 数据来源与接口

脚本已经把这些接口包好了，这一页只在接口失败、字段含义存疑，或需要补抓公告正文时查。所有接口都是公开的、无需登录；数据截至 2026-10-21 实测可用。

## 持仓

| 项 | 规则 |
| --- | --- |
| 位置文件 | `%DSH_HOME%\ths-holdings.location.json`，字段 `positionsFile`，由插件页面「保存位置」写入 |
| 默认位置 | `%DSH_HOME%\ths-holdings\positions.json` |
| 快照字段 | `exported_at`（导出时间）、`updated_at`（页面编辑时间）、`positions[]`（`code` / `name` / `qty` / `cost`） |
| 更新方式 | Settings → Plugins → `dsh-ths-holdings` 行内编辑；或把账本导出的 xlsx 拖到 `ths-export-positions.bat` |
| DSH_HOME | 未设置或空白时取 `~/.dsh`，开头的 `~` 需展开，相对路径转绝对路径 |

插件卡片若配置了同花顺账本 Cookie，卡片数字来自账本接口，而持仓文件是「导出快照 + 公开行情」这一路，两者数量可能不同步。结论里要写清用的是哪一路。

## 行情（腾讯公开行情）

```
http://qt.gtimg.cn/q=sh600941,sz000895,sh512890
```

- 返回 GB18030 编码文本，每行形如 `v_sh600941="1~中国移动~600941~96.59~101.77~...";`
- 代码前缀：`6/5/9` → `sh`，`0/1/2/3` → `sz`，`4/8` → `bj`
- 常用字段（`~` 分割后的下标）：`1` 名称、`2` 代码、`3` 现价、`4` 昨收、`5` 今开、`30` 时间戳、`31` 涨跌额、`32` 涨跌幅、`33` 最高、`34` 最低、`37` 成交额（万元）、`39` 市盈率 TTM、`45` 总市值（亿）、`46` 市净率
- ETF 的 `39`/`46` 可能为空；判定 ETF 用代码形态（`5xxxxx`、`15xxxx`、`16xxxx`、`18xxxx`）

## 分红（东方财富数据中心）

```
https://datacenter-web.eastmoney.com/api/data/v1/get
  ?reportName=RPT_SHAREBONUS_DET
  &columns=ALL
  &filter=(SECURITY_CODE="600941")
  &pageNumber=1&pageSize=40
  &sortColumns=REPORT_DATE&sortTypes=-1
  &source=WEB&client=WEB
```

| 字段 | 含义 |
| --- | --- |
| `REPORT_DATE` | 分红对应的报告期，`2026-06-30` 为中期，`2025-12-31` 为年度 |
| `PRETAX_BONUS_RMB` | 每 10 股派息（税前，元）；除以 10 得到每股 |
| `EX_DIVIDEND_DATE` | 除权除息日 |
| `EQUITY_RECORD_DATE` | 股权登记日 |
| `ASSIGN_PROGRESS` | 实施进度，`实施分配` 才是已发放 |
| `IMPL_PLAN_PROFILE` | 方案原文，例如 `10派25.10元(含税,扣税后22.59元)` |
| `NOTICE_DATE` | 公告日 |

同一 `REPORT_DATE` 年份内的中期与年度行相加，才是该年度的每股分红合计。未实施的预案不计入已发放分红，单独当作「待实施」提示。

## 财报（业绩报表）

```
https://datacenter-web.eastmoney.com/api/data/v1/get
  ?reportName=RPT_LICO_FN_CPD
  &columns=ALL
  &filter=(SECURITY_CODE="600941")
  &pageNumber=1&pageSize=6
  &sortColumns=REPORTDATE&sortTypes=-1
  &source=WEB&client=WEB
```

| 字段 | 含义 |
| --- | --- |
| `REPORTDATE` | 报告期 |
| `TOTAL_OPERATE_INCOME` / `YSTZ` | 营业总收入 / 同比（%） |
| `PARENT_NETPROFIT` / `SJLTZ` | 归母净利润 / 同比（%） |
| `WEIGHTAVG_ROE` | 加权 ROE（累计，%） |
| `BASIC_EPS` / `BPS` | 每股收益（累计）/ 每股净资产 |
| `MGJYXJJE` | 每股经营现金流 |

季报的 EPS 与 ROE 是年初至今累计值，不能直接和年度值比较。

## 行业（东财行情快照）

```
https://push2.eastmoney.com/api/qt/stock/get?secid=1.600941&fields=f127
```

`secid` 前缀：沪市（`5/6/9` 开头）用 `1.`，深市与北交所用 `0.`。`f127` 是东财的行业名（例如 `通信服务`、`银行Ⅱ`）。ETF 这一栏为空，脚本统一记作 `ETF/基金`；取不到时记 `未分类`，不影响其它字段。

## 披露日程（预约披露）

```
https://datacenter-web.eastmoney.com/api/data/v1/get
  ?reportName=RPT_PUBLIC_BS_APPOIN
  &columns=ALL
  &filter=(SECURITY_CODE="600941")
  &pageNumber=1&pageSize=6
  &sortColumns=APPOINT_PUBLISH_DATE&sortTypes=-1
  &source=WEB&client=WEB
```

`APPOINT_PUBLISH_DATE` 是预约日，`ACTUAL_PUBLISH_DATE` 为空说明还没披露；两张不一致时以实际披露为准。

## 公告（东方财富公告接口）

```
https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=6&page_index=1&ann_type=A&client_source=web&stock_list=600941
```

- `title` 标题、`notice_date` 日期、`art_code` 文章编号
- 正文接口：`https://np-cnotice-stock.eastmoney.com/api/content/ann?art_code=<art_code>&client_source=web&page_index=1`，正文在 `data.notice_content`（HTML，需去标签）
- 详情页（浏览器）：`https://data.eastmoney.com/notices/detail/<code>/<art_code>.html`
- 巨潮原始公告：`https://www.cninfo.com.cn/new/hisAnnouncement/query`（POST 表单，字段 `stock`、`seDate`、`column=szse`、`tabName=fulltext`）

公告标题足以判断事件类型（定期报告、分红实施、减持、诉讼、监管问询、业绩预告）。需要读正文时再抓详情页。

## 基金分红（红利 ETF）

```
https://fundf10.eastmoney.com/fhsp_<code>.html
```

表格列为：年份、权益登记日、除息日、每 10 份分红（元）、分红发放日。页面出现「暂无分红」表示该基金没有分配记录，收益留在净值里。

同一年可能分很多次（例如按月分红）。股息率与目标价按**最近一个完整年度**的合计，报告里写作「2025年」；当年还没过完时不计入年度合计，只在明细里按除息月份列出。分红趋势只比较两个完整年度。

## 失败与降级

- 东财接口频繁请求会被限流：脚本按 3 并发抓取，失败只记录在对应标的的「数据问题」里。
- 本机的 `web_fetch` 会报 `multiple usable web providers are registered`，`web_search` 走 OpenCode 网关时也可能拿不到结果。此时用 `node -e "fetch(...)"`、`curl.exe` 或 PowerShell 的 `Invoke-WebRequest` 直连接口。
- 行情接口失败：现价记为缺失，并在「数据问题」里带上接口的错误原因；不估算、不用成本价顶替。
- 分红接口失败：股息率留空，结论里写明「分红数据未取到」，不得凭记忆填数。
