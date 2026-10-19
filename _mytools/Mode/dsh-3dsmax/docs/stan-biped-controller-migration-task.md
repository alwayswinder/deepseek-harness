# Stan 新建 Biped + Seven 身体控制器迁移 · 任务说明

> **本文是"计划书 + 流水账"**：§0–§9 是开工时（2026-10-16 12:3x）写的计划与验收标准，**其中部分做法已被后续实测推翻**（尤其 §4 的 **P6 驱动层**与 §2 的目标架构）。
> **可执行规范以这三份为准**：[README.md](README.md)（全流程索引 + 端到端自检清单）、[biped-rebuild-guide.md](biped-rebuild-guide.md)（Biped 搭建与拟合）、[controller-migration-guide.md](controller-migration-guide.md)（控制器迁移与差分验收）。
> 计划与最终实现的差异、以及每条结论的取证数字，记录在 §10.14 / §10.15 / §10.16。

> Task spec (working doc): build a **new Biped fitted to Stan's UE skeleton**, then migrate **Seven's body-controller layer** onto it. Seven stays a read-only reference template. Deliverable to the engine is Stan's UE skeleton (bake → FBX → UE).
> 本文与 `ADVANCED.md` / `CHANGELOG.md` / `PYPI.md` 并列存放，内容为项目工作文档（中文），标识符与 API 名称保留英文。

---

## 0. 目标与范围

**目标**：在 `Stan01.max` 上新建一支 **与 Stan UE 骨架 1:1 拟合的 Biped**（结构节数与 Seven 一致），再把 **Seven 身体部分的控制器**（IK 链 / 极向点 / 圆环 / 参数线 / ExposeTransform）迁移到这支 Biped 上。此后动画师可用与 Seven 相同的方式摆姿势，最终把 Stan 的 **UE 骨架** bake 后导出进引擎。

**为什么这么做**：Seven 的 Biped 是 Seven 的比例，直接用会出现"骨骼不贴角色"；而"绝对位置约束 + 刚性偏移"的映射在**子骨相对父骨旋转**（弯肘/弯膝）时会漂移。若 Biped 的**静止几何**与 Stan UE 骨一致，该映射就等价于原生 FK，弯曲不再漂移，骨骼也贴合角色。

**不在范围**：
- 头/脸/表情：Seven 的 `表情`、`捏脸骨骼`、`眉毛*`、`眼睛`、`嘴`、`鼻子`、`对位置`、`辅助微调`、`反应管理`、`表1-3`、`层006`、`biaoqing` 等图层不迁。
- 不迁 Seven 的 Biped 本身；**不修改 Seven 原文件**。
- 不在本任务内做"用 Seven 整条 rig 作驱动层"那条路线（已完成，见 §8 参考）。

**前置条件**：
- 目标场景 = `Stan01.max`（55 根 UE 骨 + 4 网格），身体控制器来源 = `Seven_Skin.max`。

---

## 1. 现状基线（实测，2026-10-16）

### 1.1 两个 Max 实例

| 窗口 | 场景 | 内容 |
|---|---|---|
| pid 17464 | `E:\AI\3dMax\Save\Seven_Skin.max` | 818 对象、`bip001*` 71、IK 链 4、`FBX` 层 58、35 层、frame 0、range 0–12800 |
| pid 61676 | `E:\AI\3dMax\Save\Stan01.max` | 59 对象（55 UE 骨 + 4 网格）、**无 Biped**、含空层 `NUB` / `BIP不导出`（文件本身已有：scene 报 `dirty=false`、磁盘 hash 与备份一致） |

- 磁盘 `Stan01.max` 未被修改：SHA256 `95A89566 221C495A A5969BEE BD00674F 6A36213B 20A23DE1 35E70C01 79EF71C8`，与 `Stan01_backup_before_seven_migration_20261015.max` 完全一致（时间戳同为 2026-10-15 15:19:38）。
- Stan 骨架（55）：`Root, pelvis, spine_01..03, neck_01, head` + 每侧 `clavicle, upperarm, lowerarm, hand, thumb_01..03, index_01..03, middle_01..03, ring_01..03, pinky_01..03, lowerarm_twist_01, thigh, calf, foot, ball`。
- Stan 蒙皮：`PrinceofStan_Body`=54 骨、`_Face`=3、`_Eye`=1、`_Hair`=1；54 个蒙皮骨全部存在（无失效引用）。

### 1.2 Seven 身体控制器盘点（实测）

| 层 | 对象数 | 类构成 |
|---|---|---|
| `控制器` | 60 | `Circle`, `Point`（含极向点 Point158/159/038/039） |
| `辅助` | 83 | `Point`, `SplineShape`, `ExposeTm`, `IK_Chain_Object` |
| `NUB` | 18 | `BoneGeometry`, `Biped_Object`, `Dummy`（nub / ForeTwist / 面部 Bone，非控制器） |
| `Root` | 10 | `Point` + `Freecamera`（Weapon 挂点 + 一台相机） |

四条肢体的控制器节点（来自已跑通的技能配置，节点名已在本场景抽查存在）：

| 肢体 | 链条关节（起点/中间/末端） | 起点/末端控制器 | 极向点 | 目标骨（Stan） |
|---|---|---|---|---|
| RIGHT ARM | `Point044` / `Point045` / `Point046` | `Circle015` / `Circle016` | `Point159` | `upperarm_r` / `lowerarm_r` / `hand_r` |
| LEFT ARM | `Point031` / `Point032` / `Point033` | `Circle018` / `Circle019` | `Point158` | `upperarm_l` / `lowerarm_l` / `hand_l` |
| RIGHT LEG | `Point022` / `Point023` / `Point024` | `Circle009` / `Circle010` | `Point039` | `thigh_r` / `calf_r` / `foot_r` |
| LEFT LEG | `Point025` / `Point026` / `Point027` | `Circle011` / `Circle012` | `Point038` | `thigh_l` / `calf_l` / `foot_l` |

其他已确认属于身体控制器的还有：`Circle005`→`pelvis`、`Circle007`→`spine_03`、`Circle075`→`thumb_01_r`、`Circle110`→`ball_l`（来自验收脚本的驱动测试清单）、`ExposeTransform001..006`。

> **待办（P1）**：身体/表情的分界**必须用实测依赖图划**，不能只按层名。判据 = 该控制器最终是否驱动 Biped 身体骨；驱动面部/表情骨的排除。

---

## 2. 目标架构

```
        ┌──────────────────────────────────────────────┐
        │ 新建 Biped（拟合 Stan 的 UE 骨，结构照 Seven） │  ← 动画师的手柄
        └──────────────────────────────────────────────┘
                 ▲                          │
   控制器层（从 Seven 迁移/重挂）             │ 驱动点（每根 UE 骨一个，
   IK×4 / 极向点 / 圆环 / 参数线 /            │ 放在 Stan 静止世界变换，
   ExposeTransform                          │ 挂到对应 Biped 骨下）
                 │                          ▼
        ┌──────────────────────────────────────────────┐
        │ Stan UE 骨（55）= 蒙皮骨 = 交付给 UE 的骨架    │
        │ 位置约束 + 方向约束 ← 驱动点                  │
        └──────────────────────────────────────────────┘
                 ▼
        PrinceofStan 网格 → bake → FBX → UE
```

与既有原型（`Stan_SevenNative_Body_Prototype_20261015.max`，Seven 的 Rig 作驱动层）的差别：**手柄换成拟合 Stan 的 Biped**，因此控制器必须重挂，但换来"骨骼贴合 + 弯曲不漂移"。

---

## 3. Biped ↔ Stan UE 映射

**可 1:1 匹配（52 根，逐字对应）**

