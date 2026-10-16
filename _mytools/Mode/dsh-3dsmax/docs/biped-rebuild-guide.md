# Biped 重建指南（把 Biped 拟合到外来骨架）

> **适用场景**：目标角色 B 只有一套外来骨架（如 UE 的 55 根 Dummy：`Root / pelvis / spine_01…03 / neck_01 / head` + 每侧 `clavicle / upperarm / lowerarm / hand / 15 根手指 / lowerarm_twist_01 / thigh / calf / foot / ball`），需要为它配一具 **结构正确、比例贴合** 的 Biped，供动画师用手柄（圆环 / IK / 极向点）摆姿势，最终仍以 **B 自己的骨架** 导出到引擎。
>
> 本文所有数字与结论都来自 Seven → Stan 的实测（3ds Max 2026 + MCP 桥），不是推断。Seven = 已有完整 Biped + 控制器层的参考角色；Stan = 只有 UE 骨架的目标角色。
> **2026-10-16 修订**：按 [quick-runbook.md](quick-runbook.md) 从头复现全流程后，修正了本指南的 6 处错误/缺失（`.setCurrent()` 不存在、`createNew` 参数不决定结构、驱动层 `Root` 例外应改 `relative=true`、辅助链"静止几何"要重拟、位置侧必须一起复制、显示态的父层与自身勾选位陷阱）。逐条证据与原因见 [../work/WFTest_guide-findings.md](../work/WFTest_guide-findings.md)。

---

## 0. 最终架构（两个阶段）

```
                      动画师的两条摆姿势入口
            +------------------+---------------------+
            v                                        v
   新建 Biped（结构照参考 rig、figure 照参考     控制环（IK x4 / 极向点 / 圆环 /
   角色，逐骨拟合到 B 的外来骨架）              参数线，从参考 rig 迁移过来）
            |                                        |
            | 跟随（位置+方向约束，不挂父子）          | UE 骨位置 <- 环的位置
            v                                        | UE 骨旋转 <- 逐骨复制源结构
   BIPDRV_* x55（放在 B 骨原始静止处，跟随对应骨）    v
            +----> 只作“Biped 侧”的测量基准 ---->  B 的外来骨架（55 骨 = 蒙皮骨 = 交付骨架）
```

- **驱动点（`BIPDRV_*`）= 测量基准**：本文步骤 5 建。作用两层——① `BIPDRV_Root` 真正驱动 UE 根 `Root`；② 其余 54 个跟随对应 Biped 骨，用来随时量“UE 骨 vs Biped 骨”，也就是**差分验收的基准**。
- **真正的驱动路径是控制环**：由[控制器迁移指南](controller-migration-guide.md) §2 步骤 5 建立（UE 骨位置 = 环的位置；UE 骨旋转 = 逐骨复制参考 rig 的 `rotation_list`）。
- **不要**用“每根骨一个驱动点直接驱动”的旧做法：那样动控制器不再驱动角色，而且旋转会退化成“两个目标等权混合”，一摆姿势就差 15–30°（见 §4 陷阱表末两行与控制器指南 §1.3）。

### 0.1 三份文档的分工

| 文档 | 负责什么 | 起点 → 终点 |
|---|---|---|
| **本文** | 建 Biped、拟合比例、建测量基准驱动点、显示与图层 | 只有骨架的干净快照 → 骨架自由、Biped 拟合达标 |
| [controller-migration-guide.md](controller-migration-guide.md) | 控制环落地：链段长、极向点、逐骨旋转结构、引用重指、差分验收 | 上一步成果 + 参考 rig → 动 Biped / 动控制器都能精确驱动角色 |
| [stan-biped-controller-migration-task.md](stan-biped-controller-migration-task.md) | 本案例流水账（取证数字、失败尝试、决策） | 个案记录，**规范以两份指南为准** |
| [README.md](README.md) | 全流程索引 + 端到端自检清单 | 开工前先看这份 |

---

## 1. 三条铁律（违反必踩坑）

1. **拟合时，B 的骨架必须是"自由"的** —— 即驱动层还没建，或约束全部断开。
   否则：B 的骨被旧约束拖着走 → 拟合的"目标点"变成它自己拖出来的位置 → **自反馈**，长度永远改不回来（实测：载入参考 figure 后重跑拟合，肢体长度停在参考角色的 `18.57/23.33`，怎么调都不动）。

2. **一切 figure 编辑必须在 Figure Mode 打开时做**（`bipRoot.transform.controller.figureMode = true`）。
   否则 `biped.saveFigFile` / `biped.loadFigFile` / 局部缩放**静默无效**或直接报 `Cannot run the operation in this mode`。

3. **驱动点用约束跟随 Biped 骨，绝不要挂父子**。
   Biped 骨带**非均匀缩放**（参考 figure 实测：骨盆 `[25.53, 31.98, 16.43]`、上臂 `[18.34, 37.77, 48.78]`），非均匀缩放的父级下，子物体的世界变换无法精确成立 → 实测驱动点漂移 **1.2–2.0 单位**（漂移量与该骨各轴缩放差成正比：骨盆 1.208、头 1.974）。
   约束（Position/Orientation）**不继承缩放**，所以精确。

---

## 2. 步骤

### 步骤 0 —— 建检查点

```
manage_scene action="hold"          # 或存里程碑文件
```
> `manage_scene action="fetch"` 会弹 "About to Fetch. OK?" 对话框，需要用 `max_dialogs` 回答 Yes。

### 步骤 1 —— 从"建 Biped 之前"的快照开始，并**读下 B 骨架的原始静止**

- 打开 B 的**干净快照**（还没有 Biped、骨架没被任何约束碰过）。
- 记下 55 根骨的世界变换（这是后面驱动点与验收的唯一真值）：

