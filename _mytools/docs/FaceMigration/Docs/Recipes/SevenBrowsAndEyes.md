# Seven 基础眉眼配方（28 个控制）

> 2026-11-06 核对：本文覆盖 28 个骨骼控制；眉毛 10 个、眼周点控 16 个保留历史测试数据，
> 上眼睑 2 个已同步旋转修正并通过当时数值复核，完整非线性与画面仍有边界；后续眼球和下巴组合的验证见当前角色记录。细节以 [眼睑诊断](../Troubleshooting/UpperEyelid.md) 为准。
> 已有映射可在不打开 Max 的情况下重建，但重建不等于验收通过；统一按 [验证规范](../Workflow/Validation.md) 检查。
> 新部位先读 [迁移指南](../Workflow/MigrationGuide.md)。脚本记录当前实现，正确性由源场景对照和验证证据决定。

---

本页记录早期眉眼基线，不是完整面部 Rig 的重建清单。完整目标与当前统计以 [Seven 角色记录](../../Characters/Seven/README.md) 为准；新角色按 [主流程](../Workflow/Build.md) 重新探测。

## 0. 资产与骨架

| 项 | 值 |
|---|---|
| Rig 资产 | `/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders` |
| 预览网格 | `/Game/_MyTest/Mouth/Mesh/Seven` |
| 骨架 | 149 根骨（`import_bones_from_skeletal_mesh` 全量导入） |
| 本文件覆盖的骨 | 眉毛：`meibu_L/R`、`Bone007`~`Bone012`；眼周：`Bone027`~`Bone045` 中表 2.1 列出的 16 根 |

## 1. 全局约定（所有控制器通用）

- **坐标系**：`UE = (Max.x, −Max.y, Max.z)`；X 左右、Y 前后、Z 上下。
- **空间**：骨骼目标读写 `GlobalSpace`（Rig/组件空间），控制值用 `LocalSpace`；`bInitial=True` 读初始值防漂移。
- **父级**：当前这批控制挂 `Root` 骨骼，以下坐标对应静止网格；跟随头部动画的空间组合尚需验证。
- **控制自身 scale**：必须 `(1,1,1)`，尺寸只走 `set_control_shape_transform`。
- **形状**：统一 `Box_Thick`（默认形状库 `/ControlRig/Controls/DefaultGizmoLibraryNormalized`）。
- **命名**：眉毛 `CTRL_BROW_*`、眼周 `CTRL_EYE_*`、上眼睑 `CTRL_EYE_LID_*`；脚本节点前缀相互隔离。
- **颜色**：整体/点控橙色 `(1.0, 0.42, 0.04)`；弯曲青色 `(0.15, 0.85, 1.0)`。
- **限值**：整体 ±10、点控 ±10、弯曲 ±2。

## 2. 控制总表（28 个；含 2 个待完整验收的眼睑控制）

表中“映射”描述目标行为；眉毛整体 Y 屏蔽已通过数值复核，见第 3 节。各表的“世界位置”均为 Rig/组件空间坐标。

| 控制 | 显示名 | 类型 | 限值 | 映射 | 世界位置（UE） | 驱动骨骼 |
|---|---|---|---|---|---|---|
| `CTRL_BROW_L` | 左眉整体 | POSITION | ±10 | X/Z × 0.5，Y 屏蔽 | `(4.0, 11.2, 161.2)` | `meibu_L` + `Bone007/008/009` |
| `CTRL_BROW_R` | 右眉整体 | POSITION | ±10 | X/Z × 0.5，Y 屏蔽 | `(-4.0, 11.2, 161.2)` | `meibu_R` + `Bone010/011/012` |
| `CTRL_BROW_L_IN` | 左眉内点 | POSITION | ±10 | 1:1 | `(1.178, 9.763, 161.442)` | `Bone008` |
| `CTRL_BROW_L_MID` | 左眉中点 | POSITION | ±10 | 1:1 | `(4.071, 9.009, 161.795)` | `Bone009` |
| `CTRL_BROW_L_OUT` | 左眉外点 | POSITION | ±10 | 1:1 | `(6.748, 7.371, 162.146)` | `Bone007` |
| `CTRL_BROW_R_IN` | 右眉内点 | POSITION | ±10 | 1:1 | `(-1.177, 9.763, 161.442)` | `Bone010` |
| `CTRL_BROW_R_MID` | 右眉中点 | POSITION | ±10 | 1:1 | `(-4.070, 9.009, 161.795)` | `Bone011` |
| `CTRL_BROW_R_OUT` | 右眉外点 | POSITION | ±10 | 1:1 | `(-6.748, 7.371, 162.146)` | `Bone012` |
| `CTRL_BROW_L_BEND` | 左眉弯曲 | POSITION | ±2 | Z 分量分段 | `(3.17631, 11.5447, 162.256)` | `Bone008/009/007` |
| `CTRL_BROW_R_BEND` | 右眉弯曲 | POSITION | ±2 | Z 分量分段 | `(-2.2336, 11.5447, 162.256)` | `Bone010/011/012` |

