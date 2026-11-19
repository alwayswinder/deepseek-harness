# 左右脸颊控制（2026-11-06）

已添加到 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，完成时为 **149 骨、38 控制、650 节点**。本页采样、计数和报告为该部位完成时的批次快照；当前完整资产见 [Seven 角色记录](../../Characters/Seven/README.md)。保留原有 36 个眉眼与嘴唇控制。2026-11-06 用户确认“效果没问题”，并指出蓝色轴方向相反；随后调整左右蓝色轴并补偿 Z 输入，原变形保持不变，数值和保存重载检查通过。

## 操作

| 显示名 | UE 控制 | Max 来源 |
|---|---|---|
| 右脸颊 | `CTRL_CHEEK_R` | `Animcraft_Right_Cheek_Ctrl` |
| 左脸颊 | `CTRL_CHEEK_L` | `Animcraft_Left_Cheek_Ctrl` |

两个手柄为黄色 `Box_Thick`，在左右脸颊源控制位置，父级为 `Root`。**局部 X/Z 均为 −10～10，局部 Y 锁为 0**。可在层级中按控制名选择，修改 Current Value 的 X/Z；拖动时使用局部坐标轴。0 为中性。

对应 Max 的 `position_list[2].X/Z`，源范围均为 `[-1,1]`。蓝轴修正后的关系为 **`Max X = UE local X/10`、`Max Z = -UE local Z/10`**。这里的局部 Z 不是世界竖直方向，两个有效轴主要在角色的水平面内。手柄相对初版绕自身 X 旋转 180°，蓝色 Z 反向；图中读取 Z 时同步乘 −1，因此沿相同世界方向拖动仍得到原来的变形。锁定的局部 Y 随旋转翻转，X 轴方向保持。

## 源驱动与联动

| 控制 | 受影响骨骼 |
|---|---|
| 右脸颊 | `lianjia_R`、`pingguoji_R`、`yandai2_R`、`xiabake_R`、`renzhong_R`、`Bone015` |
| 左脸颊 | `lianjia_L`、`pingguoji_L`、`yandai2_L`、`xiabake_L`、`renzhong_L`、`Bone014` |

源链为 `Animcraft_*_Cheek_Ctrl → KPoint 位置表达式 → zCircle → Link_Constraint → 导出骨`。本组输入只改变位置，不改变目标骨旋转、缩放或 Morpher 通道。

正负行程使用不同斜率，左右参数也分别实测。眼袋还有条件项：仅在表达式 `liandan.x >= 0` 时，右侧叠加负 Z 的贡献，左侧叠加正 Z 的贡献。`liandan` 读取整个 Position List，因此右控制冻结层的微小负 X 会移动门控切换点；当前源第 2 层 X 的右侧阈值约 `2.38418579e-7`，左侧为 0。图中保留该阈值，并专门检查零点及其两侧。

UE 图新增 `CHEEK_` 前缀，夹紧并归一化 X/Z，计算正负分支和眼袋门控后求位移。10 个独立目标使用初始全局位置加本组位移，保持参考旋转与有符号缩放，关闭子级传播。`renzhong_L/R` 与嘴唇共用：在原 `LIP_MAKE_renzhong_*` 的 Translation 前增加位移相加，继续使用原 SetTransform，避免覆盖嘴唇贡献或重复累加。

## 验证与参考姿势差异