```maxscript
-- 在干净快照里跑，把 55 根骨的真实静止存进全局，供后续步骤使用
global gRest = #()
for o in objects where ((classof o) == Dummy) do append gRest #(o.name, o.transform)
gRest.count      -- 期望 55
```

- 同时记录关键坐标（用于随时自检），例如：
  `pelvis=[-1.89584,-0.912949,90.8135]`、`head=[-1.89583,-0.486377,148.399]`、`upperarm_l=[10.1092,2.46433,129.87]`。

> 为什么必须在**这时**读：驱动层一旦建立，UE 骨的原始 `Position_XYZ` 控制器会被约束控制器**替换**，原始值就永久丢失了（实测再次确认）。

**开工前先确认输入合格（只有骨架的新角色）**——不合格就先修，不要带着问题往下做：

| 检查项 | 合格判据（本案例） | 怎么查 |
|---|---|---|
| 骨架节点 | 55 个 `Dummy`，命名是 UE 规范（`Root / pelvis / spine_01…03 / neck_01 / head`、每侧 `clavicle/upperarm/lowerarm/hand/lowerarm_twist_01 + 15 根手指 + thigh/calf/foot/ball`） | `for o in objects where (classOf o == Dummy) do …`（期望 55） |
| 蒙皮绑定名单 | 角色网格的 `Skin` 骨骼名单与这 55 个名字**逐一对上**（数量也要对） | `skinOps.GetNumberBones` / `skinOps.GetBoneName` |
| 绑定姿势 | 骨架处于**绑定姿势**：静止时网格**无变形**（对比"没有任何控制器时"的外观）。若骨架被摆过，先复位再往下做 | 目视 + 关键坐标核对 |
| 骨架"干净" | 没有任何约束/控制器引用这些骨（`refs.dependents <骨>` 只应看到 `Skin`） | 反查依赖 |
| 无重复名 | 55 个名字唯一，且不与参考 rig 的角色重名（重名会让合并后的约束指错对象） | 名字全表去重 |
| 干净快照 | 该状态已**另存**为一个"建 Biped 之前"的文件（本文全部数据以它为准） | 见 §6 里程碑命名 |

> 蒙皮绑定名单不对（名字/数量不符）时，后面每一步都会"骨头对、网格不对"，必须先解决。

### 步骤 2 —— 建 Biped + 结构照参考 rig

```maxscript
-- ⚠ Max 2026 的 LayerProperties **没有 .setCurrent()**（旧文写法会报 Unknown property）：
-- 建完图层不必"设为当前层"；创建后逐骨 addNode 移层即可
local L = LayerManager.getLayerFromName "BIP不导出"
if (L == undefined) do L = LayerManager.newLayerFromName "BIP不导出"
local b = biped.createNew 3 1 [0,0,0]        -- 3 个参数：最小骨架
local c = b.controller
c.figureMode = true
c.spineLinks = 3 ; c.neckLinks = 1 ; c.legLinks = 3
c.fingers = 5 ; c.fingerLinks = 3
c.toes = 1 ; c.toeLinks = 1 ; c.forearmTwistLinks = 2
c.upperarmTwistLinks = 0 ; c.thighTwistLinks = 0 ; c.calfTwistLinks = 0
-- 改名：Bip001* → bip001*（与参考 rig / 控制器引用一致）
for o in objects where (matchpattern o.name pattern:"Bip001*") do
  o.name = "bip" + (substring o.name 4 (o.name.count - 3))
-- 移层：Biped 的骨是独立对象，pattern 移层只匹配根对象 ⇒ 必须逐骨 addNode
for o in objects where (matchpattern o.name pattern:"bip001*") do ( try ( L.addNode o ) catch () )
c.figureMode = false
```

**验证**：`matchpattern "bip001*"` 的对象数 = **71**（58 骨 + 13 nub），结构读回 `3 x 5 x 3`。

> 结构参数（`spineLinks/neckLinks/legLinks/fingers/fingerLinks/toes/toeLinks/forearmTwistLinks` 等）在 **Biped 控制器**上，必须与参考 rig 完全一致，否则控制器层的节点引用对不上。
> ⚠ `biped.createNew 3 1 [0,0,0]` 的 3 个参数**不决定结构**（2026-10-16 实测默认 `spineLinks=4`）；真正生效的是紧随其后的 8 个结构属性赋值。
> ⚠ 建完必须**逐骨 `layer.addNode` 移层**：`manage_layers add_objects` 的 `pattern` 只匹配根对象，而 Biped 的骨是独立对象（实测 71 个一次移完）。

### 步骤 3 —— 载入参考 figure（一次解决粗细与髋宽）

```maxscript
-- 在参考 rig 的实例里（有正确 figure 的那个角色）
local r2 = getNodeByName "bip001"
r2.controller.figureMode = false
try ( biped.saveFigFile r2.controller "E:/.../ref_figure.fig" ) catch ()   -- 若报 Cannot run…，就是 Figure Mode 没开，见下面
-- 正确的做法：必须在 Figure Mode 内
r2.controller.figureMode = true
biped.saveFigFile r2.controller "E:/.../ref_figure.fig"
r2.controller.figureMode = false

-- 回到目标场景，装进新建的 Biped
c.figureMode = true
biped.loadFigFile c "E:/.../ref_figure.fig"
c.figureMode = false
```

**验证**：`biped.getTransform <骨> #scale` 与参考 rig 同名骨**逐位一致**，例如
`bip001 L UpperArm=[18.3378,37.7742,48.775]`、`bip001 Head=[22.1781,22.152,30.1836]`。

> 为什么先装 figure：Biped 的骨**粗细/髋宽**取自 figure 数据，不是取自节点缩放。
> 用 `createNew` 的最小 figure 直接拟合，会得到"长度对、粗细如发丝、髋附着点≈0"的骨架（实测：腿骨整体内移 7.7 单位，蒙皮跟着变形）。
> 换成参考 figure 后，**髋宽残差 7.77 → 0.04**，粗细也一次到位。