> 括号里“内/中/外”按各自眉毛从眉心到眉尾排列：左眉 内=`Bone008`、中=`Bone009`、外=`Bone007`；右眉 内=`Bone010`、中=`Bone011`、外=`Bone012`。

### 2.1 眼周点控（16 个）

| 控制 | 显示名 | 骨骼 | 世界位置（UE） | Max 来源 |
|---|---|---|---|---|
| `CTRL_EYE_R_CORNER_IN` | 右眼内眼角 | `Bone043` | `(-1.635, 8.018, 159.062)` | `zCircle083` |
| `CTRL_EYE_R_UP_IN` | 右眼上内 | `Bone027` | `(-2.335, 8.231, 159.183)` | `zCircle074` |
| `CTRL_EYE_R_UP_MID` | 右眼上中 | `Bone028` | `(-4.322, 8.263, 159.389)` | `zCircle075` |
| `CTRL_EYE_R_UP_OUT` | 右眼上外 | `Bone029` | `(-5.928, 7.268, 159.501)` | `zCircle076` |
| `CTRL_EYE_R_CORNER_OUT` | 右眼外眼角 | `Bone042` | `(-6.727, 6.340, 159.474)` | `zCircle082` |
| `CTRL_EYE_R_DOWN_OUT` | 右眼下外 | `Bone030` | `(-5.989, 6.863, 158.032)` | `zCircle077` |
| `CTRL_EYE_R_DOWN_MID` | 右眼下中 | `Bone031` | `(-4.278, 7.567, 157.347)` | `zCircle078` |
| `CTRL_EYE_R_DOWN_IN` | 右眼下内 | `Bone032` | `(-2.439, 7.895, 157.878)` | `zCircle079` |
| `CTRL_EYE_L_CORNER_IN` | 左眼内眼角 | `Bone044` | `(1.635, 8.018, 159.062)` | `zCircle084` |
| `CTRL_EYE_L_UP_IN` | 左眼上内 | `Bone036` | `(2.336, 8.231, 159.183)` | `zCircle068` |
| `CTRL_EYE_L_UP_MID` | 左眼上中 | `Bone037` | `(4.323, 8.263, 159.389)` | `zCircle069` |
| `CTRL_EYE_L_UP_OUT` | 左眼上外 | `Bone038` | `(5.928, 7.268, 159.501)` | `zCircle070` |
| `CTRL_EYE_L_CORNER_OUT` | 左眼外眼角 | `Bone045` | `(6.728, 6.341, 159.474)` | `zCircle085` |
| `CTRL_EYE_L_DOWN_OUT` | 左眼下外 | `Bone039` | `(5.990, 6.863, 158.032)` | `zCircle071` |
| `CTRL_EYE_L_DOWN_MID` | 左眼下中 | `Bone040` | `(4.278, 7.567, 157.347)` | `zCircle072` |
| `CTRL_EYE_L_DOWN_IN` | 左眼下内 | `Bone041` | `(2.439, 7.895, 157.877)` | `zCircle073` |

### 2.2 上眼皮闭合（2 个）

