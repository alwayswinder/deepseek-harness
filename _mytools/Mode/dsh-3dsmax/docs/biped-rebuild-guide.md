# Biped 重建指南（把 Biped 拟合到外来骨架）

> **适用**：目标角色 B 已有一套外来骨架（Dummy / Bone 均可），需要配一具**结构正确、比例贴合**的 Biped 作为动画师手柄；最终仍以 B 自己的骨架导出到引擎。
> **不适用**：B 没有骨架（先按[静态身体骨架指南](static-body-skeleton-guide.zh.md)准备）、或源 rig 与 B 的拓扑差异大到无法映射（先按[适配指南](character-adaptation-guide.md)§4 做配置适配）。
> 本文用 Seven 兼容配置（55 身体骨 / 71 对象）作为**样例**说明步骤，数量与名称都来自本轮 profile，不是固定值。阈值以 cm 表达，其他系统单位先换算。

---

## 0. 最终架构与职责

```
                  动画师的两条摆姿势入口
        +----------------------+----------------------+
        v                                             v
 新建 Biped（结构照源 rig、figure 照源 rig、        控制环（IK×N / 极向点 / 圆环 /
 逐骨拟合到 B 的骨架）                               参数线，从源 rig 迁移）
        |                                             |
        | 约束跟随（位置+方向，不挂父子）                | UE 骨位置 ← 环的位置
        v                                             | UE 骨旋转 ← 逐骨复制源结构
  BIPDRV_* ×N_body（B 骨原始静止处，跟随对应骨）       v
        +----> 只作"Biped 侧"的测量基准 ------->  B 的外来骨架
```

- **BIPDRV 是测量基准**：本文步骤 5 建。它给导出根提供真正的驱动，同时让"UE 骨 vs Biped 骨"的差分随时可量。
- **真正的驱动路径是控制环**：由[控制器迁移指南](controller-migration-guide.md)步骤 3–6 建立。
- 不要用"每根骨一个驱动点直接驱动"的老做法：那样动控制器不再驱动角色，旋转还会退化成双目标等权混合。

### 0.1 三级 profile（每轮先准备）

| 名称 | 内容 | 产出 |
|---|---|---|
| body profile | B 的骨名、父级、角色（root/spine/neck/clavicle/limb/finger/twist/toe）、世界静止矩阵 | `gRest_<角色>.txt` + 映射表 |
| biped profile | 源 rig 的 Biped 结构参数与根名 | 期望对象数 `N_biped` |
| rig profile | 源 rig 的控制层语义（链、环、极向点、辅助点、Expose、控制器树、wire） | 迁移阶段的唯一依据 |

三级 profile 都落盘，会话全局只作缓存。

---

## 1. 四条铁律

1. **拟合时 B 的骨架必须自由**：驱动层还没建，或约束全部断开。否则拟合目标会被"自己拖出来的位置"污染（自反馈），长度永远改不回来。
2. **一切 figure 编辑必须在 Figure Mode 打开时做**（`bipRoot.controller.figureMode = true`），否则 `saveFigFile` / `loadFigFile` / 局部缩放**静默无效或直接报错**。
3. **驱动点用约束跟随 Biped 骨，不挂 Biped 父子**（twist 可挂普通前臂驱动点）。Biped 骨带非均匀缩放，非均匀缩放父级下子物体的世界变换无法精确成立，实测漂移可达 1–2 单位；约束不继承缩放，所以精确。
4. **判据必须差分**：静止合格只是必要条件。所有"静止时恰好为 0"的错误（静态补偿、双目标平均、静止的上方向节点）都要靠姿势复测才能暴露——见[迁移指南](controller-migration-guide.md)§1。

---

## 2. 步骤

### 步骤 0 — 检查点

- 文件级备份：`Copy-Item B.max B_backup_before_biped_<日期>.max`
- 另存 `<角色>_preBiped_<日期>.max`（后续所有数据以它为准）
- 记录：当前帧、时间轴范围、fps、系统单位、选择状态、`dirty` 状态

### 步骤 1 — 读下 B 骨架的原始静止