### 步骤 4 —— 逐骨拟合（3 轮：长度 → 朝向 → 位置）

**映射表**：Biped 的 52 根骨与 UE 的 52 根 **1:1** 对上（另有 `lowerarm_twist_01_l/r` 与 `Root` 走步骤 5 的例外，52+2+1=**55**）：`Pelvis↔pelvis`、`Spine/Spine1/Spine2↔spine_01/02/03`、`Neck↔neck_01`、`Head↔head`；每侧 `Clavicle/UpperArm/Forearm/Hand↔clavicle/upperarm/lowerarm/hand`、`Finger0/01/02↔thumb_01/02/03`、`Finger1*↔index_*`、`Finger2*↔middle_*`、`Finger3*↔ring_*`、`Finger4*↔pinky_*`、`Thigh/Calf/Foot/Toe0↔thigh/calf/foot/ball`。

**可设置位置（posOK）的骨**：脊柱链、颈、头、锁骨、手指、脚趾。
**不可设置位置**的骨：上臂 / 前臂 / 手 / 大腿 / 小腿 / 脚（`#pos` 对它们完全无效，实测 8 次迭代恒为同一偏差）——它们的关节位置由父骨的"长度 + 朝向"决定。

```maxscript
c.figureMode = true
-- ① 整体定位：根骨放到 B 两侧大腿中点，朝向取 B 的骨盆
biped.setTransform c.rootNode #pos ((thighL.pos + thighR.pos) * 0.5) false
biped.setTransform c.rootNode #rotation (B_pelvis.rotation) false

for round = 1 to 3 do (
  -- ② 长度：局部 X 缩放（局部 X 就是骨长轴）
  for pr in pairs where pr.childB != undefined do
    coordsys local ( scale pr.bone [ (|tgtChild−tgt| / |curB−curChild|), 1, 1 ] )

  -- ③ 朝向：不动点求解（5 步内收敛到 <0.05°）
  for pr in pairs do (
    local q = target.rotation
    for i = 1 to 8 do (
      biped.setTransform pr.bone #rotation q false
      local e = target.rotation * (inverse pr.bone.transform.rotation)
      if ((2 * (acos (abs e.w))) < 0.05) do exit
      q = e * q
    )
  )

  -- ④ 位置：只对 posOK 的骨，同样用不动点
  for pr in pairs where pr.posOK do (
    local p = target.pos
    for i = 1 to 8 do (
      biped.setTransform pr.bone #pos p false
      local e = target.pos - pr.bone.transform.pos
      if ((length e) < 1e-3) do exit
      p = p + e
    )
  )
)
c.figureMode = false
```

**实测结果（对自由的 Stan 骨架）**

| 指标 | 结果 |
|---|---|
| 最大位置误差 | **0.04**（`thigh_r`），超 1.0 的骨 **0/52** |
| 最大朝向误差 | **0.056°** |
| 四条肢长 | `19.7845 / 20.6696 / 35.3003 / 45.3889`（与 B 精确一致；旧文写 `45.3890`，末位差属取整） |

> ⚠ **读数协议（2026-10-16 两轮实测修正；旧文"`redrawViews()` + 二次读值"不足）**
> - **写入循环内**：每次 `biped.setTransform` 之后用 **`completeRedraw()`**。`redrawViews()` 在同一调用内会让多次读值反复返回同一个旧数（实测冻结在 `115.971`），不动点循环因此**假收敛**（首轮就 exit）。
> - **下任何结论之前**：`figureMode = false` + `completeRedraw()`，**在同一次调用里**读值，并连读两次确认稳定。
>   实测同一场景三种读法：调用内 = 假阳性 `0.0398`；新调用不刷新 = 假阴性 `6.96 / 10.68°`；**同调用内退出 figure 模式再读** = 真值 `0.0399 / 0.056°`。
> - **换纯几何指标复核**：用"Biped 骨指向 vs UE 骨指向"（由各自子骨位置算夹角）验证方向，不经过四元数。实测臂/腿方向 ≤ `0.028°`，与位置/朝向指标一致。
> - ⚠ `quat as string` 的打印顺序是 `(x y z w)`，而 `.w/.x/.y/.z` 取值器是常规 `wxyz`。**不要用打印文本算分量，也不要自己拼 `matrix3` 再 `rotationpart`**（MAXScript 会转置：实测把真值 `116.8°` 算成 `3.79°`）。

### 步骤 5 —— 建“测量基准”驱动点（不挂父子）

给每根 UE 骨建一个跟随对应 Biped 骨的 Point。**它的用途是量差**（差分验收的基准）＋给 `Root` 提供真正的驱动；
**不要**把它当成 UE 骨的主驱动 —— 主驱动是控制环（控制器指南 §2 步骤 5）。

```maxscript
local restTM = <步骤 1 记录的该骨原始世界变换>
local bone   = <对应的 Biped 骨>
local d      = <B 的这根骨>

-- 驱动点：放到原始静止，**不设父级**
local p = Point name:("BIPDRV_" + d.name) pos:restTM.pos size:2.0
p.transform = restTM
p.isHidden = true

-- 驱动点跟随 Biped 骨：位置 + 方向约束，relative = false（吸附，不继承缩放）
local ppc = Position_Constraint() ; local poc = Orientation_Constraint()
p.pos.controller = ppc ; p.rotation.controller = poc
ppc.appendTarget bone 100.0 ; poc.appendTarget bone 100.0
ppc.relative = false ; poc.relative = false
```

注意：**本步不动 `d`**（UE 骨的控制器保持自由），控制器指南会在步骤 5 里接管它的位置与旋转。

**两个例外**（这两类骨的“对应 Biped 骨”不在同一位置，直接吸附会引入 10 单位误差）：