| Biped | Stan UE |
|---|---|
| `bip001 Pelvis` | `pelvis` |
| `bip001 Spine` / `Spine1` / `Spine2` | `spine_01` / `spine_02` / `spine_03` |
| `bip001 Neck` / `Head` | `neck_01` / `head` |
| `L/R Clavicle` / `UpperArm` / `Forearm` / `Hand` | `clavicle_l/r` / `upperarm_l/r` / `lowerarm_l/r` / `hand_l/r` |
| `L/R Finger0/01/02` | `thumb_01/02/03` |
| `L/R Finger1*` / `2*` / `3*` / `4*` | `index_*` / `middle_*` / `ring_*` / `pinky_*` |
| `L/R Thigh` / `Calf` / `Foot` / `Toe0` | `thigh_l/r` / `calf_l/r` / `foot_l/r` / `ball_l/r` |

已用坐标实测确认的对应：`bip001 Pelvis` = `pelvis`、`bip001 L UpperArm` = `upperarm_l`、`bip001 L Finger0` = `thumb_01_l`、`bip001 L Toe0` = `ball_l`。

**无法 1:1（3 根，用规则）**

| Stan 骨 | 处理方式 |
|---|---|
| `Root` | 保留为静止根：驱动点挂在 Biped 根上（或保持静止不驱动） |
| `lowerarm_twist_01_l/r` | 二选一：由 Biped 的 `ForeTwist` link 驱动；或按 UE 惯例跟 `lowerarm` 的扭转（如 50%） |

**Biped 独有、Stan 无对应**：`Footsteps`、13 个 `*Nub`、`ForeTwist`/`ForeTwist1` —— 隐藏即可，不影响。

---

## 4. 阶段计划（P0–P9）

每个阶段都给出：操作 / 工具 / 产出 / **GATE（通过门槛）**。

### P0 检查点与命名
- 操作：`Stan01.max` **只读保留**；另存里程碑文件（见 §7）；`manage_scene(hold)`；确认当前帧与 auto-key 状态。
- GATE：里程碑文件写入成功；原文件 hash 不变。

### P1 只读盘点 + 依赖图（不修改场景）
- 操作：在**两个实例**各跑一次只读盘点（类直方图 / IK 链 start-mid-end / 极向点候选 / 蒙皮骨名单 / Dummy 名单）：
  - 类直方图、IK 链明细（**读取方式**：`o.transform.controller.startJoint` / `.endJoint`，中间关节 = `endJoint.parent`）、极向点、蒙皮骨清单、Dummy 名单、`S7_*` 迁移痕迹；
  - 额外要求：**画出身体部分的依赖方向图**（谁约束谁：控制器 → Biped → 约束链 → UE 骨），作为重挂的唯一依据。
- 产出：Seven 身体控制器清单（含每条的驱动方向）、Stan 侧待驱动的 UE 骨清单。
- GATE：清单里每个控制器都能说明"它驱动哪根骨"，无法说明的不进迁移范围。

### P2 采集 Stan 的静止几何
- 操作：对 55 根 UE 骨记录世界变换（`node.transform`）与逐段骨长；记录帧号（必须停在静止帧）。
- 产出：映射表 + 目标几何数据（脚本内置常量表）。
- GATE：`pelvis/head/foot_l` 与 §1.1 基线一致（逐位），骨长 `19.7845 / 20.6696 / 35.3003 / 45.3890` 复核通过。

### P3 新建 Biped
- 操作：`biped.createNew`（结构：**脊柱 3 段、颈 1 段、每手 5 指 × 3 节**，与 Seven 一致）；把根命名成 `bip001`（便于复用既有脚本；因不合并 Seven 的 Biped，不存在重名冲突）；放到 `BIP不导出` 层。
- 产出：空 Biped（2 根可选：`bip001`）。
- GATE：`biped.getNode <bip> <i>` 枚举出的骨数与 Seven 的 58 一致（含手指/脚趾/nub 的差异需逐项对照说明）。

### P4 Figure Mode 拟合
- 操作：进 Figure Mode，**按层级顺序**逐骨对齐：`pelvis → spine → neck/head/clavicle → upperarm → forearm → hand → fingers → thigh → calf → foot → toe`；每根骨**先设朝向、再把子关节移到 Stan 对应关节位置**（等价于设段长）。
- 工具：`biped.setTransform`（**签名未验证，先在副本上用一根骨试写并回读**）；拟合完成后用 `biped.saveFigFile` 存档，便于复用/回退。
- GATE：无异常；写入后回读一致。

### P5 拟合校验
- 操作：逐骨比较 Biped 骨与 Stan UE 骨的世界位置与朝向；逐段比较段长。
- GATE：位置误差 ≤ **1e-3**、段长误差 ≤ **1e-3**；受 Biped 自身规则限制的部位（躯干/手指）如实记录残差，不得隐瞒。

### P6 建驱动层（Biped → UE 骨）**【已被取代：见本节末尾注】**
- 操作：按「驱动点先放到 B 骨静止世界变换 → 用位置+方向约束跟随对应 Biped 骨（**不挂父子**）」建驱动层：
  1. 每根 UE 骨建一个驱动点 `Point`，`pos = UE 骨静止世界变换`；
  2. `p.parent = <对应 Biped 骨>`；`p.transform = 静止变换`（**恢复世界变换是关键**）；
  3. UE 骨：`b.pos.controller = Position_Constraint()`、`b.rotation.controller = Orientation_Constraint()`，各自 `appendTarget p 100.0`。
- GATE：`maxRestShift < 1e-3`（加约束后静止姿势不被破坏）且 `failed = 0`。
- 备注：因 P5 已使两套静止几何一致，此时"刚性偏移"映射等价于原生 FK。
- **【已被取代，2026-10-16 14:2x】** 本节把驱动点当作 UE 骨的**主驱动**（`b.pos/rotation.controller = 约束 → 驱动点`）。实测结论：
  ① 这样"动控制器"不再驱动角色（用户实测报障）；② 旋转退化成"驱动点 + 环"两个等权目标混合，抬脚 +10 就差 **29.6°**。
  最终架构：驱动点只作**测量基准**（+ `Root` 的驱动），UE 骨由**控制环**驱动（位置 ← 环；旋转 ← 逐骨 `copy` 源 rig 的 `rotation_list`）。见 §10.15 与[控制器迁移指南](controller-migration-guide.md) §2 步骤 5。

### P7 控制器迁移（**先单腿试点**）
- 顺序：**只做一条腿**（建议 LEFT LEG）→ 数值 + 着色蒙皮双角度目视 → 通过后再扩展其余三条 + 躯干/拇指/脚掌控制。
- 每条肢体的操作：
  1. IK 链重挂：把链条起点/末端关节、goal、solver 指到新 Biped 的对应骨与其控制器（读法 `o.transform.controller.startJoint/.endJoint`；写法的属性名需在副本上先验证）；
  2. 起点/末端控制器移到新 Biped 的关节（`move`）；
  3. 段长按新 Biped 的**实测解算长度**迭代拟合（*设置值 ≠ 实际值*：`x_position` 上挂伸缩参数线；路径见 `scripts/04` 的 `fkFrozenPos`）；
  4. 极向点绕轴旋转到目标中关节所在平面（只改方向分量，保留离轴距离）；
  5. 参数线：把写死的距离/阈值改写成新段长（阈值 = 两段总长的一半）。
- 参考实现：见 [controller-migration-guide.md](controller-migration-guide.md) §2 步骤 3（算法与门槛已跑通）。
- GATE：该肢体 `endErr < 2e-3`、`midErr < 0.02`；目视蒙皮正常；**复位后误差 = 0**。
- 禁止：在同一变换轨道上并联第二套 IK/约束（会循环或双重驱动）。