```maxscript
-- bodyNames 从 body profile 载入，不从"场景里所有 Dummy"推导
if bodyNames == undefined do throw "先载入 body profile"
if bodyNames.count != N_body do throw "profile 与预期配置不符"
global gRest = for nm in bodyNames collect (
  local n = getNodeByName nm
  if n == undefined do throw ("缺骨: " + nm)
  #(nm, (if n.parent == undefined then "" else n.parent.name), n.transform)
)
```

同时把**名字、父级、3×3 旋转、世界位置**写到外部文件 `D:\AI\work\<角色>_<日期>/gRest_<角色>.txt`。每条至少包含：`name|parent|row1|row2|row3|worldpos`。

**开工前的输入检查**（不合格先修，不要带着问题往下走）：

| 检查项 | 判据 | 怎么查 |
|---|---|---|
| 骨架节点 | 与 profile 逐名、逐父级一致 | 名字全表比对；总数只是辅助 |
| 蒙皮名单 | 各网格 Skin 名单都属于 profile；并集符合角色绑定设计；无 Skin 单列"不适用" | `skinOps.GetNumberBones` / `GetBoneName` |
| 绑定姿势 | 静止时网格无变形 | 目视 + 关键坐标核对 |
| 干净 | 位置/旋转为自由 `Position_XYZ` / `Euler_XYZ`；无残留 Biped/IK/约束 | 控制器类与反向依赖 |
| 无重复名 | 场景内名字唯一（与源同名是允许的） | 名字全表去重；同名节点必须用引用而非名字操作 |

### 步骤 2 — 建 Biped + 结构照源 rig

```maxscript
-- 1) 图层：先查找再创建；创建后逐骨 addNode（不能只移根对象）
local L = LayerManager.getLayerFromName "BIP不导出"
if (L == undefined) do L = LayerManager.newLayerFromName "BIP不导出"
if (L == undefined) do throw "无法解析 BIP 图层"

-- 2) 创建最小骨架（参数不决定结构）
local b = biped.createNew 3 1 [0,0,0]
local c = b.controller

-- 3) 结构：在 Figure Mode 内逐项赋值，值来自 biped profile
c.figureMode = true
c.spineLinks = <源> ; c.neckLinks = <源> ; c.legLinks = <源>
c.fingers = <源> ; c.fingerLinks = <源>
c.toes = <源> ; c.toeLinks = <源>
c.forearmTwistLinks = <源> ; c.upperarmTwistLinks = <源>
c.thighTwistLinks = <源> ; c.calfTwistLinks = <源>
c.ponytail1Links = <源> ; c.ponytail2Links = <源> ; c.tailLinks = <源>

-- 4) 改名到本轮根名（Bip001* → bip001*）
for o in objects where (matchpattern o.name pattern:"Bip001*") do
  o.name = "bip" + (substring o.name 4 (o.name.count - 3))

-- 5) 逐骨移层
for o in objects where (matchpattern o.name pattern:"bip001*") do L.addNode o
c.figureMode = false
completeRedraw()
```

**对象数自检**（结构参数决定，不是固定 71）：

```
N_biped = 2(root + Footsteps) + (spineLinks + 1) + 3(Neck/Head/HeadNub)
        + sides × (8 + fingers×fingerLinks + fingers + toeLinks + forearmTwistLinks)
```

样例：`2 + 4 + 3 + 2×(8+15+5+1+2) = 71`（58 骨 + 13 nub）。读回的实际对象数、每类骨的数量必须同时对上；对不上先查结构属性是否真的写入（`getProperty` 读回），不要重复 `createNew` 掩盖。

> ⚠ `createNew` 的 3 个参数**不决定结构**（默认值与源常不同）；真正生效的是随后那组属性赋值。
> ⚠ 图层必须先查后建；同名层已存在时 `newLayerFromName` 可能返回 `undefined`。
> ⚠ Biped 的骨是独立对象，`manage_layers` 的 `pattern` 只匹配根对象，必须逐骨 `layer.addNode`。

### 步骤 3 — 载入参考 figure