| 控制 | 显示名 | 骨骼 | 世界位置（UE） | Max 来源 |
|---|---|---|---|---|
| `CTRL_EYE_LID_R` | 右眼上眼皮 | `Bone027/028/029` | `(-4.14181, 9.81844, 160.624)` | `SYP_R001` |
| `CTRL_EYE_LID_L` | 左眼上眼皮 | `Bone036/037/038` | `(4.14179, 9.81847, 160.624)` | `SYP_L001` |

---

## 3. 配方 A：眉毛整体（左/右各一个）

**目标手感（Max 实测）**：拖一个扁平条，整条眉毛平移；X/Z 各 0.5 倍，Y 无效。

> 2026-11-06 已修复实现差异：`build_brow_two.py` 改为逐分量乘 `(0.5, 0, 0.5)`，Y 被屏蔽。
> 实测 `CTRL_BROW_L=(0,10,0)` → 本侧 4 骨全 `0`；X/Z 仍是 0.5。见下方自检表。
> 12:24 复核两侧各三轴 ±10，共 12 组输入；8 根眉骨的最大位置偏差小于 `1e-12 cm`。范围和原始数据见 [早期眉眼基线 Rig 复核](../../Characters/Seven/Evidence/control_rig_recheck_2026-11-06.json)。

| 项 | 值 |
|---|---|
| 类型 / 限值 | `POSITION` / ±10 |
| 形状 | `Box_Thick`，shape scale `(0.42, 0.22, 0.05)`，橙色 |
| 父级 | `Root` |
| 骨骼 | L：`meibu_L` + `Bone007/008/009`；R：`meibu_R` + `Bone010/011/012` |
| 系数 | X/Z 各 **0.5**；Y 逐分量乘 0（`(0.5, 0, 0.5)`） |

当前脚本的图（每根骨一条，串在 `Begin` 之后）：

```
GetControlVector(CTRL, LocalSpace)
  → VectorScale(Factor=1.0)                 -- 占位，保持节点名兼容
  → VectorMul(B=(0.5, 0, 0.5))              -- X/Z 各 0.5，Y 清零
GetTransform(bone, GlobalSpace, bInitial=True)
  .Transform.Translation → VectorAdd(B=偏移)
  .Transform.Rotation / .Transform.Scale3D
  → MathTransformMake(Translation, Rotation, Scale)
  → SetTransform(Item=bone, GlobalSpace, bInitial=False, Value, Weight=1, bPropagateToChildren=False)
```

节点前缀 `BROW_`：`BROW_CTRL_BROW_<L|R>_GET`、`_SCALE`、`_MASK`、每骨 `BROW_BT_/_VADD_/_MAKE_/_SET_`。

自检（实例化后骨骼世界位移）：

| 输入 | 左眉 4 骨 | 右眉 4 骨 |
|---|---|---|
| `CTRL_BROW_L=(10,0,0)` | 全 `+5 X` | `0` |
| `CTRL_BROW_L=(0,10,0)` | 全 `0`（Y 已屏蔽） | `0` |
| `CTRL_BROW_L=(0,0,10)` | 全 `+5 Z` | `0` |
| `CTRL_BROW_R=(10,0,0)` | `0` | 全 `+5 X` |
| `CTRL_BROW_R=(0,10,0)` | `0` | 全 `0`（Y 已屏蔽） |
| `CTRL_BROW_R=(0,0,10)` | `0` | 全 `+5 Z` |

脚本：`Tools/FaceMigration/Scripts/build_brow_two.py`（幂等）。

---

## 4. 配方 B：眉毛三点控（每侧三个）

**手感**：每根眉骨一个独立点控，拖动时该骨世界 1:1 跟随，点与点、左右互不影响。

| 项 | 值 |
|---|---|
| 类型 / 限值 | `POSITION` / ±10 |
| 形状 | `Box_Thick`，shape scale `(0.12, 0.10, 0.05)`，橙色 |
| 父级 | `Root` |
| 控制位置 | 对应骨骼的静止世界坐标（表见第 2 节） |
| 系数 | **1.0** |

图（接在整体控制的 `VADD` 之后，做向量相加）：

```
BROW_VADD_<骨>.Result ─┐
                       ├→ VectorAdd → BROW_MAKE_<骨>.Translation
BPT_<ctrl>_GET → SCALE ┘
```

