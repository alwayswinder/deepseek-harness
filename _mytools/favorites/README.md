# 网站导航（个人网站库）

桌宠右键菜单 → **常用网站** → **网站导航**，用系统浏览器打开一个本地页面，按文件夹列出全部网站。
页面是**生成物**，唯一的事实来源是同一目录下的 `bookmarks.yml`。

```
bookmarks.yml        网站库（进 git，跨机同步）
assets/<id>.png      图标（进 git）
library.mjs          读写与解析规则（导入、生成、测试共用）
import.mjs           一次性：浏览器导出的书签 HTML → bookmarks.yml
markdown.mjs         notes 的 Markdown 渲染（先转义再套规则）
build-page.mjs       生成 dist/index.html
dist/index.html      展示页（生成物，不进 git）
tests/               node --test 跑的用例
```

## 日常怎么用

```sh
# 1. 从浏览器导出的书签 HTML 导入（重跑安全：已有条目不动，只补新增）
node _mytools/favorites/import.mjs                 # 默认取 _mytools/Note/favorites_*.html 里最新那份
node _mytools/favorites/import.mjs D:\导出.html     # 或指定文件
node _mytools/favorites/import.mjs --dry           # 只看会做什么，不写文件

# 2. 生成展示页（DSH 开着时宿主会自己重建，手动跑也可以）
node _mytools/favorites/build-page.mjs

# 3. 测试
cd _mytools/favorites && node --test
```

DSH 运行时，宿主在每次状态采样里比较 `bookmarks.yml` 与 `dist/index.html` 的修改时间，库更新了
就自动重建；桌宠点「网站导航」时打开的总是最新那份。**改完记得 commit + push**，另一台
`git pull` 下来就是新的（页面会在那台机器上重新生成）。

## 数据格式

```yaml
version: 1
bookmarks:
  - id: 6f3a1c2b9d40              # 规范化 URL 的 sha1 前 12 位，分配后不再变
    url: https://www.bilibili.com/
    title: b站
    group: Unreal/Study            # 你自己那套：导出文件里的文件夹路径，斜杠分层
    notes: |
      素材站，**收藏向**
    autoTags: [Unreal, 素材]        # 机器那套：模型给的自由词标签，1–3 个
    icon: assets/6f3a1c2b9d40.png
    pinned: false
    addedAt: 2026-10-15T10:55:19+08:00
    updatedAt: 2026-10-15T10:55:19+08:00
```

**两套分类**：`group` 是你管的（浏览器导出的文件夹，只有人会改）；`autoTags` 是模型给的标签，
用来横向筛选。重跑分析时**只补没有标签的条目**，不覆盖已有的（要整份重刷得显式说明），因为换个
模型或换个时间，分词就会不一样。

- **`id` 是关键**：跨机合并靠它对不对得上。改标题、换分组、搬目录都不要动它；改 `url` 也一样
  （备注和图标跟着 id 走）。新建条目按 URL 派生 id，撞上了就说明这条已经在库里。
- 可空字段（`notes`/`autoTags`/`icon`/`pinned`/`updatedAt`）没有值就省略，文件里一条一个块，diff 干净。
- `title` 和文件夹名在导入时会清掉**看不见的字符**（零宽空格/连接符、双向控制符、BOM 等）并折叠空白：
  从飞书文档复制的标题前面可能挂着几十个，页面上显示成一段空白、搜索也搜不到。
- `group` 为空的条目在页面上归到「未分组」（直接放在浏览器工具栏下的条目就是这种）。
- 浏览器自己那层容器目录（中文界面的「收藏夹栏」、英文的 `Bookmarks bar`）不进 `group`：每个路径都带一遍它没有信息量。规则在 `library.mjs` 的 `CONTAINER_FOLDERS` 里，导入和以后的编辑器共用。
- 文件末尾由脚本按固定格式重写（块序列、`lineWidth: 0`），所以手改之后最好再跑一次
  `build-page.mjs` 让页面跟上；`git` 的合并冲突按条目手解即可。

## 展示页

自包含单文件、零外部请求、零依赖：图标内联成 data URI，`notes` 在生成时渲染成 HTML。带搜索
（标题/网址/备注/标签/分组）、分组筛选、分组折叠、置顶区、深浅色跟随系统。顶部那行筛选**只有
你那一套**（文件夹）；AI 标签出现在**每条卡片上**（虚线边框，表明是机器给的），搜索框也能搜到，
但不占筛选行——两套分类不抢同一个控件。页面**只读**。

已知限制：

- 编辑（增删改、备注、标签、置顶）还没做，目前改数据要手改 `bookmarks.yml`。
- 置顶条目在「置顶」区和它自己的分组里各出现一次。
- 导出文件里的空文件夹不会出现在页面上（数据里没有"组"这个实体）。
- 图标是导出那一刻的快照，站点换了 favicon 不会自动更新。
- Markdown 只支持一层列表嵌套；段落里单个换行就是换行（与严格 Markdown 不同）。
- 页面里的备注链接只放行 http/https。

## 为什么这么设计

- **数据在仓库里，同步就是 `git pull`**：不需要额外的同步步骤，合并粒度是行级的，冲突 git 自己会标出来。
- **数据与页面分开**：页面随时可以从库里重建，坏了就删掉重生成。
- **导入永不破坏已有数据**：备注、标签、图标是手写的，比导出文件可信。