```maxscript
-- 源窗口：导出（必须 Figure Mode 内）
local r2 = getNodeByName "<源根名>"
local wasFigure = r2.controller.figureMode
r2.controller.figureMode = true
try ( biped.saveFigFile r2.controller "<路径>/ref_figure.fig" )
catch ( r2.controller.figureMode = wasFigure; throw() )
r2.controller.figureMode = wasFigure

-- 目标窗口：装载（必须 Figure Mode 内）
c.figureMode = true
biped.loadFigFile c "<路径>/ref_figure.fig"
c.figureMode = false
completeRedraw()
```

**装载后、体型调整前**，逐骨比较源与目标的 `biped.getTransform <骨> #scale` 并记录最大差（样例 58 骨最大差 4.96e-5，属浮点级；不同角色可能更大，要记录而不是假设为 0）。

> 先装 figure 的原因：Biped 的骨粗细与髋宽来自 figure 数据，不是节点缩放。用最小 figure 直接拟合会得到"长度对、粗细如发丝、髋附着点≈0"的骨架。

### 步骤 4 — 髋宽、骨轴分类与拟合

#### 4.1 髋宽（每次换角色都要重测）

1. 从静止表取双侧髋关节间距 `hipSpan_T` 与其中点。
2. 记录当前 Biped 的间距（对应两骨 `#pos` 距离）。
3. **探测骨盆的宽度轴**：在 Figure Mode 内分别对骨盆三个局部轴施加同一比例（如 0.99），每次 `completeRedraw()` 后读髋间距，只有沿宽度轴的缩放会改变间距。
4. 按 `hipSpan_T / hipSpan_now` 缩放该轴，再重新定位骨盆中心并逐侧核对大腿起点。

> 不要假设宽度轴是 X/Y/Z；样例 rig 是局部 Z，另一角色可能是别的轴，个别角色还可能出现左右髋高度/深度不对称——此时单一比例不可解，需在适配记录里声明。

#### 4.2 骨轴分类（决定能走哪条分支）

用"肩肘腕、髋膝踝"构造共同弯曲平面，检查"对齐前臂是否又让上臂偏转、对齐小腿是否又让大腿偏转"。

| 结论 | 后续 |
|---|---|
| 同轴相容 | 按 4.3 逐骨拟合，继续本文与迁移指南 |
| 相邻关节完整骨轴不相容 | 只能做整链目标 + 冻结旋转偏移的映射参考层；**到映射验证为止**，不进入普通双树复制 |
| 骨数/层级/手指配置不同 | 先按适配指南 §4 做配置适配 |

#### 4.3 逐骨拟合（同轴分支）

> 下面只是**算法骨架**：`pairs`（每骨的 Biped 节点、子关节、`posOK` 标记）、`restOf`（落盘静止表查询）、`restPelvis` / `restThighL/R` 都由本轮 profile 提供，不能整段直接运行。

```maxscript
c.figureMode = true
-- ① 整体定位：根放到双髋中点，朝向取目标骨盆
biped.setTransform c.rootNode #pos ((restThighL.pos + restThighR.pos) * 0.5) false
biped.setTransform c.rootNode #rotation restPelvis.rotation false
completeRedraw()
for i = 1 to 3 do (   -- ② 骨盆中心修正（骨盆本身不能 move，只能移根）
  local diff = restPelvis.pos - bipPelvis.transform.pos
  biped.setTransform c.rootNode #pos (c.rootNode.transform.pos + diff) false
  completeRedraw()
)
for round = 1 to 3 do (
  for pr in pairs where pr.childB != undefined do (      -- ③ 段长：局部 X 缩放
    coordsys local ( scale pr.bone [ ratio, 1, 1 ] )
  )
  completeRedraw()
  for pr in pairs do (                                    -- ④ 朝向：绝对写入
    biped.setTransform pr.bone #rotation (restOf pr[1]).rotation false
  )
  completeRedraw()
  for pr in pairs where pr.posOK do (                     -- ⑤ 位置：只对可设位置的骨
    biped.setTransform pr.bone #pos (restOf pr[1]).pos false
  )
  completeRedraw()
)
c.figureMode = false
completeRedraw()
```