节点前缀 `BPT_`：`BPT_<control>_GET`、`_SCALE`、`BPT_ADD_<bone>`。

自检：

| 输入 | 结果 |
|---|---|
| 任一点控 `(10,0,0)` / `(0,10,0)` / `(0,0,10)` | 只有对应骨 `10`，其余骨 `0` |
| 左侧点控 | 右侧骨全 `0`（反之亦然） |
| `CTRL_BROW_L=(10,0,0)` + `CTRL_BROW_L_IN=(0,0,10)` | `Bone008=(5,0,10)`，`Bone007/009=(5,0,0)` |

脚本：`Tools/FaceMigration/Scripts/build_brow_points.py`（幂等）。

---

## 5. 配方 C：眉毛弯曲（左/右各一个）

**手感**：拖一个点，眉毛三根骨按正/负方向分段弯曲；行程 ±2 cm。下列欧拉旋转数据保留自历史测试。

| 项 | 值 |
|---|---|
| 类型 / 限值 | `POSITION` / ±2 |
| 取值 | 控制向量的 **Z 分量** `c` |
| 形状 | `Box_Thick`，shape scale `(0.15, 0.10, 0.05)`，青色 |
| 父级 | `Root` |
| 位置 | L `(3.17631, 11.5447, 162.256)`；R `(-2.2336, 11.5447, 162.256)` |
| 依赖 | 接在 `BPT_ADD_<骨>` 之后 |

位置映射：

```
c > 0 : offset = (c/2)   × D_pos
c < 0 : offset = (−c/2)  × D_neg
旋转    : NewRot = Initial × Delta_local，当前脚本 Axis=(1,0,0)
          正分支角度 = −dEuler_pos × c/2
          负分支角度 = −dEuler_neg × (−c)/2
```

> 当前骨骼表中的 zoff 全为 0。脚本头部仍留有早期外移描述，以实际 BONES 数据为准。
> `Initial × Delta_local` 是局部旋转增量，不能称为通用的“世界 X 旋转”实现。现有眉毛朝向需按完整四元数重新验收，不能只比较欧拉 X；见 [验证规范](../Workflow/Validation.md)。

右眉数据（`D_pos` = y=+2 位移，`D_neg` = y=−2 位移，单位 cm / 度）：

| 骨 | `D_pos` | `D_neg` | `dEuler_pos` | `dEuler_neg` |
|---|---|---|---|---|
| `Bone010` | `(-0.01744, -0.19924, 0.3)` | `(0.08218, -0.20796, -0.5)` | `-9.1674` | `+11.4589` |
| `Bone011` | `(-0.18126, 0.08452, 0.8)` | `(0.29491, -0.31406, -0.62)` | `0` | `-3.4377` |
| `Bone012` | `(0, 0, 0.1)` | `(0, 0, -0.1)` | `+10.313` | `-4.5837` |

左眉数据：

| 骨 | `D_pos` | `D_neg` | `dEuler_pos` | `dEuler_neg` |
|---|---|---|---|---|
| `Bone007` | `(0, 0, 0.1)` | `(0, 0, -0.1)` | `-10.3132` | `+4.5837` |
| `Bone008` | `(0.01744, -0.19924, 0.3)` | `(-0.08219, -0.20795, -0.5)` | `+9.1673` | `-11.4591` |
| `Bone009` | `(0.18126, 0.08452, 0.8)` | `(-0.2949, -0.31406, -0.62)` | `0` | `+3.4378` |

图（共享 6 个节点 + 每骨 12 个）：

```
GET(GetControlVector) → DOT(向量点乘 (0,0,1)) → c
c → ISPOS(Greater 0) / HALF(c*0.5) / NHALF(c*-0.5) / ABS / HALFABS

每骨：
  POSMUL(Value=D_pos, Factor=HALF)   NEGMUL(Value=D_neg, Factor=NHALF)
  → SELPOS(Condition=ISPOS)
  → ADD1(A=BPT_ADD_<骨>, B=SELPOS)
  → ADD2(A=ADD1, B=ZOFF)            -- ZOFF 当前恒 0，仅为兼容保留
  → MAKE.Translation

  PANG(FloatMul: HALF × -dEuler_pos)  NANG(FloatMul: NHALF × -dEuler_neg)
  → SELANG → RAD(× deg2rad) → QUAT(Axis=(1,0,0))
  → QROT(QuatMul A=BT_Get.Rotation, B=QUAT) → MAKE.Rotation
```