| 例外 | 做法 | 依据 |
|---|---|---|
| `Root`（UE 根） | **不要挂父子**（2026-10-16 实测：Biped 根会给子物体带 **0.762° 旋转偏置**，且"用世界变换赋值"无法纠正——新建 Point 一挂上去立刻偏 0.762°，`t.transform = 单位矩阵` / `t.rotation = 单位四元数` 读回都不变）：驱动点 `BIPDRV_Root` 先摆到原始静止，再用 `Position_Constraint` + `Orientation_Constraint → bip001`（**`relative = true`**）跟随；`Root` 用“位置+方向约束 → `BIPDRV_Root`”驱动 | 直接吸附会把 Root 拉到骨盆高度（偏 90.8） |
| `lowerarm_twist_01_l/r` | 驱动点挂到 `BIPDRV_lowerarm_l/r` 下（普通 Point，scale=`[1,1,1]`）；**该 twist 骨本身的驱动结构按源 rig 原样复制**（位置→臂中点环、旋转→`Euler`+`LookAt → 腕环`），见控制器指南 §2 步骤 5 | 参考 rig 的 `ForeTwist` 骨与 UE twist 骨位置差 10.33；若把 twist 骨改成裸 `Orientation → BIPDRV_*`，动控制器时前臂扭转骨会卡住 ⇒ 手/前臂蒙皮扭转 |

> **`relative = true` 的判据是「有没有基准」**：本步的驱动点都**先摆到原始静止再 `appendTarget`**，基准存在 ⇒ 开 `relative` 保留偏移是**正确**做法（`Root` 例外必须这么做）。
> 反过来，**给「骨」接约束时不要开**：那时骨的原始 `Position_XYZ` 已被替换、没有基准值，开了会整体塌到原点（实测 55 根骨偏 90–148）。
> 门槛复核：建完驱动点后 **55 根 UE 骨相对原始静止的位移必须 = 0**（≤1e-3）。挂父子会让整条骨架绕 Root 转 0.76°（实测 `head` 1.974、`pelvis` 1.208）。

**验证（差分，不能只看静止）**

| 指标 | 门槛 | 本案例实测 |
|---|---|---|
| 驱动点 vs 对应 Biped 骨（静止） | ≤ 0.05 单位 / ≤ 0.1° | `0.0`（逐骨）；改用 `relative=true` 约束后 `Root` 残差也是 **0.0**（旧文记的 0.76° 来自挂父子） |
| 驱动点刚性（姿态变化后误差不增长） | 与静止同量级 | 静止 `0.041` / 抬脚 +25Z `0.056` / 根骨 +10Z `0.020` |
| 建驱动点前后 B 骨位移 | ≤ 1e-3 | 本步不改 `d`，应为 0 |

> 做法：动 Biped 骨（脚、手、根）后再量“UE 骨/驱动点 vs 骨”，看误差是否随姿势增长；只看静止会漏掉所有刚性缺陷（详见控制器指南 §1.5）。

### 步骤 6 —— 显示与验收

1. **`boxMode`（Display as Box）对齐参考 rig**：参考 rig 实测 71 个对象里 **56 个** 勾了 Box（= 除 `bip001` 根、`bip001 Footsteps`、13 个 `*Nub` 之外的所有骨）。不勾就会"一边画盒子、一边画骨骼几何"，看着完全不同。

```maxscript
for o in objects where (matchpattern o.name pattern:"bip001*") do (
  local isNub = (o.name.count > 3 and (substring o.name (o.name.count - 2) 3) == "Nub")
  o.boxMode = not (o.name == "bip001" or o.name == "bip001 Footsteps" or isNub)
)
```

2. **两个窗口视口统一**：`[Front] [Standard*] [Edged Faces]`（`set_viewport view="front" shading="smooth" edges=true`）。
3. **层显示**：`BIP不导出` 可见、网格层与骨架层隐藏，做到"只显示 BIP"（58 根）。
   > 坑：隐藏某层的**父层**会把该层连带隐藏。要保留 `bip` / `BIP不导出` **整条祖先链**可见，只隐藏旁支。
   > 坑：`manage_layers add_objects` 的 `pattern` 只匹配到根对象；Biped 的**骨**是独立对象，要用 MAXScript 的 `layer.addNode o` 逐个移层（实测 126 个对象一次移完）。
   > 坑（2026-10-16 复现）：`manage_layers list` 报的是图层**自身勾选位**，`Layer.isHidden` 报的是**合并后**状态。判"到底看没看见"要用后者，或直接数 `not o.isHidden` 的对象数。
   > 坑：放通父层会**连带放出同父层的其他子树**。只要"角色/控制器"或"只显示 BIP"时，先把旁支的自身勾选位设成 hidden 再放通父层（实测 `控制器`、`bip`、`表情控制器` 同在 `不导出` 下；不锁 `表情控制器` 会一次放出约 125 个面部控制器）。
   > 坑：**图层显示态存在文件里**——重开文件会回到保存时的状态（本次复现里"切到显示控制器"就是因为父层 `不导出` 隐藏而看起来没生效）。

---

## 3. 验收指标（阶段 0–3：Biped 与测量基准）

> 本表只覆盖"建 Biped + 建测量基准"这一半；控制环落地后的**差分验收**（抬脚/抬手/根动）见 [controller-migration-guide.md](controller-migration-guide.md) §3，那才是最终判据。

| 项目 | 门槛 | 本案例实测 |
|---|---|---|
| 结构 | 与参考 rig 逐项一致 | `spine=3 / neck=1 / 5 fingers ×3 links`、71 对象 ✓ |
| 位置残差 | ≤ 0.05 | **0.04**（0/52 超 1.0）✓ |
| 朝向残差 | ≤ 0.1° | **0.056°** ✓ |
| 段长 | 与 B 一致 | `19.7845 / 20.6696 / 35.3003 / 45.3889` ✓ |
| 驱动点静止偏差 | ≤ 0.05 | **0.0398** ✓ |
| 驱动点刚性（动脚/手/根后不增长） | 与静止同量级 | 静止 0.041 / 抬脚 0.056 / 根动 0.020 ✓ |
| 显示 | 与参考一致 | `boxMode` **56/71**、视口 `[Front][Edged Faces]` ✓ |
| **控制环差分验收** | 见控制器指南 §3 | **见该表**（修前抬脚 +10 差 29.7°，修后 0.056） |