要点（与旧版不同的地方）：

- **`#rotation` 是绝对写入**：一次调用即为目标世界朝向，本轮实测 52 骨残差 0.0152°。不动点循环只影响收敛速度，不是正确性前提；不要把它当成"必须迭代 8 次否则假收敛"。
- **骨盆要单独写旋转**：只写根骨 `#rotation` 时，骨盆仍带约 120° 的内置偏置（本轮实测），把 pelvis 放进 `pairs` 一起写即为 0。
- **`#pos` 只对部分骨有效**：脊柱链、颈、头、锁骨、手指、脚趾可设；上臂/前臂/手/大腿/小腿/脚不可（`#pos` 被忽略）。**新结构先做单骨试探**：设 `#pos` 后 `completeRedraw` 读回，看是否移动，再决定 `posOK` 集合，不要照搬旧名单。
- **段长 = 子关节距离**：长度轴实测（见迁移指南步骤 6），不要假设局部 +X；`coordsys local (scale …)` 只改长度、不改粗细。
- **锁骨只有 2 个自由度**：判定锁骨用"骨指向夹角"，不要拿完整世界旋转当目标。

**读数协议**：写入后 `completeRedraw()`；下结论前 `figureMode = false` + `completeRedraw()` + **同一次调用内连读两次**确认稳定；再用"骨指向夹角"做纯几何交叉验证。本版本实测写后即生效、同调用读值稳定，但不同版本/大场景存在惰性求值，协议照做。

### 步骤 5 — 建测量基准驱动点

给每根 B 骨建一个跟随对应 Biped 骨的 Point：

```maxscript
local restTM = <该骨原始世界变换>
local p = Point name:("BIPDRV_" + d.name) pos:restTM.pos size:2.0
p.transform = restTM
p.isHidden = true
local ppc = Position_Constraint() ; local poc = Orientation_Constraint()
p.pos.controller = ppc ; p.rotation.controller = poc
ppc.appendTarget bone 100.0 ; poc.appendTarget bone 100.0
ppc.relative = false ; poc.relative = false   -- 吸附，不继承缩放
```

**两类例外**：

| 例外 | 做法 | 依据 |
|---|---|---|
| 导出根（`Root` 等） | 驱动点先摆原始静止、**不挂父子**，再以 `relative=true` 跟随 Biped 根；导出根本身再由位置+方向约束跟随该驱动点 | 直接吸附会把导出根拉到骨盆高度（样例偏 90.8） |
| twist 骨 | 驱动点挂到对应前臂驱动点下（普通 Point，scale=1）；twist 骨自身的驱动结构按源 rig 原样复制 | 源 rig 的 ForeTwist 与 twist 骨位置不同（样例差 10.33）；改成裸 `Orientation → BIPDRV` 会让前臂扭转卡住 |

**门槛**：普通驱动点相对对应 Biped 骨 ≤0.05 / ≤0.1°；建完驱动层后 `N_body` 根骨相对原始静止位移 ≤1e-3（样例 0.0）；动一次 Biped 骨（脚/手/根）后再量，误差不增长。

### 步骤 6 — 显示与层

```maxscript
-- boxMode 按源 rig 同职责节点清单对齐（样例：根、Footsteps、全部 nub 关闭，其余开启 → 56/71）
for o in objects where (matchpattern o.name pattern:"bip001*") do (
  local isNub = (o.name.count > 3 and (substring o.name (o.name.count - 2) 3) == "Nub")
  o.boxMode = not (o.name == "bip001" or o.name == "bip001 Footsteps" or isNub)
)
```

- 两窗口视口统一 `Front / Standard / Edged Faces`。
- 只显示 BIP 时：BIP 图层可见，网格与骨架层隐藏；**父层隐藏会连带隐藏子层**，要保留整条祖先链可见，只隐藏旁支。
- 图层自身勾选位不等于实际可见：判定"看不看得见"要用合并后的可见状态（或直接数 `not o.isHidden` 的对象数）。
- 图层的显示态存在文件里，重开会回到保存时状态。

---

## 3. 验收（阶段 0–3）