> `ZOFF` / `ADD2` / `ABS` / `HALFABS` 是早期「z=-1 固定外移」留下的，现在值恒 0。
> 从零搭建时可以直接省掉这四个节点，`ADD1` 直连 `MAKE.Translation`。

节点前缀：右 `BB_`、左 `BBL_`。

自检（端点）：

| 输入 | 左眉 | 右眉 |
|---|---|---|
| `BEND=(0,0,2)` | `Bone007 (0,0,0.1)` / `Bone008 (0.0174,-0.1992,0.3)` / `Bone009 (0.1813,0.0845,0.8)`，旋转 `-10.313°/+9.167°/0` | `Bone010 (-0.0174,-0.1992,0.3)` / `Bone011 (-0.1812,0.0845,0.8)` / `Bone012 (0,0,0.1)`，旋转 `-9.167°/0/+10.313°` |
| `BEND=(0,0,-2)` | `(0,0,-0.1)` / `(-0.0822,-0.2079,-0.5)` / `(-0.2949,-0.3141,-0.62)`，旋转 `+4.584°/-11.459°/+3.438°` | `(0.0822,-0.2079,-0.5)` / `(0.2949,-0.3141,-0.62)` / `(0,0,-0.1)`，旋转 `+11.459°/-3.438°/-4.584°` |

脚本：`Tools/FaceMigration/Scripts/build_brow_bend.py`（右）、`Tools/FaceMigration/Scripts/build_brow_bend_left.py`（左）。

## 6. 配方 D：眼周点控（16 个）

**手感**：每根眼周骨一个独立点控，拖动时该骨世界 1:1 跟随，点与点、左右互不影响。

| 项 | 值 |
|---|---|
| 类型 / 限值 | `POSITION` / ±10 |
| 形状 | `Box_Thick`，shape scale `(0.12, 0.10, 0.05)`，绿色 `(0.20, 0.90, 0.50)` |
| 父级 | `Root` |
| 控制位置 | 对应骨骼的静止世界坐标（表见 2.1） |
| 系数 | **1.0** |

数据图：每根骨独立计算（不依赖眉毛的 `BROW_`/`BPT_` 数据节点）；SetTransform 必须接入完整执行链：

```
GetControlVector(EYE_CTRL, LocalSpace) → VectorScale(Factor=1.0)
GetTransform(bone, GlobalSpace, bInitial=True)
  .Transform.Translation → VectorAdd(B=偏移)
  .Transform.Rotation / .Transform.Scale3D
  → MathTransformMake → SetTransform(GlobalSpace, bInitial=False, bPropagateToChildren=False)
```

节点前缀 `EYE_`：`EYE_<control>_GET`、`_SCALE`、每骨 `EYE_BT_/_VADD_/_MAKE_/_SET_`。

自检：

| 输入 | 结果 |
|---|---|
| 任一眼控 `(10,0,0)` / `(0,10,0)` / `(0,0,10)` | 只有对应骨移动 `10`，其余 15 根骨 `0` |
| 左右眼控制 | 互不影响（已逐点验证） |

脚本：`Tools/FaceMigration/Scripts/build_eye_points.py`（幂等，重建 16 个控制 + `EYE_` 节点）。

> 眼周计算不依赖眉毛数据，但构建脚本从 `Begin` 接执行流时可能替换眉毛链入口。
> 两者共存时核对 `Begin → BROW_SET_* → EYE_SET_*` 全链；必要时先检查再运行 `fix_brow_exec.py`。

## 7. 配方 E：上眼皮闭合（驱动已修正，画面待验收）

控制 `CTRL_EYE_LID_R/L` 对应 Max 的 `SYP_R001/L001`。设置为 POSITION、X/Y 锁 0、Z ∈ [-10,0]；R/L 控制位置分别为 `(-4.14181,9.81844,160.624)` / `(4.14179,9.81847,160.624)`，紫色 Box_Thick，shape scale `(0.14,0.10,0.05)`。