- Max 扫描全部 **149 骨**，无缺失；识别 12 个目标，其余 137 骨位置无变化。检查 98 个有效 Morpher 通道，54 组样本均无通道值变化。
- 四个源轴各 9 档，共 36 组；另有 8 组双轴/双侧组合和 10 组门控零点附近输入。离线分段模型最大位移残差约 `0.0000161 cm`。
- UE 相对自身中性的**控制位移增量**最大误差约 **0.0001002 cm（0.001002 mm）**；源与 UE 的旋转增量均为 0，缩放保持原值。控制轴方向误差小于 `1.87e-7`。
- 原有 36 个控制共 **107 组**回归；再各配两组不同符号脸颊输入，共 **214 组**混合验证。旧姿势位置/缩放不变，组合最大位置误差小于 `8.4e-8 cm`，包含人中与嘴唇共用目标。
- 越界限位、Y 锁定、回零通过。每组姿势不清零连续求解两次，未发现累计位移。
- 原执行连接保留，10 个新增 SetTransform 从 Begin 可达；整链为 Begin 加 46 个 SetTransform。保存后关闭资产编辑器、重载包并再次执行上述数值检查通过，随后重新打开资产。

**右脸颊参考姿势存在既有残差。** 修改前 UE 的 `lianjia_R` 与当前 Max 中性变换相差约 **0.01665 cm（0.1665 mm）/ 0.41026°**。本次保留 UE 原参考变换，通过迁移控制的位移增量复现动作。因此报告同时列出原始绝对误差和增量误差，不能把“增量检查通过”表述为所有骨骼的绝对变换完全一致。其他 11 个目标的中性位置残差小于 `0.001 cm`、朝向残差小于 `0.01°`。

2026-11-06 用户确认脸颊变形效果通过。蓝轴调整后另做 54 组 × 149 骨前后对照，位置与朝向变化均为 0，同一世界位置的手柄差异小于 `1.22e-6 cm`；原 107 组回归、214 组混合与包重载验证再次通过，预览姿势及选中项已恢复。见 [轴向调整证据](../../Characters/Seven/Evidence/Cheeks/axis_adjustment.json)。

本次不重导网格、不修改参考骨架，也未新增嘴角/总嘴控等其他控制。当前仍沿用诊断 Rig 的全局参考姿势求解方式；头部动画空间适配、其他 Max 控制的完整组合需单独验收。轴向调整后的操作手感由用户后续检查。

## 脚本和恢复

证据与参数见 [Cheeks](../../Characters/Seven/Evidence/Cheeks/README.md)。Max 采样会临时将六个嘴唇输入归零，避免当前上唇姿势污染人中基准；结束和异常路径均恢复脸颊、嘴唇原值，不保存 Max 场景。

```powershell
python Tools/FaceMigration/Scripts/fit_cheek_controls.py --prepare
pwsh -NoProfile -File Tools/FaceMigration/Scripts/max_run.ps1 -ScriptFile Tools/FaceMigration/Scripts/probe_cheek_samples.ms | Out-File -LiteralPath Saved/Codex/cheek_probe_output.txt -Encoding utf8
python Tools/FaceMigration/Scripts/fit_cheek_controls.py
```

`--prepare` 从已留存的 149 骨基准生成采样名单。重新拟合参数不会自动更新现有图；源场景变化后需要同步更新图并复核。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/build_cheek_controls.py` | 首次增量添加两个控制，备份、记录原姿势、建图、验证后保存；已有 `CHEEK_` 节点时拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_cheek_controls.py` | 独立临时实例执行验证并写报告，不改变编辑器预览输入 |
| `Tools/FaceMigration/Scripts/reload_cheek_target.py` | 验证并保存，检查执行链、重载包、再次验证并打开资产 |
| `Tools/FaceMigration/Scripts/fix_cheek_handle_axes.py` | 对初版左右手柄反转蓝轴并补偿输入，核对世界拖动及骨骼姿势不变，保存重载并恢复预览；已调整时拒绝重复执行 |

复核现有资产：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_cheek_controls.py`。

构建前本机备份为 `Saved/Codex/Backup/Cheeks_20261106_145331/`，包含 `disk_before.uasset` 与保存当时内存状态后的 `memory_before.uasset`。`Saved/` 被 Git 忽略，报告和参数已另存到 Tools/FaceMigration/Docs/Evidence。早期眉眼基线 Rig `CR_Seven_MorphSliders` 未在本次修改。