| 项目 | 门槛 | 本轮样例 |
|---|---|---|
| 结构 | 与源 rig 逐项一致 | `3/1/3/5×3/1×1/twist2` ✓ |
| 对象数 | = 本节公式 | 71 ✓ |
| 位置残差 | ≤0.05 | **0.00042** ✓ |
| 朝向残差 | ≤0.1° | **0.0152°** ✓ |
| 段长 | 与静止表一致 | 19.7845 / 20.6696 / 35.3003 / 45.3889 ✓ |
| 髋宽 | 逐侧核对 | 8.1751 / 8.1751（目标 8.1751）✓ |
| 几何方向交叉验证 | 与朝向指标同量级 | 最大 0.0025° ✓ |
| 驱动点静止偏差 | ≤0.05 / ≤0.1° | 8.5e-6 / 1.1e-5° ✓ |
| 驱动点刚性 | 姿势变化后不增长 | 同量级 ✓ |
| 显示 | 与源清单一致 | `boxMode` 56/71 ✓ |
| 控制环差分 | 见迁移指南 §10、§12 | **动态验收未通过**（见迁移指南） |

> 本表只覆盖"建 Biped + 测量基准"。控制环落地后的差分验收才是最终判据。

---

## 4. 陷阱速查

| 症状 | 原因 | 修法 |
|---|---|---|
| 拟合怎么调都不动/越调越乱 | 骨架已被约束或控制器接管，读了被拉偏的当前值 | 从 preBiped 快照重来，以落盘静止表为目标 |
| 骨长改不回来（停在其他角色的值） | 载入 figure 后没在 Figure Mode 内缩放；或自反馈 | 确认 `figureMode = true`；确认骨架自由 |
| 骨长对、粗细如发丝 / 头是个点 | 用最小 figure 直接拟合 | 先 `loadFigFile` 装源 figure 再拟合 |
| 双腿起点整体内移 | 最小 figure 髋宽过小，或源 figure 与目标体型不同 | 装源 figure 后**仍须单独拟合髋宽**并逐侧检查 |
| 上半身整体漂移几百单位 | 对骨盆做了整体缩放 | 只按已验证的宽度轴缩放骨盆，然后重定位并复测 |
| 逐骨 `move` 无效 / 链被拉坏 | Biped figure 是连通链，`move` 对多数骨被忽略 | 用"长度 + 朝向"设父子关系，不要绝对摆位 |
| `#scale` 报 ok 但值不变 | 多数骨上 `#scale` 被忽略，或不在 Figure Mode | 用 `coordsys local (scale o [k,1,1])`，且在 Figure Mode 内 |
| `saveFigFile` 报 `Cannot run the operation in this mode` | Figure Mode 没开 | 先 `figureMode = true`，异常路径也要恢复原状态 |
| 驱动点/骨偏 1–2 单位 | 驱动点挂在非均匀缩放的 Biped 骨下 | 改约束跟随（`relative=false`），不挂父子 |
| 导出根偏几十单位 / 朝向差约 0.7° | 驱动点直接吸附到 Biped 根 | 驱动点先摆静止、不挂父子、以 `relative=true` 跟随 |
| twist 骨偏约 10 单位 | 源 ForeTwist 与 twist 骨位置不同 | 驱动点挂到对应前臂驱动点下 |
| 骨盆朝向差约 120° | 只写了根骨旋转 | 把 pelvis 本身加入旋转写入集 |
| 一边画盒子、一边画骨骼 | `boxMode` 不一致 | 按本轮源清单对齐 |
| 隐藏某层后目标层也不见了 | 隐藏了父层 | 保留目标层整条祖先链可见 |
| 改动后立刻读值拿到旧数据 | 惰性求值 | 写后 `completeRedraw()`；判定前退出 Figure Mode，同调用连读两次 |
| 三角函数算角度不对 | MAXScript 的 `sin/cos/acos` 默认**角度制** | 按度使用 |
| `quat`/`matrix3` 旋转写法报类型错 | `quat <角度> <轴>` 与 `matrix3 * Point3` 在本版本不可用 | 用 Rodrigues 公式自算，或先转成矩阵再逐分量构造 |
| 数 `classof o == Dummy` 得到 68 而不是 `N_body` | Biped 的 13 个 nub 也是 Dummy | 只在建 Biped 之前数，或按 profile 名字表筛 |
| 按名字比较出现十几单位的假差异 | 场景内有同名对象（源文件自带） | 逐节点比对必须用**引用快照**，同名节点按引用比较 |
| 锁骨怎么解都差十几到几十度 | 锁骨只有 2 个自由度，没有 setter | 用方向指标判定；必要时不动点 + 实测雅可比，并把锁骨放最后解 |