目标骨骼：R=`Bone027/028/029`，L=`Bone036/037/038`。依赖配方 D 的 `EYE_VADD_*` / `EYE_BT_*`。

### 实现状态

| 实现 | 现状 |
|---|---|
| `Tools/FaceMigration/Scripts/build_eye_lid.py` | 已废弃的直线位置版本；重跑会恢复旧问题 |
| `Tools/FaceMigration/Scripts/build_eye_lid_arc.py` | 圆弧位置 + 世界旋转轴修正。11:37 同步早期眉眼基线 Rig，12:24 已在临时实例复核 54 条骨骼变换；画面未验收 |
| `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation` | 世界旋转轴修正对照副本；两侧 6 骨最大朝向误差 `0.394°`，位置拟合残差 `0.340 mm`，内眼角非线性未重建 |

旧版表格只验证端点位移和旋转角大小，把未转换到正确空间的轴当作世界轴，结论已被 2026-11-06 的完整朝向对照推翻，因此不再作为搭建或验收依据。

右眼中间骨 Bone028：**修正前**端点位置误差约 `0.005 mm`，朝向误差 `42.071°`。修正后两侧 6 骨最大朝向误差降到 `0.394°`；仍有最大 `0.340 mm` 的位置拟合误差和内眼角附加旋转误差。早期眉眼基线 Rig 已在 11:37 同步这组参数（当前 `SQUAT_Bone028.Axis = (-0.969233, -0.239952, 0.054870)`、`SANG = 0.207962`），与诊断副本一致。

Max 的真正驱动枢轴为右侧 `Point164`、左侧 `Point004`。它们在眼球中心，通过辅助节点与 Link_Constraint 驱动骨骼；眼球骨 `yanqiu_*` 的同位置不能证明它就是约束目标。内眼角 KPoint 还含额外表达式。准确方案、链路和采样数据见 [SYP_R001Diagnosis.md](../Troubleshooting/UpperEyelid.md)。

### 圆弧与旋转参数（2026-11-06 早期眉眼基线 Rig 实测）

位置用绕枢轴 `P` 的圆弧 + 径向缩放：

```
pos = P + R(orbit_axis, orbit_angle*s) * (t0 - P) * (1 + k1*s)      s = -ctrlZ / 10
```

旋转用 Rig/组件空间轴增量：`QROT = R(spin_axis, radians(spin_coefficient*d)) * Initial`。其中 `d = -13.5*ctrlZ`、`s = d/135`，`d` 是历史驱动参数，不能标为 UE 手柄厘米；系数单位为“度/驱动单位”，满行程为系数乘 135。上面位置公式的 `orbit_angle*s` 同样须从度转为弧度再构造四元数。此处不是直接把骨骼局部轴用作全局轴：

| 骨 | `orbit_axis`（位置） | `orbit_angle`（满行程°） | `k1` | `spin_axis`（旋转） | `spin_coefficient`（度/驱动单位） |
|---|---|---|---|---|---|
| `Bone027` | `(-0.981212, 0.189737, -0.034963)` | 17.1540 | 0.002113 | `(-0.474289, -0.879164, 0.046048)` | 0.109674 |
| `Bone028` | `(-0.961716, -0.267439, 0.059816)` | 28.0434 | 0.015207 | `(-0.969233, -0.239952, 0.054870)` | 0.207962 |
| `Bone029` | `(-0.725161, -0.627868, 0.282707)` | 19.5592 | -0.014193 | `(-0.969233, -0.239952, 0.054870)` | 0.207962 |
| `Bone036` | `(-0.981212, -0.189736, 0.034963)` | 17.1539 | 0.002120 | `(-0.474284, 0.879166, -0.046066)` | 0.109674 |
| `Bone037` | `(-0.961711, 0.267459, -0.059822)` | 28.0430 | 0.015217 | `(-0.969232, 0.239957, -0.054870)` | 0.207962 |
| `Bone038` | `(-0.725145, 0.627867, -0.282748)` | 19.5564 | -0.014200 | `(-0.969232, 0.239957, -0.054870)` | 0.207962 |