### P8 验收
- 操作：跑三项验收（逐肢误差 / 刚性漂移 / 驱动+复位，做法见 [controller-migration-guide.md](controller-migration-guide.md) §2 步骤 7），另外**新增两项**：
  - **弯曲测试**：弯肘、弯膝各 60–90°，核对 UE 骨的**有效段长**是否守恒（目标 ≤ 2e-3），并看着色蒙皮；
  - **导出闭环**：摆姿势 → bake → 导出 FBX → 进 UE 检查。
- GATE：见 §5。

### P9 交付与归档
- 保存里程碑文件；把每阶段的 GATE 输出粘贴进交付报告；记录未验证范围。

---

## 5. 验收标准汇总

| 项 | 门槛 | 来源 |
|---|---|---|
| 拟合：逐骨位置 / 段长误差 | ≤ 1e-3 | P5 |
| 驱动层：静止姿势漂移 `maxRestShift` | < 1e-3，`failed=0` | `scripts/05` |
| 肢体：末端误差 `endErr` | < 2e-3 | `scripts/04` / `06` |
| 肢体：中关节误差 `midErr` | < 0.02 | `scripts/04` / `06` |
| 刚性漂移 `drift` | < 1e-5 | `scripts/06` |
| 复位误差 `restoreErr` | < 2e-3（期望 = 0） | `scripts/06` |
| **弯曲时 UE 骨有效段长守恒** | ≤ 2e-3 | 本任务新增 |
| 目视 | 着色蒙皮，至少两个角度；不靠骨骼形状判断接触 | 技能要求 |
| 复测 | 存盘 → 重开 → 再跑一次验收脚本，结论一致 | `scripts/06` |

---

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| `biped.setTransform` 签名未验证 | P4 前在**副本**上用一根骨试写 + 回读自检；失败则改用 Figure Mode 手动/`copyPosture`+`pastePosture` 路线 |
| 约束改指向的可行性因类型而异 | `Position_Constraint` / `Orientation_Constraint` 可由脚本重建（`scripts/05` 已证实 `appendTarget` 可用）；`LookAt`/`Link` 等逐个核对，必要时删除重建并**重算 offset** |
| 参数线里写死了距离/阈值 | 按新 Biped 段长逐条重写；门槛 = 两段总长一半 |
| 环 / pole / IK 中点形成循环依赖 | 先画依赖方向图（P1），保持单向；重挂父级时保留 pole 世界变换 |
| 双驱动（两套 IK 驱同一轨道） | 同一变换轨道只保留一套；迁移完成后确认新 Biped 是唯一手柄 |
| 假设"结构与 Seven 一致" | P0/P3 复核：脊柱 3、颈 1、每手 5 指 ×3；不一致则相关控制器需加权规则（如 Quinn 的 3 段对 5 段） |
| Biped 无法表达的部位 | `lowerarm_twist_01`（ForeTwist 或 50% 规则）、`Root`（静止根）；残差如实记录 |
| 求解器差异 | 四条肢体 solver 可能不同（右腿 `IKHISolver`、其余 `IKLimb`），逐条核对，不假设相同 |
| Figure Mode 是全结构修改 | 只改**新建的** Biped；Seven 全程只读 |
| 已摆姿势/已烘动画 | 比例变化会使旧姿势失真，需重摆或重烘；必要时用 Biped 自带 `setRetargetRefBip` / `RetargetToReferenceBiped` |

---

## 7. 交付物与文件命名

| 阶段 | 文件 |
|---|---|
| P0 检查点 | `Stan01_BIPbuild_<yyyymmdd>.max` |
| P5 拟合完成 | `Stan01_BIPbuild_fitted_<yyyymmdd>.max` |
| P6 驱动层完成 | `Stan01_BIPbuild_driven_<yyyymmdd>.max` |
| P7 控制器迁移完成 | `Stan01_BIPbuild_ctrl_<yyyymmdd>.max` |
| P9 出口 | `Stan_UE_<yyyymmdd>.fbx`（bake 后） |
| 报告 | 每阶段 GATE 输出 + 试动数值 + 目视截图路径 |

**只读保留**：`Stan01.max`（原目标）、`Stan01_backup_before_seven_migration_20261015.max`、`Stan_SevenNative_Body_Prototype_20261015.max`（路线 1 成品，可作对照）。

---

## 8. 开工前置清单

- [ ] 确认里程碑文件名与存放路径；`Stan01.max` 保持只读
- [ ] 在副本上验证 `biped.setTransform` 参数签名 + 回读自检
- [ ] 跑完 P1 的依赖图采集，确认身体/表情分界（不按层名）
- [ ] 确认新 Biped 结构节数与 Seven 一致（脊柱 3 / 颈 1 / 每手 5 指 ×3）
- [ ] 确认扭转骨规则（ForeTwist 还是前臂 50%）
- [ ] 确认是否包含 `Root` 层（Weapon 挂点 + 相机）
- [ ] 选定单腿试点（建议 LEFT LEG）
- [ ] 记录当前帧、auto-key 状态、目标骨静止世界变换与缩放

---

## 9. 参考

**文档与留档**
- 一次跑通手册（**唯一权威**）：[quick-runbook.md](quick-runbook.md)
- 规范：[biped-rebuild-guide.md](biped-rebuild-guide.md)（阶段 0–3）、[controller-migration-guide.md](controller-migration-guide.md)（阶段 4–9）
- 命名三步配方（126 前缀）：控制器指南 §2 步骤 2（已内联）
- 历史留档（已迁入本包）：[references/seven-stan.md](references/seven-stan.md)（路线 2 故障复盘）、[references/seven-quinn.md](references/seven-quinn.md)（Seven→Quinn 原型）
- 原技能 `3dsmax-rig-controller-transfer` **已于 2026-10-16 移除**（其 `S7_*` 驱动点架构与本案例验证过的路线 1 冲突）；其 `scripts/01/04/05/06` 与 `recipe.md` **不迁入**，留档在 `E:\AI\3dMax\3dsmax-mcp-master\.agents\skills\3dsmax-rig-controller-transfer\`（只作追溯，勿按它执行）

**本轮实测（可复核）**
- Seven：818 对象 / `bip001*`=71 / IK 链 4 / FBX 层 58 / 35 层 / frame 0 / range 0–12800
- Seven 层构成：`控制器`=60（Circle, Point）、`辅助`=83（Point, SplineShape, ExposeTm, IK_Chain_Object）、`NUB`=18、`Root`=10
- Stan：59 对象 / 无 Biped / 蒙皮 `Body`=54、`Face`=3、`Eye`=1、`Hair`=1；磁盘 hash 与备份一致
- 骨长：臂 Seven `18.3378 / 23.2822` vs Stan `19.7845 / 20.6696`；腿 Seven `36.5735 / 43.9204` vs Stan `35.3003 / 45.3890`
- Biped API 可用性：`biped.getTransform <bip> #pos`（2 参数）、`biped.getNode <bip> <i>`、Biped 骨 `.transform` 可读；`biped.setTransform` / `createNew` / `saveFigFile` / `loadFigFile` / `copyPosture` / `pastePosture` / `setRetargetRefBip` / `RetargetToReferenceBiped` / `zeroTwist` / `smoothTwist` 存在（写接口签名待验证）

---

## 10. 进度记录（执行中）

### 10.1 P0 检查点 ✅（2026-10-16 12:32）