> **注意（分两个阶段看这个测量）**：
> ① 本文阶段（只有驱动点、UE 骨还没被控制环接管）：UE 骨与 Biped 骨的差恒等于"驱动点偏移"，**不能**当验收指标；此时要用**原始静止**（步骤 1 的 `gRest`）做基准。
> ② 控制器层建立之后：UE 骨由环驱动，"UE 骨 vs Biped 骨"就变成**最重要**的差分验收指标（要求静止≈抬脚≈根动，不随姿势增长）。见 [controller-migration-guide.md](controller-migration-guide.md) §3。

---

## 4. 陷阱速查

| 症状 | 原因 | 修法 |
|---|---|---|
| 拟合怎么调都不动/越调越乱 | 驱动层已存在，目标被自己拖动（自反馈） | 从"建 Biped 之前"的快照重来，或先断开 55×2 条约束 |
| 肢体长度改不回来（停在参考角色长度） | 载入 figure 后没在 Figure Mode 内做长度缩放；或自反馈 | 确认 `figureMode = true`；确认目标自由 |
| 骨长对、粗细如发丝 / 头是个点 | 用最小 figure 直接拟合，Y/Z 缩放留着早期塌陷值 | 先 `loadFigFile` 装参考 figure，再拟合 |
| 腿骨整体内移 ~8 单位（蒙皮跟着偏） | 最小 figure 的髋附着点≈0 | 同上：装参考 figure |
| 上半身整体漂移几百单位 | 对**骨盆**用了 `#scale [x,1,1]`（骨盆缩放会缩放整个上半身，实测 416 单位） | 不要动骨盆 `#scale`；用逐骨局部 X 缩放 |
| 逐骨 `move` 无效 / 链被拉坏 | Biped figure 是连通链，`move` 对 32/52 根骨被忽略 | 按"长度+朝向"设父子关系，不要绝对摆位 |
| `#scale` 报 ok 但值不变 | 多数骨上 `#scale` 被忽略；且必须在 Figure Mode 内 | 用 `coordsys local ( scale o [k,1,1] )`（Figure Mode 内） |
| `saveFigFile` 报 `Cannot run the operation in this mode` | Figure Mode 没开 | `figureMode = true` 后再存 |
| 驱动点/UE 骨偏 1–2 单位 | 驱动点挂在**非均匀缩放**的 Biped 骨下 | 改约束跟随（`relative=false`），不挂父子 |
| UE 骨整体塌到原点附近 | 约束开了 `relative = true`（没有基准值） | 全部设 `relative = false` |
| `Root` 偏 ~90.8 | 吸附到骨盆高度的 Biped 根 | Root 的驱动点挂到 `bip001` 下 |
| `lowerarm_twist_01` 偏 ~10.3 | 参考 rig 的 `ForeTwist` 与 UE twist 位置不同 | 驱动点挂到 `BIPDRV_lowerarm_*` 下 |
| 一边画盒子、一边画骨骼 | `boxMode` 不一致 | 按参考 rig 的 56/71 对齐 |
| 隐藏某层后目标层也不见了 | 隐藏了父层 | 保留目标层的整条祖先链可见 |
| 改动后立刻读值拿到旧数据 | Biped 惰性求值 | `redrawViews()` 后**二次读值** |
| 三角函数算角度不对 | MAXScript 的 `sin/cos/acos` 默认**角度制（度）** | 按度使用，别当弧度 |
| 动控制器时 **Biped 不动** | **源 rig 的设计**（环不反驱 Biped；2026-10-16 在源窗口实测同为 0.0） | 不是迁移缺陷；要"环反驱 Biped"须另加一层约束（源没有这个能力） |
| 复位时 API 读回"已复位"但 Biped 仍弯着 | `biped.getTransform <骨> #pos` 是**假阳性**（实测读回 1e-5，求值后世界位置仍偏 25.0） | 复位后比对**世界位置** `bipBone.transform.pos`（≤1e-3），必要时按误差再补一次 |
| 建驱动点后 B 骨整体偏 1.2–2.0、`Root` 朝向差 0.76° | `BIPDRV_Root` 挂了 `bip001` 父子 | 改 `relative=true` 约束（先摆静止再 `appendTarget`） |
| `Unknown property: "setCurrent"` | Max 2026 的 LayerProperties 没有该方法 | 建完图层用 `layer.addNode` 逐骨移层 |
| `Unable to convert: undefined to type: Point3` | 用下标取列表控制器槽（拿到 `SubAnim` 包装） | `(getSubAnim c j).controller` 再取 `.value` |
| 脚本报 `undefined` 类型错误、函数"不存在" | 短函数名与内置冲突（例如 `fn rp`） | 换全长名（`restPosOf` 之类） |
| 拟合"调用内自测"完美、换一次调用就崩 | 调用内读到的是刚写入的 figure 值 ⇒ **假阳性** | 按上面"读数协议"：写后 `completeRedraw()`；**结论**必须"`figureMode=false` + `completeRedraw()` + 同调用内读两次" |
| 新调用不刷新就读出 67.8 / 173° 这类大误差 | 读到的是上次求值的缓存 ⇒ **假阴性** | 同上；并用**纯几何方向**指标交叉验证，别只信一次读值 |
| 数 `classof o == Dummy` 得到 68 而不是 55 | Biped 的 13 个 `*Nub` **`classof` 也是 `Dummy`** | 「55 根 UE 骨」只在**建 Biped 之前**数，或按名字表筛 |
| 锁骨怎么解都差 16–80° | 锁骨只有 **2 个自由度**（朝向），由一对"锁骨值"驱动且没有 setter（`biped.getClavicleVals` 只读） | 判定锁骨用**方向**指标（别拿完整世界旋转当目标）；需要时可"不动点 + 实测雅可比 + 随机重启"，并把锁骨**放在最后**解 |
| **静止对得上、一抬脚就炸**（膝/肘环偏 2.5–4.6 单位 ⇒ 小腿/前臂甩 15–30°） | 源 rig 的**辅助 IK 链静止几何仍是源角色的**（本案例腿 `36.61/43.96`、臂 `18.34/23.28`） | 按 §7.1 把链的静止几何重拟到 B 的骨关节（只写 `p1`、按"方向 × 目标骨长"；环落在链关节上）；**不要再**靠"关节环的固定补偿偏移"凑对 |
| 移控制器时"骨长不守恒"、中关节飘 | 段长 = `p1 + p2`：伸缩线挂在 `零位置 XYZ` 的 **X** 上（腿 `+0.0385513`），而**臂的长度分量在 `p2.y`** | 只写 `p1`（冻结位置），按"方向 × 目标骨长"构造（§7.1；旧写法"只改 `.x`"只对腿成立） |
| 极向点怎么转都不收敛 | 目标肢体**接近全伸展**（静止时中关节几乎在起—末端轴上），平面退化 | **段长在静止拟合、极向点在弯姿势对齐**（见 §7）；两者不能在同一轮里做 |
| 动一根骨，另一根不应动却动了（骨长被拉坏） | 用绝对坐标设链关节位置（`nd.pos = …`）——链长度就是子关节的局部偏移，改位置等于改骨长 | 只写"冻结位置/零位置 XYZ"的**值**，或对普通 Point 用 `move` |
| 肢体一动就转 15–30°（静止看不出来） | 目标骨的旋转约束被写成**多目标 `Orientation_Constraint` 等权重混合**（实测股骨 29.6°、小腿 29.7°@抬脚+10） | 照源 rig 的**逐骨结构**重建（`rotation_list`：`[1] Euler_XYZ` 基值 + `[2] LookAt/Orientation` 权重 50），**不要**自己叠第二个目标 |
| 复制了源结构，静止还是差 10–14° | 源结构的 `LookAt` 用的是源 rig 的**辅助中点环**（如 `Circle021/022`），若在本场景里它们离线段远就会偏；`LookAt` 的**上方向节点（`pickUpNode`）还指向源骨架的骨**（本案例 `SV_bip001 R ForeTwist`），一弯就错 16–23° | `pickUpNode` 一律改指**目标的同名骨**（`bip001 R ForeTwist`）；`LookAt` 目标**先量再决定**——链已对齐时中点环就在线段上，保持源目标即可（详见控制器指南 §2 步骤 5） |
| 移动角色根骨后腿的膝平面全错 | 控制层根节点（`BIPRoot`）被留在**源 rig 的静态根**（`SV_Root` @ 原点）上 | 把 `BIPRoot` 的位置+方向约束改指**目标自己的 UE 根**（`Root`），改完复核极向点与静止对齐 |
| 脊柱某节静止偏 1–2 单位 | 脊柱辅助点在**样条 `Line001` 上的 `Path_Constraint.percent`** 是源角色的比例（案例 `58.0769 → 50.0`；2026-10-16 复现实测最优 `Point001 = 49.97`、`Point002 = 99.9968`） | 扫描 `percent` 找离驱动点最近的位置，**并且必须放在手柄迭代之后**（控制器指南 §2 步骤 5.5） |