枢轴：右 `(-3.1503, 4.0862, 159.5584)`、左 `(3.1508, 4.0862, 159.5584)`（`Point164` / `Point004`）。
`Bone028/029` 与 `Bone037/038` 各共用同一根旋转轴；`Bone027/036` 的内眼角另有附加旋转轴，所以与位置公转轴不同。

### 参数与重建边界

- 归一化输入可写为 `s = -UE_ctrlZ/10`，对应 `s = -Max_SYP_localY/1.75`。
- 现有脚本的 `d=-ctrlZ*13.5`、`s=d/135` 是内部归一化路径；不能据此声称 Max 实际拖动 135 cm。
- 单侧限值只能阻止反向翻转，不能纠正有效范围内的旋转轴和枢轴错误。
- 世界旋转增量左乘、局部旋转增量右乘；增量本身先正确换空间。此前眼睑错误需要同步修正轴与角度，不能只交换乘法顺序。
- 当前圆弧前缀为 `LID_`，包含 `OQUAT/ROTV/VSC/VADD` 与 `SQUAT/QROT`；旧直线版本的 42 节点统计不适用。2026-11-06 资产读取为 86 个 LID 节点。
- `set_lid_single_side.py` 只改限值；`probe_lid_limits.py`、旧自检的实例层级有效性必须按 [验证规范](../Workflow/Validation.md) 补查。

本节保留控制接口和实现依赖，完整眼睑迁移仍待完成，不纳入“从零重建即得到正确效果”的承诺。

---

## 8. 搭建顺序与叠加关系

图里的累加顺序（从初始值出发）：

```
GetTransform(bInitial=True).Translation
  → +整体偏移（配方 A）
  → +点控偏移（配方 B）
  → +弯曲偏移（配方 C）
  → MAKE.Translation → SET
```

早期参考脚本的依赖为整体眉 → 三点眉 → 左右弯曲 → 眼周点 → 上眼皮。它们固定指向早期 `CR_Seven_MorphSliders`，不构成当前完整 Rig 的全量重建入口；脚本选择见 [工具索引](../Workflow/Tools.md)。当前完整 Rig 应增量修改，并保留后续嘴、眼球、下巴及 Morph 连接。

重建边界必须保留：

- 整体眉清理 `BROW_` 后，点控和弯曲依赖需要恢复；点控清理 `BPT_` 后，两侧弯曲需要恢复。
- 眼周点清理 `EYE_` 会影响 `LID_`、`LLID_` 及后续眼球联动接线；不能只补跑早期眉眼脚本就认为完整资产已恢复。
- `Begin → BROW_SET_meibu_L → … → BROW_SET_Bone012 → EYE_SET_Bone043 → …` 是早期执行链。修改后遍历当前整条链，避免入口被重新接到 EYE 而使眉毛悬空。
- 单参数 `break_link` 与旧测试实例有效性问题仍需在复用前适配；所谓幂等只描述本批清理，不保证其他部位和预览输入不受影响。
- 不运行废弃直线眼皮脚本 `build_eye_lid.py`。保留上眼皮近似的误差边界，参数见本页第 7 节。

## 9. Max 眉毛源控制的特殊值

这些细节解释源输入和旧版本边缘外飘问题，不是额外的手柄功能：

- 主动手柄为 zCircle，父级 KPoint 的位置表达式会驱动它。`zCircle049/050/048` 为左眉内/中/外，`051/052/053` 为右眉内/中/外；精确表见 [名称总表](../Reference/ControllerNames.md)。
- 右弯曲 `Animcraft_Right_Brow_Ctrl.position_list[2]`：X 锁 0、Y ±2，拖动后 Z 显示 −1；这个 Z 不进入骨骼驱动。手动给第 2 层整个向量赋值未必等价于实际拖动，不把早期 zoff 外移加入求解。
- 右侧中性 Max 世界位置：`Bone010=(-1.17773,-9.76263,161.442)`、`Bone011=(-4.07024,-9.00898,161.795)`、`Bone012=(-6.74794,-7.37118,162.146)`；历史 Euler X 均为 90°。动作系数见第 5 节。
- 左弯曲 `Animcraft_Left_Brow_Ctrl` 父级为 `Animcraft_Left_Brow_Z_Ctrl`；源手柄世界位置 `(3.17631,-11.5447,162.256)`、scale 约 +0.9426，实际拖动第 2 层 Z 保持 0，同样不加入固定外移。
- 左侧中性 Max 世界位置：`Bone007=(6.74793,-7.37117,162.146)`、`Bone008=(1.17773,-9.76263,161.442)`、`Bone009=(4.07027,-9.00897,161.795)`；历史 Euler X 均为 90°。
- 正负分支和左右系数分别采集，完整四元数仍需按验证规范核查，不能用这些历史 Euler 值替代朝向验收。