---

## 5. 关键 API 速查

| 用途 | 写法 | 备注 |
|---|---|---|
| 建骨架 | `biped.createNew 3 1 [0,0,0]` | 3 个参数不决定结构 |
| 进/出形体模式 | `bipRoot.controller.figureMode = true/false` | 所有 figure 编辑的前提 |
| 根骨节点 | `bipRoot.controller.rootNode` | 定位整个 figure |
| 设变换 | `biped.setTransform <骨> #pos\|#rotation\|#scale <值> <bool>` | 第 1 参数是**骨节点**；`#rotation` 为绝对世界朝向；第 4 个布尔取 `false` |
| 读变换 | `biped.getTransform <骨> #pos\|#scale\|#rotation` | 受惰性求值影响，必要时二次读 |
| 枚举骨 | `biped.getNode <root> <index>`、`biped.getNode <root> <fingerIndex> link:<i>` | 手指按 link 取 |
| figure 存取 | `biped.saveFigFile <ctrl> <path>` / `biped.loadFigFile <ctrl> <path>` | 必须 Figure Mode 内 |
| 改骨长 | `coordsys local ( scale <骨> [ratio,1,1] )` | Figure Mode 内；不改粗细 |
| 约束 | `Position_Constraint()` / `Orientation_Constraint()` + `appendTarget <node> <w>`、`.relative` | 普通驱动点 `relative=false`；根驱动点先摆静止再 `relative=true` |
| 复制控制器树 | `d.rotation.controller = copy src.rotation.controller` | 目标节点、权重、`pickUpNode` 一并保留 |
| 强制求值 | `completeRedraw()` | 写后读值前 |
| 锁骨值（只读） | `biped.getClavicleVals <锁骨>` | 没有 setter |
| 层操作 | `LayerManager.getLayerFromName "<层>"`、`.addNode`、`.isHidden` | `setCurrent()` 在 Max 2026 不存在 |
| Biped 父节点 | `biped.getRotParentNode <骨>` / `getPosParentNode <骨>` | 与场景 `.parent` 可能不同 |
| 姿态复制 | `biped.copyPosture` / `pastePosture` | 整体对齐的备选路线 |

**Biped 结构参数**（在 `bipRoot.controller` 上）：`spineLinks / neckLinks / legLinks / fingers / fingerLinks / toes / toeLinks / upperarmTwistLinks / forearmTwistLinks / thighTwistLinks / calfTwistLinks / ponytail1Links / ponytail2Links / tailLinks`。

---

## 6. 里程碑

每阶段另存 `<角色>_<阶段>_<日期>.max`，阶段顺序见[操作清单](quick-runbook.md)。本轮（Seven → Stan，2026-10-19）的里程碑与数值只作样例：

| 文件 | 内容 |
|---|---|
| `<角色>_preBiped_<日期>.max` | 建 Biped 之前的干净快照（静止真值来源） |
| `<角色>_biped_<日期>.max` | 建好 Biped（未拟合） |
| `<角色>_fitted_<日期>.max` | 装源 figure + 拟合完成 |
| `<角色>_driver_<日期>.max` | BIPDRV 测量层 |
| `<角色>_merged_<日期>.max` | 合并与名字隔离 |
| `<角色>_chains_<日期>.max` | 双树复制、重指、链静止几何、偏移与极向点对齐 |
| `<角色>_final_<日期>.max` | 显示状态与保存重开验证 |

交接到控制器迁移前确认：本轮为同轴相容分支，且拟合与驱动层实测通过。