- 里程碑文件：`E:\AI\3dMax\Save\Stan01_BIPbuild_20261016.max`（10.91 MB）。`saveMaxFile` 成功后**工作文件名已切到该里程碑**；`Stan01.max` 与备份均为只读、hash 未变。
- `manage_scene(hold)` 已在 Stan 实例上建立（回退点）。
- 记录：`frame=0`、`range 0–16000`、`fps=30`、`selection=0`、`dirty=false`。**Auto Key 状态读不到**（`maxOps.autoKey` 不存在；`animate.autoKey` 是语法保留字）→ 后续试动改成"检查是否新增关键帧"来验证。
- 坑（已记录）：场景目录是 `E:\AI\3dMax\Save\`；`E:\3dMax\Save\` **不存在**（MAXScript `doesFileExist` 返回 false）。`saveMaxFile` 遇到不存在目录时**返回 false 而不抛异常** → 保存后必须同时校验返回值与 `doesFileExist`。
- 清理：诊断期间写出的探针文件已删除。

### 10.2 P1 依赖图（实测，非按名字猜）✅ 主体完成

```
Biped 骨（bip001*）                     ← 动画师打键 / 用 BIP 摆姿势（唯一主控）
   │ 58 条约束的目标 = bip001* 骨（约束拥有者 = Point 辅助 / 扭转辅助 / ExposeTransform）
   ▼
Point 跟随层（Point012/014/034/036/042/049…）
   └─ Circle*（这些 Point 的子级，随 Biped 移动；同时是动画师手柄）
         │ 124 条约束的目标 = Circle*/Point*（约束拥有者 = dummy 骨）
         ▼
dummy 骨（Seven 的 UE 命名骨架）
         │ Skin（Seven_body = 52 根 dummy 骨、0 根 Biped 骨；脸/眼 = 95 dummy + 面部件）
         ▼
       网格