---

## 5. 关键 API / 参数速查

| 用途 | 写法 | 备注 |
|---|---|---|
| 建骨架 | `biped.createNew 3 1 [0,0,0]` | 3 个参数：最小结构 |
| 进/出形体模式 | `bipRoot.transform.controller.figureMode = true/false` | 所有 figure 编辑的前提 |
| 根骨节点 | `bipRoot.transform.controller.rootNode` | 定位整个 figure 用 |
| 设变换 | `biped.setTransform <骨> #pos\|#rotation\|#scale <值> <bool>` | 第 1 参数是**骨节点**；第 4 个布尔在实测中取 `false` 即可 |
| 读变换 | `biped.getTransform <骨> #pos\|#scale` | 读回值受惰性求值影响，必要时二次读 |
| 节点/骨枚举 | `biped.getNode <root> <index>`、`biped.getNode <root> <fingerIndex> link:<i>` | 手指等按 link 取 |
| figure 存取 | `biped.saveFigFile <ctrl> <path>` / `biped.loadFigFile <ctrl> <path>` | **必须 Figure Mode 内** |
| 改骨长 | `coordsys local ( scale <骨> [ratio,1,1] )` | Figure Mode 内；不改变粗细 |
| 约束 | `Position_Constraint()` / `Orientation_Constraint()` + `appendTarget <node> 100.0`、`.relative` | 驱动层用 `relative=false` |
| 约束深拷贝 | `d.rotation.controller = copy src.rotation.controller` | **实测可整棵复制**（`rotation_list` 的 `[1] Euler_XYZ` 基值、`[2] LookAt/Orientation`、目标节点、权重、`pickUpNode` 全保留），是"照源 rig 结构重建"的最省做法 |
| 删目标 | `c.deleteTarget i`（**倒序**删） | `appendTarget` 只**追加**；`obj.pos.controller = Constraint()` 也是追加，不是替换（曾把双目标混成 2.5 倍响应/45° 扭转） |
| 约束目标偏移 | `appendTarget` 捕获的是**单位偏移**（不保留当前朝向），实测 `weight=0` 只是把该目标权重清零 | 要"当前朝向 = 静止"就先把骨摆到目标朝向再 append；本案例改用 `copy` 源结构 |
| `LookAt` 上方向 | `c.pickUpNode`（可读可写）、`c.target_axis`、`c.upnode_axis` | 指源骨架的骨 ⇒ 一弯就错 16–23°；改指目标同名骨 |
| 样条约束 | `Path_Constraint.percent`（0–100） | 脊柱辅助点用它定位；扫描法校 |
| 列表控制器取值 | `getSubAnim c j` → 再 `.controller` | `c[j]` 得到的是 `SubAnim` 包装，遍历会在列表控制器处中断（曾只找到 12/59 个引用） |
| 冻结/零偏移 | `<Point>.pos.controller[1]`（冻结位置）、`[2]`（零位置 XYZ） | 冻结值 `.value = [...]` 可写；改链段长就是改这个（不是 `.pos`） |
| 层操作 | `LayerManager.getLayerFromName "<层>".addNode <obj>`、`.isHidden`（父层隐藏会连带） | ⚠ `.setCurrent()` 在 Max 2026 **不存在**；`getNodes()` 在该版本也不存在 |
| 强制求值 | `completeRedraw()` | 每次写入后读值必须用它；同一调用内 `redrawViews()` 不足 |
| 锁骨值（只读） | `biped.getClavicleVals <锁骨>` → `[a,b]` | 锁骨是 2 自由度；没有 `setClavicleVals` |
| Biped 父节点 | `biped.getRotParentNode <骨>` / `getPosParentNode <骨>` | ⚠ 与场景 `.parent` **可能不同**（实测锁骨：前者 `bip001 Spine2`、后者 `bip001 Neck`） |
| 姿态复制 | `biped.copyPosture` / `pastePosture` / `copyBipPose` / `pasteBipPose` | 已确认存在；整体对齐的备选路线 |