## 10. 验收清单

- [ ] 10 个眉毛控制全部存在，类型 `POSITION`，父级 `Root`。
- [ ] 16 个眼周控制全部存在，类型 `POSITION`，父级 `Root`。
- [ ] 上眼睑接口存在且单侧限值正确；单独对照完整位置/朝向与中间样本，完成内眼角修正和画面验收后才标记迁移完成。
- [ ] 形状全部 `Box_Thick`，控制 scale 全 `(1,1,1)`。
- [ ] 整体：X/Z `±10` → 本侧 4 骨各 `±5`，另一侧 0；Y `±10` → 全 0（逐分量乘 `(0.5,0,0.5)`，2026-11-06 已实现）。
- [ ] 眉点控：`±10` → 本骨 `±10`，其余 0。
- [ ] 眼控：`±10` → 对应骨 `±10`，其余 15 根眼骨 0。
- [ ] 弯曲：`±2` → 位移/旋转与第 5 节表一致。
- [ ] 平移叠加：整体 + 点控 + 弯曲的平移偏移按表求和；旋转与枢轴组合按源 Rig 顺序验证。
- [ ] 编译 `BS_UP_TO_DATE`、执行流可达、无重复前缀节点。12:24 快照：`BROW_` 38、`BPT_` 18、`BB_` 43、`BBL_` 43、`EYE_` 96、`LID_` 86，总计 330；24 个 BROW/EYE SetTransform 均从 Begin 可达。节点计数只用于发现结构变化。
- [ ] 场景里没有残留的探测值（弯曲控制回 0）。

## 11. 扩展部位

按 [主流程](../Workflow/Build.md) 写入该角色名称表、独立部位配方和验证证据；更新迁移配置与角色记录。本页仅维护 28 个眉眼基线，完整 72 项接口以角色表为准。

## 12. 已知边界

- 弯曲控制只响应 **Z 轴**拖动，X/Y 无效（与 Max 一致）。
- 左右弯曲的斜率**互相不镜像**（`D_pos/D_neg` 符号不同），不能直接套用一侧数据。
- 控制父级均为 Root；点控与弯曲的驱动目标是对应眉骨，不驱动 `meibu_*`，只有整体控制带 `meibu_*`。
- 本文件只覆盖眉毛、眼周与上眼皮的基础实现。当前完整面部 Rig 另有 [XYP 下眼皮](XYP_LowerLids.md)、[六个嘴唇控制](LipControls.md)、[左右脸颊](CheekControls.md)、[鼻子](NoseControl.md)、[左右嘴角与总嘴控](MouthControls.md)、[左右眼球](EyeballControls.md)、[双眼总控](GazeMasterControl.md)、[下巴整体](ChinControl.md)、[四整体表情滑块](ExpressionSliders.md)及[十二口型](PhonemeSliders.md)；各部位验证范围见专文。
- 眼周点控按每骨 1:1 实现；配方 E 的眼睑旋转已修正，仍有圆弧拟合残差、内眼角非线性和组合/画面验收待办。
- 上眼皮限值单侧：**X/Y 锁 0，Z ∈ [-10, 0]**；与 Max 的局部限位 `[-1.75,0]` 按归一化值对应，不能从脚本增益推断真实世界拖动距离。
- 四元数合成顺序取决于增量空间；当前眉毛脚本右乘局部增量，眼睑左乘全局增量。旧眼睑错误轴只保留在历史诊断记录中。
- KPoint 可以不作为 UE 可交互控制，但其表达式、父级枢轴及组合顺序必须迁移或等价求解，不能省略从动逻辑。