```

已实测的 dummy ← 控制器对应（位置/旋转）：

| dummy | 位置 ← | 旋转 ← |
|---|---|---|
| `upperarm_l` | `Circle018` | `Circle023` |
| `lowerarm_l` | `Circle020` | `Circle024` |
| `hand_l` | `Circle019` | `Circle019` |
| `thigh_l` | `Circle011` | `Circle014` |
| `calf_l` | `Circle014` | `Circle012` |
| `foot_l` | `Circle012` | `Circle012` |
| `pelvis` | `Circle005` | `Circle008` |
| `spine_02` | `Point001` | `Point001` |

IK 链（控制器类均为 `IKChainControl`，链的关节就是 Point）：

| 链 | 起点 → 中间 → 末端 |
|---|---|
| `IK Chain001` | `Point022` → `Point023` → `Point024`（右腿） |
| `IK Chain007` | `Point025` → `Point026` → `Point027`（左腿） |
| `IK Chain005` | `Point044` → `Point045` → `Point046`（右臂） |
| `IK Chain006` | `Point031` → `Point032` → `Point033`（左臂） |

极向点：`Point158` / `Point159`（肘）、`Point038` / `Point039`（膝），均在 `控制器` 层。

**工作量量化**（穷举全场景位置/旋转列表的约束目标）：指向 `bip001*` 的 **58 条**、指向 `Circle*` 的 **124 条**、指向 `Point*` 的 4 条、其他 17 条。
→ **58 条就是"新 Biped 建好后必须重挂"的清单**；124 条（dummy ← Circle）只要 Circle 层随新 Biped 走就无需改动。

**Biped 自身**：`bip001 L UpperArm` 的 `BipPositionList`/`BipRotationList`/`BipScaleList` 内只有 `Available` + `Weights`（**无外部约束**），`get_wired_params` 为空 → Biped 是主控，不被他物驱动。

**读法备忘**（踩过的坑）：
- 约束目标：`(getSubAnim <list> 2).getNode 1` —— `getSubAnim` 返回 **SubAnim 包装**（`classof` = `SubAnim`），不能用类名过滤；`.target` / `.numTargets` 不存在。
- IK 链关节：`<ikChainNode>.transform.controller.startJoint / .endJoint`（中间关节 = `endJoint.parent`）；节点本身没有这些属性。

### 10.3 P1 未决项（下一轮解决）

1. **4 条外部 IK 链到底驱动什么**：关节 Point 没有任何约束依赖者；`IKChainControl` 的 goal 读不到（`.goal` → ERR）。
   → 用**受控试动**判定（分别移动 Circle / Biped 骨 / IK 关节，看谁跟随），脚本内置复位 + 复位误差校验。
2. 试动位置建议：在**新建 Biped 的 Stan 场景**里做，不要在 Seven 模板上留关键帧。Seven 的 `控制器` 层 0 个带动画对象（移动 Circle 安全），`bip` 层 53 个带动画对象（**不要随意移动 Biped 骨**，除非先确认 Auto Key 关闭）。

### 10.4 P3 新建 Biped ✅（2026-10-16 12:52）

- 创建：`biped.createNew 3 1 [0,0,0]` —— **签名是 3 个参数，第 3 个是 Point3 位置**；参数 1/2 不是结构节数。脚本创建出来的是**最小结构**（spine=4 / neck=1 / fingers=1×1 / toes=3），**不能**靠 `createNew` 指定手指与节数。
- **结构设置的关键路径**：结构参数在 **Biped 控制器**上，不在节点或基础对象上（`getPropNames` 对 node/baseobject 都是空）。`r.controller`（类 `Vertical_Horizontal_Turn`）暴露 `spineLinks / neckLinks / legLinks / fingers / fingerLinks / toes / toeLinks / ponytail1Links / ponytail2Links / tailLinks / upperarmTwistLinks / forearmTwistLinks / thighTwistLinks / calfTwistLinks / triangleNeck …`（共 96 个属性），以及 `figureMode`。
  做法：`c.figureMode = true` → `setProperty c "<属性名>" <值>` 逐项赋值 → `c.figureMode = false` → 读回校验。
- 实测 Seven 的目标结构：`spine=3, neck=1, legLinks=3, fingers=5, fingerLinks=3, toes=1, toeLinks=1, forearmTwist=2`；`upperarmTwist / thighTwist / calfTwist / ponytail1 / ponytail2 / tail = 0`。
- 结果：新 Biped `bip001`，结构读回与 Seven 一致，**对象数 71**（与 Seven 的 `bip001*` 71 完全相同；手指对象 40、`ForeTwist` 4）。
- 改名 + 分层：71 个对象由 `Bip001*` 改为 `bip001*`，全部移入 `BIP不导出` 层（`LayerManager.getLayerFromName("BIP不导出").addNode <node>` 可用）。
- **Figure Mode 下可以用普通 `move` 移动 Biped 骨**（实测 delta=2.0、复位误差 0.0）→ **P4 拟合不需要 `biped.setTransform`**。
- `biped.setTransform`：**恰好 4 个参数**（第 3 个 = 变换类型、第 4 个 = Boolean；值的传法未定）。已知不需要它，暂不深究。
- `biped.saveFigFile`：需要 Figure Mode 之外的模式，脚本调用报 "Cannot run the operation in this mode" → 未走通，也不需要。
- 场景状态：130 对象（59 原始 + 71 Biped）、`frame=0`、`bip001` 位于 `BIP不导出` 层。
- 里程碑：`Stan01_BIPbuild_biped_20261016.max`（11.59 MB，工作文件名已切到它）。

**P4 下一步**：在 Figure Mode 里逐骨把 `bip001*` 拟合到 Stan 的 UE 骨（52 根可 1:1；`Toe0↔ball`、`Finger0..4↔thumb..pinky` 已用坐标确认），逐骨校验位置误差与段长误差 ≤ 1e-3。

### 10.5 P4 拟合：尝试 1 失败 → 机制查明（2026-10-16 13:0x）

**尝试 1（失败）**：Figure Mode 下对 51 根骨逐骨 `rotate`（对齐朝向）+ `move`（移到目标关节位置）。
结果：`pairs=51 fails=0`，但 `maxErr=79.84`（worst=`foot_l`）、**34/51 超过 1e-3**，而且 Biped 骨长整体塌陷：`ua-la=0.4337`、`la-hd=0.4337`、`th-cf=0.7229`、`cf-ft=0.7229`（目标应为 `19.7845 / 20.6696 / 35.3003 / 45.3890`）。

**原因**：Biped 的 figure 是**连通链**，关节不能独立摆位；逐骨绝对 `move` 会把父骨长度一起拉坏。实测 pH：`pelvis` 根本不能 `move`（误差保持 92.1），必须移动**根** `bip001` 才能定位整个 figure（移动根后 pelvis 误差 **0.0**）。

**正确的写入机制（实测）**：
| 目的 | 可用写法 | 实测证据 |
|---|---|---|
| 定位整个 figure | Figure Mode 下 `move <bip001 根>` | pelvis 跟随，误差 0.0 |
| 改**骨长** | Figure Mode 下 `coordsys local ( scale <骨> [ratio,1,1] )` | `bip001 L Forearm` 缩放 2× → 长度 0.4337→0.8675；再 0.5× 精确复原 |
| 改**朝向** | `rotate <骨> (目标朝向 × inverse 当前朝向)` | 关节可对齐（但需与"指向目标子关节"一致才保证落点） |

即 Biped 的骨长沿**局部 X** —— 与 `scripts/04` 对普通骨用的 `x_position` 是同一约定。

**修正后的拟合算法（下一步实现）**，按层级顺序（pelvis→spine→neck/head→clavicle→upperarm→forearm→hand→fingers→thigh→calf→foot→toe）：
1. 每根骨的关节位置由父骨的"长度 + 朝向"决定（从根/pelvis 归纳成立），因此**不要**逐骨 `move`；
2. 用**目标子关节方向**对齐骨轴（不依赖对方骨架的轴向约定）；子关节分叉或缺失的骨（`hand` 分叉、`head`、指/趾尖）改用目标骨**朝向**；
3. 用 `scale`（局部 X）把长度设为目标段长（子关节距离）；
4. 逐骨校验位置误差 ≤ 1e-3，并复核四条肢体的段长。

**当前状态**：Biped figure 已被尝试 1 破坏（骨长 0.43 量级）。干净状态保存在里程碑 `Stan01_BIPbuild_biped_20261016.max` 中；修正算法会显式设长度，可直接在被破坏的 figure 上重建。若要从里程碑重新载入（会替换当前场景），需你确认。

### 10.6 P4 诊断：纯链条拟合的边界（2026-10-16 13:1x）

第二次拟合（52 对，先用根定位 pelvis，再逐骨"指向目标子关节 + 按目标段长缩放局部 X"）：
`pairs=52 fails=0`、`pelErr=0.0`、**四条肢长全部正确**（`19.7845 / 20.6696 / 35.3003 / 45.3890`），但位置误差 `maxErr=78.13`（worst=`ball_l`）、51/52 超过 1e-3。

逐骨误差把漂移点定位出来：

| 骨 | 误差 | 结论 |
|---|---|---|
| `pelvis` | 0.000 | 根定位正确 |
| `spine_01 / spine_02 / spine_03` | 0.008 / 0.007 / 0.007 | **脊柱链完全正确** |
| `neck_01 / head` | 19.367 / 19.367 | 断在 neck |
| `clavicle_l` | 20.040 | 断在 clavicle |
| `upperarm_l / lowerarm_l / hand_l` | 28.54 / 28.54 / 28.56 | 随 clavicle 漂移 |
| `thigh_l / calf_l / foot_l` | 8.18 / 8.19 / 9.68 | 腿同样断在 骨盆→大腿 |
| `ball_l` | 78.133 | 末端累积 |

**原因**：`neck`、`clavicle`、`thigh` 这类骨在 Biped 里是**带独立附着偏移**挂在父骨上的（并不在父骨末端），因此"父骨长度 + 朝向"推不出它们的关节位置；纯链条拟合对它们无效。

**下一步修法**：照技能 `scripts/04` 的思路做**迭代拟合**（3–5 轮）：每轮先按层级顺序做"指向 + 段长"，再对仍有位置残差的骨做一次平移修正（平移会改动父骨长度，因此下一轮必须重设段长），按阈值收口；把 `neck / clavicle / thigh` 的附着偏移当作可优化量。验收仍按 §5 的位置误差 ≤1e-3。

### 10.7 P4 三次尝试的结论：Figure Mode 的脚本化编辑面不完整（2026-10-16 13:2x）

| 操作 | 实测行为 | 结论 |
|---|---|---|
| `move <根 bip001>` | pelvis 精确跟随（误差 0.0） | ✅ 定位整个 figure 的唯一可靠手段 |
| `coordsys local ( scale <骨> [r,1,1] )` | 骨长按 ratio 精确变化（0.4337→0.8675，反向复原） | ✅ 设**长度**可靠 |
| `move <普通骨>` | 对 **32/52 根骨完全无效**（三轮 `p1=p2=p3=16.8767`）；对 pelvis 无效；对 clavicle / 手指有效 | ❌ 关节位置不能自由摆 |
| `rotate <骨> <quat>` | 有效但**不按世界坐标系**：给 20° 只转了 16.93°；`coordsys world` 包住后仍不收敛（20.90→17.23，44/52 超阈） | ⚠️ 朝向设定不可靠 |
| 惰性求值 | 改动后立刻读值会拿到旧值（第一次读 0.0000，第二次才 16.93） | 必须 `redrawViews()` 并二次读值 |
| `biped.setTransform` | 恰好 4 个参数，类型检查显示：arg3 = **变换类型**、arg4 = **Boolean**；传 Point3 → "convert to Boolean" 失败；传 matrix3 或把矩阵放 arg3 → "Unknown transform type, unsupplied"；传 5 个参数 → "wanted 4, got 5" | ❌ **没有传值的位置**，签名未破解 |

**当前 P4 状态**：三次尝试后 `maxErr` 从 78 降到 16.9 但**不收敛**（44/52 仍超 1e-3）；四条肢体的**长度全部正确**（`19.7845 / 20.6696 / 35.3003 / 45.3890`），**关节方向**无法通过脚本可靠设定。

**可选出路（需要拍板）**：
1. **继续破解 `biped.setTransform`**：按 `type × boolean` 做一个探测矩阵（它可能"从节点当前变换取值写入 figure"，需要先在 helper 上摆好值），不确定但值得一试；
2. **改用现成的 FBX→Biped 工具**（你之前提的"一键绑定 FBX 转 BIP"那类），它内部必然用了正确的 API —— 如果有安装包/脚本路径，我直接接上；
3. **UI 辅助**：在 Figure Mode 里由人做一次性拟合（我把 52 根的映射表和逐骨目标坐标导出成清单，照着摆），之后所有后续步骤由脚本完成；
4. **换路线**：不拟合 Biped，改为把 Seven 的控制层直接接到 Stan 的 UE 骨（技能里的路线 2），或沿用已验证的"Seven Biped 作驱动层"原型（保留比例不匹配的视觉差异）。

### 10.8 P4 突破：正确的 Biped API（2026-10-16 13:4x，采用现成工具路线）

按"用现成 FBX→Biped 工具"的决定，检索到开源工具 **BsKeyTools**（MIT，`https://github.com/AniBullet/BsKeyTools`，MAXScript，2026-10 仍在更新）。机器上没有安装，于是把相关脚本下载到本地 `E:\AI\3dMax\_toolcheck\`（`BsRetargetTools.ms` / `BsBipedTools.ms` / `cstools.ms`）并读源码，**从里拿到了此前一直没破解的 API**：