**Biped 结构参数**（在 `bipRoot.controller` 上）：
`spineLinks / neckLinks / legLinks / fingers / fingerLinks / toes / toeLinks / upperarmTwistLinks / forearmTwistLinks / thighTwistLinks / calfTwistLinks / ponytail1Links / ponytail2Links / tailLinks`。

---

## 6. 里程碑与文件命名（本案例）

| 文件 | 内容 |
|---|---|
| `Stan01_BIPbuild_20261016.max` | **建 Biped 之前的干净快照**（55 骨原始静止的真值来源） |
| `Stan01_BIPbuild_biped_20261016.max` | 建好 Biped（结构 3×5×3，未拟合） |
| `Stan01_BIPbuild_fitted_sevenfig_driver_20261016.max` | 装好参考 figure + 拟合 + 驱动层（旧版驱动层：挂父子，有 1.2–2.0 漂移） |
| `Stan01_BIPbuild_fitted_sevenfig_driver_v2_20261016.max` | 拟合 0.04 / 驱动层约束式（`maxDummyVsRest=0.0398`）/ `boxMode` 对齐 |
| `Stan01_BIPbuild_controller_migrated_20261016.max` … `_v6_20261016.max` | 控制器层（源 rig 控制环）迁移各阶段 |
| **`Stan01_BIPbuild_ctrl_fixed_v8_20261016.max`** | **当前最优**：链段长重算 + 逐骨复制源旋转结构 + `pickUpNode`/`BIPRoot`/脊柱 `percent` 修正；55 骨静止 d≤0.05、r≤1.0；抬脚 +25 无漂移 |
| `seven_figure_20261016.fig` | 从参考 rig 导出的 figure |

**每次动场景前**：`manage_scene action="hold"`；出问题用 `fetch` 回退（需在对话框答 Yes）。

---

## 7. 控制器层落地：三条必做校准（2026-10-16 实测）

> 本节是速查版；完整流程、放大机制解释、差分验收与陷阱表见 [controller-migration-guide.md](controller-migration-guide.md)。

控制环（起/末端环 → 辅助 IK 链 → 肘膝环 → UE 骨）从源 rig 搬来后，**静止看着都对、一动就崩**，原因是三处没跟着目标角色重算。按下面顺序做，每步都有数值门槛。

### 7.1 让辅助 IK 链的**静止几何**落在 B 的骨关节上（**静止**时做）

> 2026-10-16 复现后本节的旧写法（"只改 `c1.value.x`"）**已作废**：段长不止在 X 分量，而且光调长度修不掉侧向误差。完整做法见 [controller-migration-guide.md](controller-migration-guide.md) §2 步骤 3，要点：

1. 链关节 `pos.controller` 是 `position_list`：**有效局部向量 = `p1 + p2`**；伸缩线挂在 `p2.x`（实测腿 `+0.0385513`）。
2. **长度分量位置随肢体不同**：腿在 `p1.x`（`p1=[35.21,0,0]`）、臂在 `p2.y`（`p1=[5.40,0,0]`、`p2=[0,-19.03,0.55]`）⇒ 别只改 X。
3. 只写 `p1`，按「方向 × 目标骨长」构造；中点关节用**父级局部坐标系不动点迭代**收敛到 0.005~0.025。
4. **末端关节交给求解器**（写它会发散）；末端的**环**落到 B 的骨关节即可（骨的「位置」由环 1:1 决定）。
5. **环必须落在链关节上**（源语义）；把膝/肘环挪到骨上会让 `LookAt` 上方向节点退化、`calf` 朝向翻 179.4°。

> 本案例：源链 `36.61/43.96`（腿）、`18.34/23.28`（臂）→ 目标 `35.3003/45.3889`、`19.7845/20.6696`；复现实测中点关节误差腿 `0.009`、臂 `0.005~0.024`。

### 7.2 极向点在**弯姿势**对齐（不能和 7.1 同一轮做）

静止时肢体接近全伸展，中关节几乎落在起—末端轴上 ⇒ 平面退化，极向点怎么转都看不出来；但段长在静止时最敏感（差 0.077 就能把膝径向从 2.16 顶到 2.78 —— 同一轮里边弯边拟段长会把静止的膝顶偏 0.62）。所以：