```maxscript
bipRoot.transform.controller.figureMode = true           -- 进入形体模式
biped.setTransform <骨节点> #pos      <point3> <bool>    -- 位置
biped.setTransform <骨节点> #rotation <quat>   <bool>    -- 旋转
biped.setTransform <骨节点> #scale    <point3> <bool>    -- 缩放/长度（X = 骨长）
in coordsys world ( biped.setTransform ... )             -- 世界坐标前缀
biped.setTransform bipRoot.transform.controller.rootNode #pos <p3> false   -- 根骨
```

**纠正了我之前的三个错误假设**：① 第一个参数是**骨节点**而不是 Biped 根；② 第 3 个参数是**值**、第 4 个 Boolean 是 **figure/motion 标志**（`true` 改 figure，`false` 打关键帧）；③ 之前"参数个数/类型"报错全部由此解释。

**用它做一遍拟合的实测结果**：`maxErr` 16.9 → **12.766**，超阈骨 44 → **13/52**；四条肢体长度保持正确（`19.7845 / 20.6696 / 35.3003 / 45.3890`）。

**剩余 13 根骨集中在肢体根部**，且多轮迭代不再改善：

| 骨 | 误差 |
|---|---|
| `upperarm_l` / `upperarm_r` | 12.77 / 12.34 |
| `lowerarm_l` / `lowerarm_r` | 6.99 / 6.57 |
| `hand_l` / `hand_r` | 4.57 / 3.56 |
| `thigh_l` / `thigh_r` | 8.03 / 8.03 |
| `calf_l` / `calf_r` | 4.55 / 4.55 |
| `foot_l` / `foot_r` | 4.89 / 4.88 |
| `spine_03` | 0.01 |

→ 误差沿链递减（根最远、末端渐近），说明**肢根的朝向/附着偏移没设对**：`thigh` 差 8.03 ≈ Stan 大腿相对骨盆的横向偏移 8.18，说明 Biped 的"腿附着偏移"仍是 0；`upperarm` 差 12.77 对应 `clavicle` 朝向差约 74°。

**待确认（下一步）**：`#rotation`/`#pos` 的**坐标空间与布尔语义**。实测：传世界旋转（`in coordsys world`）→ 与目标夹角 73.8°→**93.1°**（更远）；传"相对父骨的局部旋转"→ **111.7°**（也不对）。下一步读源码里这些调用**前后的上下文**（`BsRetargetTools.ms` 约 2150–2200、2600–2720、3690–3710 行，文件已在本地）确定约定，再完成拟合。

**当前状态**：内存里的 figure 是实验后的脏状态（含此前破坏）；干净的新 Biped 仍在 `Stan01_BIPbuild_biped_20261016.max`。Stan 窗口已按要求显示 BIP（`BIP不导出` 层打开，`PrinceofStan` 网格层临时隐藏）。

### 10.9 P4 关键结论：Biped figure 不能"逐骨绝对对位"（2026-10-16 13:1x）

**两个成功点**：
1. **朝向可精确求解**：不动点迭代 `q ← (target × inverse(current)) × q` + `biped.setTransform <骨> #rotation q false`，5 步收敛实测 `70.2° → 18.2° → 5.3° → 0.2° → 0.0°`；对 52 根骨全部求解后**最大朝向残差 0.056°** ✓。
2. **段长可精确设置**（`coordsys local scale` 或 `#scale`）：四条肢体长度精确 ✓。

**但位置无法组合**（这是本次的硬结论）：
- 只设 52 根骨的旋转后，整条链被推到 **416 单位**之外（除骨盆外全部偏移）✗ → 逐骨设置不会"各就各位"；
- 大腿 `#pos` **完全无效**（8 次迭代恒 8.03）→ 髋偏移由骨盆几何决定，而骨盆 `#scale [16.36,1,1]` 只把髋偏移 0.14 → 0.50 ✗ → **绝对对位不可达**。

**BsKeyTools 的真实做法（读 `AlignBipToFaux` / `FixLimb`）**：**按比例近似拟合**，不是逐骨绝对对位：
- 根节点 `#pos`（左右大腿中点）+ `#rotation`；骨盆（index 2）跳过，由根驱动；
- 脊椎/颈/头/肩/手指/脚趾：figure 模式下 `#pos` + `#rotation`；
- 上臂/前臂/大腿/小腿：**只设 `#rotation`**；手/脚末端用 `FixLimb`（5° 步进暴力搜索角度）；
- 尺寸只用少量 `#scale`：骨盆 `[legLen,legLen,legLen]`、脚 `[..]`。

**结论**：这条路能达到"**看起来差不多**"（朝向/段长精确、肢根偏差数单位），但**达不到逐骨 ≤1e-3 的绝对对位**——Biped 与 UE 骨架在"锁骨挂在 Neck 下、髋附着偏移由骨盆几何决定"这两点上结构不同，属于 Biped 的固有约束。

**场景恢复二选一**：① 从 `Stan01_BIPbuild_biped_20261016.max` 重新载入（会替换当前场景，需确认）；② 删掉 Biped 用已知配方重建（`createNew 3 1 [0,0,0]` → 结构参数 → 改名 → 分层）。

### 10.10 P4 完成：比例近似拟合达标（2026-10-16 13:2x）

按你选的方案（自己实现 BsKeyTools 的比例近似 + 用已验证的收敛解法）执行，**结果达标**：

| 指标 | 结果 |
|---|---|
| 朝向残差（52 根） | **max 0.040°** ✓ |
| 位置残差 >1.0 的骨 | **6/52**（只有双腿 `thigh/calf/foot` 左右各 7.7） |
| 其余 46 根（骨盆/脊柱/颈/头/锁骨/上臂/前臂/手/15×2 手指/脚趾） | **≤1.0** ✓ |
| 四条肢长 | `19.784 / 20.670 / 35.300 / 45.389`（精确）✓ |

**实现要点（最终可复用配方）**：
1. `bipRoot.transform.controller.rootNode` 用 `#pos`（左右大腿中点）+ `#rotation`（骨盆朝向）定位整体；
2. **骨盆 `#scale` 必须复位**：实测一次误设 `#scale [16.36,1,1]` 会把骨盆拉长，导致上半身整体漂移 **416 单位** —— 这就是之前"旋转全对但位置全错"的真凶；
3. 每轮 = ① 逐骨 `coordsys local scale` 设段长 → ② 逐骨 `#rotation` 不动点求解（`q ← (target × inverse(current)) × q`，5 步内收敛到 <0.05°）→ ③ 对"可设位置"的骨（脊椎/颈/头/锁骨/手指/脚趾）用 `#pos` 不动点求解；共 3 轮。
4. **不可设位置的骨**：上臂/前臂/大腿/小腿/手/脚（`#pos` 对它们完全无效），其关节位置由父骨长度+朝向决定。

**剩余 7.7 单位偏差的成因（Biped 固有约束，不是错误）**：Biped 的髋附着点在骨盆中心附近（实测 ≈0.5），而 Stan 的大腿相对骨盆横向偏 **8.18**；骨盆 `#scale` 对该偏移几乎无影响（16.36 → 仅 0.14→0.50）。因此双腿骨骼整体内移 7.7（约为腿长的 10%，仍在腿内）——**这是 Biped 与 UE 骨架的结构差异，无法用脚本消除**。

**里程碑**：`E:\AI\3dMax\Save\Stan01_BIPbuild_fitted_20261016.max`（已保存并校验存在）✓
**下一步**：P6 驱动层（驱动点挂到新 Biped 骨上 + Position/Orientation 约束）→ P7 控制器迁移（58 条 Biped 目标约束改指、4 条 IK 链、极向点、参数线、ExposeTransform ×6）。

### 10.11 收尾：Biped figure 重建完成 + 驱动层漂移查清（2026-10-16 14:0x）

**本节结论取代 §10.5–§10.10 中"最小 figure 拟合"的旧结果。**

**做法（按参考 rig 的 figure 重建，再用自由的 Stan 骨架拟合）**：
1. 从**建 Biped 之前的里程碑**重来（`Stan01_BIPbuild_20261016.max`），先把 Stan 的 55 根骨原始静止读进全局 —— 这一步是必须的，因为驱动层一建，UE 骨的原始 `Position_XYZ` 控制器就被约束控制器替换，原始值永久丢失。
2. 建 Biped（`biped.createNew 3 1 [0,0,0]` → 结构 `3/1/5×3` + `toes=1/toeLinks=1/forearmTwist=2` → 改名 `bip001*`，71 对象）。
3. **载入 Seven 的 figure**（`saveFigFile`/`loadFigFile`，**必须 Figure Mode 内**）→ 粗细/髋比例一次到位。
4. 三轮拟合（长度=局部 X 缩放；朝向=不动点 `q←(target×inverse(current))×q`；位置=对可设位置的骨做不动点）。
   **实测：最大位置误差 0.04（0/52 超 1.0）、朝向 0.056°、肢长精确** ✓（旧方案是 7.77 / 6 根超阈）。
5. 重建驱动层：**驱动点一律"约束跟随"而不是挂父子**（Biped 骨带非均匀缩放，如骨盆 `[25.53,31.98,16.43]`；非均匀缩放父级下的子物体世界变换无法精确成立 → 旧方案漂移 1.2–2.0，漂移量与各轴缩放差成正比）。例外两处：`Root` 的驱动点挂到 `bip001`（scale `[1,1,1]`）；`lowerarm_twist_01_l/r` 挂到 `BIPDRV_lowerarm_l/r`（普通 Point，scale `[1,1,1]`）。
   **实测：`maxDummyVsRest=0.0398`（55 根全部）✓；驱动测试 根骨+5 → pelvis/head/foot 全 5.000、复位 0.00000** ✓。
6. 显示对齐：`boxMode`（Display as Box）按参考 rig **56/71** 设置；两个窗口视口统一为 `[Front][Standard*][Edged Faces]`；`BIP不导出` 层单独可见（隐藏父层会连带隐藏，需保留祖先链）。

**漂移问题的最终定性**（回答 10.10 末尾的待查项）：Biped 骨本身精确停在 Stan 原始静止（三根抽样骨 `boneVsRest=0.000` ✓，即拟合与持久化都没问题）；跑偏的是**驱动点**（UE 骨 ≡ 驱动点）。根因是"挂父子 + 非均匀缩放"，改用约束后消失 ✓。

**新里程碑**：`E:\AI\3dMax\Save\Stan01_BIPbuild_fitted_sevenfig_driver_v2_20261016.max`（拟合 0.04 / 约束式驱动层 / boxMode 对齐）✓

**完整可复用步骤与陷阱表**：见 [biped-rebuild-guide.md](biped-rebuild-guide.md)。

### 10.13 P7 控制器迁移完成（2026-10-16 14:0x）

**合并（技能路线 1 的三步配方）**：Hold → 给我们的 Dummy 骨架 + Biped 加 `TGT_`（126 个）→ `merge_from_file(Seven_Skin.max, duplicate_action="rename")`（818 对象）→ 给 Seven 的加 `SV_`、还原我们的名字（`srcPrefixed=126 / restored=126 / leftTmp=0`）。合并后 **1003 对象**：我们的 `bip001*`=71、Seven 的 `SV_bip001*`=71，**v2 驱动层 55 个驱动点完好** ✓。

**改指（P7 核心）**：
- **遍历修正**：控制器树必须用 `getSubAnim ctrl j`；用 `ctrl[j]` 会拿到 `SubAnim` 包装器、在列表控制器处断掉（实测第一遍只找到 12 条，真实是 59 条）。
- 实测：531 条约束目标里 **59 条指向 `SV_bip001*`**（owner 全是 `Point*`，每个两处 = 位置 + 方向）→ **59/59 全部改指到我们的 `bip001*`，failed=0** ✓，`remainingToSvBip=0` ✓。
- 其余引用（用 `refs.dependents` 逐骨查得，不依赖遍历）：
  - 2 条 `ExposeTm.exposeNode`（可直接赋值 ✓）；
  - 6 条 ExposeTm 的 **`Link_Constraint`**（Link 的写接口在本版本不可用：`getNumTargets()` 存在，但 `setNode` / `deleteTarget` / `.target` 全部报 unknown）→ 改为**位置 + 方向约束**指向对应骨（语义等价：让助手跟随该骨）；
  - `BIPRoot` 改挂到我们的 Biped 根（保持世界变换）；
  - `Line001` 改挂我们的根。
- **4 个极向点**（`Point038/039/158/159`）**保持独立**：Seven 的原有设计（文档记过"四个 pole 改挂 `BIPRoot` 并保留世界变换，使其独立可编辑"，避免"环→pole→IK→环"循环依赖）→ 它们不随 Biped 移动，属**预期行为**，不要强行挂到腿骨。

**验收（行为测试优先于引用图）**：动我们的 Biped 根 +5 →
- Stan 的 UE 骨 `pelvis` / `head` = **5.000**，复位 **0.00000** ✓；
- 迁移过来的控制器层：**138 个对象中 134 个跟随 5.00**，未跟随的仅那 4 个极向点（预期）✓；`worstRestore=0.00000` ✓。

**场景**：`Stan01_BIPbuild_controller_migrated_20261016.max`（1003 对象；可见 = BIP 58 + 控制器层 131 + 角色网格 4；Seven 的遗留层已**隐藏未删除**）。**Hold 仍停在合并前**，可一键 `fetch` 回退。
**下一步**：P8 导出闭合（姿势 → bake → FBX → UE）与 Seven 遗留层的最终处置（删除或保留为隐藏参考）。

### 10.14 P7 补完：控制器"驱动"路径（feature parity）（2026-10-16 14:1x）

**问题**：迁移后"动 Biped → 角色跟随"✓，但"**动控制器 → 角色不动**" ✗（用户实测发现）。

**在 Seven 现场取得的真值**（移动后精确复位 `0.00000`）：动 `Circle016` +5 →
- Seven 的 **Biped 手骨 = 0.000**（Biped 不被控制器反驱 ✗）
- Seven 的 **UE 骨 `hand_r` = 5.000** ✓✓

⇒ **Seven 的真实架构**（与 §1 的实测链一致，但方向要说清）：`Biped → Points(59 约束) → Circles(子级) → **UE 骨(124 约束)** → Skin`。
即 **UE 骨被约束在 Circles/Points 上** ⇒ 动控制器直接驱动 UE 骨 ✓；动 Biped 则经由 Points→Circles 传到 UE 骨 ✓✓。**两条路径都成立**。

**我们此前的差异**：Stan 的 UE 骨是用 **v2 驱动层**（直接跟 Biped）驱动的 ⇒ 只有 Biped 一条路径 ✗。

**补完做法**：
1. 遍历修正后的 `getSubAnim` 树读 Seven 侧 67 个 `SV_*` Dummy 的约束配置（54 个带约束）；
2. 逐个复制到 Stan 同名 UE 骨（目标 = 已迁移过来的 Circles/Points，保持 `relative=false` 语义）→ 替换驱动层约束；
3. **静止偏移修正**：以驱动点（`BIPDRV_*` = 我们 Biped 骨 = 原始静止）为基准，把每个约束目标平移相应偏移、多轮迭代（共享手柄取平均）→ 实测 `2.87 → 0.876 → 0.779`，超 0.2 的从 44 根降到 **1 根**（`spine_02=0.78`，共享手柄耦合的上限）。