1. 先在**静止**拟合段长（7.1，可多轮）；
2. 再用 `biped.setTransform <末端骨> #pos (<原位>+[0,0,25]) false` 把肢体**弯起来**；
3. 此时把极向点绕"起—末端轴"转到**目标中关节所在平面**（保持原有离轴距离）；
4. 复位 `#pos <原位>`，静止与弯曲两个状态都要复测。

> 本案例弯姿势中关节误差：腿 `0.053→0.0004`、臂 `0.226/0.959→0.020/0.020`。

> 2026-10-16 复现补充：链按 7.1 对齐、环落在链关节上之后，**弯姿势本来就跟得住**（实测抬脚 +25Z 时腿 `|UE calf − Biped calf| = 0.0003`），再挪极向点几乎没有变化；而**静止**时移动极向点 ±40 只让链中关节动 `0.118`。所以本步定位成**弯位复核**：只有弯位明显不合才调极向点，别指望它修静止误差。

**顺手把肘膝环的补偿偏移归零**：⚠ **只在源数据确实靠补偿凑对时才做**。2026-10-16 复现里源数据的环本来就落在链关节上（偏移 `1.6e-05`），强行归零反而让环离位、骨偏位。

### 7.3 逐骨复制源 rig 的**位置 + 旋转**两棵控制器树（不要自己叠约束）

UE 骨的旋转照源 rig **逐骨**的结构复制即可：

```maxscript
for o in objects where ((substring o.name 1 7) == "BIPDRV_") do (
  local bn = substring o.name 8 60              -- BIPDRV_ 之后即骨名
  local src = getNodeByName ("SV_" + bn)        -- 源 rig 的同名 UE 骨
  local dst = getNodeByName bn                  -- 本角色同名骨（蒙皮对象）
  if src != undefined and dst != undefined do (
    dst.pos.controller      = copy src.pos.controller         -- ⚠ 位置侧必须一起复制
    dst.rotation.controller = copy src.rotation.controller
  )
)
```

源结构是 `rotation_list`：`[1] Euler_XYZ`（基值）+ `[2] LookAt_Constraint`（瞄准；上臂/前臂/大腿/小腿/脊柱/`*_twist`）或 `Orientation_Constraint`（手/脚/脚掌/手指），权重 **50**。**位置侧同样要复制**（旧文"位置侧不用改"是错的）：复现里目标骨合并后仍是自由 `Position_XYZ`，只复制旋转会得到"动 Biped 会跟、动控制器不跟"的半成品。

复制完必做**目标重指**（源 rig 的辅助对象是否落位，要**先量再改**）：

| 位置 | 源 rig 指向 | 改成 |
|---|---|---|
| `LookAt.pickUpNode` | `SV_bip001 R/L ForeTwist[1]`、`SV_bip001 Pelvis/Spine/Spine1` | 本角色同名骨 `bip001 …` |
| `LookAt` 目标 | 上臂→`Circle021/023`、前臂→`Circle022/024`（源的中点环） | **先量再决定**：若你的链已按 §7.1 对齐，中点环本来就落在线段上 ⇒ **保持源目标**（改指会偏离源行为）；只有当实测中点环明显离线段（案例里偏 9.9/11.4）时才改指 上臂→**肘环** `Circle017/020`、前臂→**腕环** `Circle016/019` |
| `*_twist` 骨（`lowerarm_twist_01_l/r`） | 源结构 = 位置 `Position_Constraint → Circle022/024`（臂中点环）+ 旋转 `rotation_list`（`[1] Euler` 基值 + `[2] LookAt → 腕环`） | **原样复制**。⚠ **不要**改成裸 `Orientation_Constraint → BIPDRV_lowerarm_*`（那是给 v2 驱动层中间态写的）：那样 twist 只跟静态 Biped ⇒ 动控制器时**手/前臂蒙皮扭转**（2026-10-16 现场反馈、已定位修好） |

### 7.4 控制层根与脊柱辅助点

- `BIPRoot` 的位置+方向约束从源 rig 的静态根（`SV_Root` @ 原点）改指本角色的 UE 根（`Root`）：否则角色一移动/旋转，极向点不跟，膝平面全错。改完**重跑 7.2**。
- 脊柱辅助点在样条上的 `Path_Constraint.percent` 是源角色的比例（本案例 `58.0769`），改到 `50.0` 后 `spine_02` 静止误差 `1.55785 → 0.00168`。

### 7.5 验收（`Stan01_BIPbuild_ctrl_fixed_v8_20261016.max` 实测）

> 案例表里的 `Root` 0.76° 残差来自 `BIPDRV_Root` 挂父子；改用 `relative=true` 约束后残差 = 0（2026-10-16 复现），下表其余各行的量级不变。

| 状态 | 最大位置误差（55 骨 vs Biped） | 最大朝向误差 | 超门槛（r>1° 或 d>0.1） |
|---|---|---|---|
| 静止 | **0.041**（`lowerarm_l`） | **0.76°**（`Root`） | **0** |
| 右脚 +25Z（深屈膝） | **0.056**（`calf_r`） | 0.76° | 0 |
| 右手 +25Z | 0.234（`lowerarm_r`） | 0.77° | 2（均 <0.7°） |
| 根骨 +10Z | 0.020 | 0.76° | 0 |

> 对照：修前抬脚 +10 → `thigh_r` 朝向差 **29.2°**、`calf_r` **29.7°**、位置差 **2.76**；源 rig 自身同姿势为 2.03°/3.48°/0.0007。复位误差 ≤1.2e-4。
> **仍存**（未在本轮解决）：抬脚 10–35 时大衣网格在右髋/大腿外侧出现深色翻面（数值上骨已对齐 ⇒ 属网格权重/碰撞问题，非控制器问题）。