**最终验收**（`Stan01_BIPbuild_controller_migrated_v2_20261016.max`，1003 对象）：

| 路径 | 实测 |
|---|---|
| 动 Biped 根 +5 | `pelvis/head/hand_r/foot_l` 全 **5.00**，复位 **0.00000** ✓ |
| 动 `Circle016` +5 | ~~`hand_r` = 2.500~~ → **已更正为 5.000**，复位 **0.00000** ✓（见下方更正） |
| 静止对齐 | 53/54 骨 ≤0.2，最大 0.779（`spine_02`）|

> **【更正，2026-10-16 14:2x】** 上表原写的 `hand_r = 2.500（双目标混合，与 Seven 同语义）` **是错的**。
> 2.500 是我们自己在驱动层上**追加**出来的第二个旋转目标造成的等权重混合（`obj.pos.controller = Constraint()` 在列表控制器里是**追加**，不是替换；`appendTarget` 同理）。
> 实测 Seven 现场：动 `Circle016` +5 → Seven 的 UE 骨 `hand_r` = **5.000**（1:1，不是 2.5）。删掉多余目标后我们同样得到 **5.000**。
> 正确做法不是"接受混合"，而是**照源 rig 逐骨复制旋转结构**（见 §10.15 / [控制器迁移指南](controller-migration-guide.md) §2 步骤 5）。

**遗留**：`spine_02` 的 0.78 残差（共享手柄无法同时满足多根骨，需手工微调手柄或加一根专用手柄）；4 个极向点按设计保持独立（§10.13）。










### 10.15 "抬起脚 问题很大" 的根因与修复（2026-10-16 14:2x）

**用户现象**：摆姿势时抬脚 → 大幅变形（此前还报过"扭曲了""一动控制器不驱动角色"）。

**取证**（都在 Stan 窗口 pid 61676 上实测，动前后精确复位）：

| 试验 | 修前实测 | 真值/参考 |
|---|---|---|
| 抬右脚 +10Z：`thigh_r` / `calf_r` 朝向差 | **29.2° / 29.7°** | Seven 同姿势 2.03° / 3.48° |
| 抬右脚 +10Z：`calf_r` 位置差 | **2.76** | Seven 同姿势 **0.0007** |
| 静止：`thigh_r` / `calf_r` 朝向差 | 1.76° / 3.36° | Seven 0.00° / 0.00° |
| 动 `Circle010`（脚环）+5Z | Biped 骨 0.000（设计如此）| Seven 同样 0.000 |

**根因三条（互相独立）**：

1. **辅助 IK 链段长还是 Seven 的骨长**：链 `Point0xx → Point0xx → Point0xx` 的段长 = 子关节冻结位置值 + 伸缩线偏移。
   实测源值腿 `36.61/43.96`、臂 `18.34/23.28`，而目标（Stan）骨长 `35.3003/45.3889`、`19.7845/20.6696`。
   静止时靠**肘膝环的固定补偿偏移**（`Circle013/014/017/020` 的"零位置 XYZ"= 2.56/2.56/4.64/4.64）凑对 ⇒ 链一弯曲补偿方向就错，膝/肘环漂 2.5–4.6 单位。
2. **UE 骨的旋转约束被写成"多目标 Orientation_Constraint 等权重混合"**（我们自己叠的 `BIPDRV_*` + 环，各 100）⇒ 结果是两个朝向的平均：静止差 ~3.4°，抬脚 +10 时两个目标互差 59°/30°，混合后差 **29.6°/14.8°**。
3. **`LookAt` 的上方向节点（`pickUpNode`）还指向 Seven 的骨**（`SV_bip001 R/L ForeTwist[1]`、`SV_bip001 Pelvis/Spine/Spine1`）⇒ 手臂一弯，前臂滚转错 **16.7°/23.0°**。

**修复步骤**（详见重建指南 §7）：
1. 逐肢把链段长按目标骨长重算（静止迭代 8×5 轮）：中关节误差 `2.56/2.56/4.64/4.64 → 0.0001/0.0097/0.0001/0.0143`；
2. 极向点在**弯姿势**（末端 +25Z）对齐到目标中关节平面（静止时平面退化，无法校）：弯姿势中关节误差腿 `0.053→0.0004`、臂 `0.226/0.959→0.020/0.020`；随后把肘膝环补偿偏移归零；
3. **逐骨 `copy` Seven 的旋转结构**（`rotation_list` = `[1] Euler_XYZ` + `[2] LookAt/Orientation` w50）到我们 55 根 UE 骨（`copied=55 failed=0`）；
4. 重指 `LookAt` 目标与 `pickUpNode`：上臂→肘环 `Circle017/020`、前臂→腕环 `Circle016/019`，`pickUpNode`→`bip001 R/L ForeTwist[1]`、`bip001 Pelvis/Spine/Spine1`（前臂误差 12.35°/10.20° → **0.390°/0.390°**）；
5. 两个 `lowerarm_twist_01_l/r` 改为单目标 `Orientation_Constraint → BIPDRV_lowerarm_l/r`（P0 真值：twist 与前臂同向）：**14.23°/12.50° → 0.04°/0.00°**；
6. `BIPRoot` 位置+方向约束由 `SV_Root`（Seven 的静态根 @ 原点）改指我们自己的 UE 根 `Root`（否则平移/旋转角色时极向点不跟 ⇒ 膝平面错）；
7. 脊柱辅助点 `Point001` 的 `Path_Constraint.percent` 由 Seven 的 `58.0769` 改到 `50.0` ⇒ `spine_02` 由 **1.55785 → 0.00168**（pending 项清掉）。

**修复后验收**（`Stan01_BIPbuild_ctrl_fixed_v8_20261016.max`，另存 v7 为中间检查点）：

| 状态 | 最大位置误差（55 骨 vs Biped） | 最大朝向误差 | 超门槛（r>1° 或 d>0.1） |
|---|---|---|---|
| 静止 | 0.041（`lowerarm_l`） | 0.76°（`Root`） | **0** |
| 右脚 +25Z | 0.056（`calf_r`） | 0.76° | **0** |
| 右手 +25Z | 0.234（`lowerarm_r`） | 0.77° | 2（<0.7°） |
| 根骨 +10Z | 0.020 | 0.76° | **0** |

复位误差 ≤1.2e-4；所有驱动测试（脚/手/根）都精确复位。

**仍未解决**：抬脚 10–35 时**大衣网格**在右髋/大腿外侧出现深色翻面（骨已数值对齐 ⇒ 属网格权重/衣料碰撞，不是控制器问题）。见 §10.16 待办。

### 10.16 待办（P8 之前）

> 通用流程与"为什么静止全对、一动就炸"的机制解释已单独成文：[controller-migration-guide.md](controller-migration-guide.md)（含差分验收门槛与陷阱表）。本节只留本案例收尾项。

1. 大衣翻面：确认是权重问题还是"腿穿出衣料"，再决定是否调权重/加衣料骨。
2. Seven 遗留层处置（`SV_*` 126 个 + Seven 的网格/面部层，均隐藏）：删除或保留为隐藏参考；删之前要确认我们这层**没有**任何 `SV_*` 引用（本轮已清掉 7 处 `LookAt.pickUpNode`、`BIPRoot`、2 个 `ExposeTransform005/006` 的 `localReferenceNode`）。
3. `Root`（UE 根）静止朝向残差 0.76°，量级很小，可在 P8 一并收掉。
4. `copy` 出来的控制器是否与 `SV_*` 共享子控制器（独立性）需在删 Seven 遗留前实测确认。
