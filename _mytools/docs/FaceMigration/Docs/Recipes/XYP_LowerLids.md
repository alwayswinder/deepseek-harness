# XYP 左右下眼皮（2026-11-06）

实现资产：`/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。

在原诊断副本上增量添加左右下眼皮，完成时为 149 骨、30 控制、394 节点。本页采样、计数和报告为该部位完成时的批次快照；当前完整资产见 [Seven 角色记录](../../Characters/Seven/README.md)。正式资产 `CR_Seven_MorphSliders` 未在本任务中修改。2026-11-06 用户检查后确认“效果没问题”，本次左右下眼皮效果验收通过。

## 操作

| 显示名 | UE 控制 | Max 来源 | 驱动骨骼 |
|---|---|---|---|
| 右下眼皮 | `CTRL_EYE_LOWER_LID_R` | `XYP_R001` | `Bone030/031/032` |
| 左下眼皮 | `CTRL_EYE_LOWER_LID_L` | `XYP_L001` | `Bone039/040/041` |

两个控制为浅蓝色 `Box_Thick`，位于脸下方，父级为 `Root`。POSITION 控制的 X/Y 锁为 0，Z 范围为 **0–10**；向上拖动 Z 抬起下眼皮，0 回到中性，10 对应 Max 的满行程。也可以在层级中按控制名选择，再修改 Current Value 的 Z。

归一化关系为 `s = UE_ctrlZ/10 = -Max_XYP_localY/1.72`。数值范围是迁移后的控制行程，不代表 Max 手柄实际世界拖动距离。

## 源驱动与实现

右侧链路：`XYP_R001 → Point163 → ZPoint077/078/079 → Sphere077/078/079 → KPoint077/078/079 → zCircle077/078/079 → Link_Constraint → Bone030/031/032`。

左侧对应 `Point162`、编号 `071/072/073` 的辅助节点及 `Bone039/040/041`。两个 Point 位于眼球中心。Max 输入为 position_list 第 2 层的局部 Y，范围 `[-1.72,0]`，X/Z 为 0。

本次复现 XYP 单控贡献：

- Point 枢轴绕自身 Z 轴旋转，表达式中的 XYP 项为 `-XYP*0.29` 弧度，满行程约 28.579°。
- KPoint 的位置包含 XYP 线性项；中点、内点还分别有约 5.913°、9.855° 的满行程附加旋转。
- 用 Max 中性与满行程的完整变换，把枢轴运动、旋转前位移和附加旋转分解到同一 Rig/组件空间，随后在 33 档样本上验证分解；不是用闭眼端点做直线插值。

图中以 `LLID_` 为独立前缀，使用 `s` 驱动枢轴四元数、表达式位移和附加四元数。位置从已有 `EYE_VADD_*` 读取，旋转从 `EYE_BT_*` 的初始变换读取，最终接入原 `EYE_MAKE_*`；保持现有执行链。额外的 Float Clamp 使图内输入也限制在 0–10。

本次没有新增眼球方向、总眼部控制或 BiYan 控制，没有声称复现它们的完整混合表达式。现有上眼皮的拟合残差与 Root/头部动画空间限制仍需按原文档处理。

## 验证与边界

- 左右各 33 档输入 × 3 骨，共 198 条完整位置/朝向对照；最大位置误差约 **0.000281 cm（0.00281 mm）**，最大朝向误差约 **0.000274°**。
- 单侧输入时，全部非目标骨相对中性姿势的变化为 0；越界 X/Y 和 Z 被正确夹住，回零无残留。
- 原有 28 个控制共 83 组回归姿势，149 骨的位置与朝向变化均为 0；原执行连接完整保留。
- 双侧上下眼皮同时输入 1/3、2/3、满行程，36 条骨骼对照通过；上眼皮沿用原有约 0.340 mm / 0.394° 的残差。
- 保存后关闭该资产编辑器、重新加载包并再次执行上述数值验证通过。编辑器已重新打开该资产。
- 2026-11-06 用户自行检查效果并确认“效果没问题”，本次左右下眼皮效果验收通过。用户未逐项声明所有 LOD、头部动画、任意点控组合或其他 Max 表情控制均已测试，因此不扩大验收范围。

数据和报告见 [XYP 证据](../../Characters/Seven/Evidence/XYP/README.md)。

## 脚本与恢复

| 文件 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_xyp_samples.ms` | 在时间 0 采样左右 XYP 及上下眼皮组合，恢复被修改的 Max 输入，不保存场景 |
| `Tools/FaceMigration/Scripts/build_lower_lids.py` | 仅在上述诊断 Rig 添加/重建 `LLID_` 和两个下眼皮控制，备份、编译、回归、保存 |
| `Tools/FaceMigration/Scripts/verify_lower_lids.py` | 用独立实例执行数值验证，写 validation.json，不修改预览 |
| `Tools/FaceMigration/Scripts/reload_lower_lid_target.py` | 关闭指定资产编辑器、重载包并重新打开，检查保存后的结构 |
| `Tools/FaceMigration/Scripts/inspect_lower_lid_target.py` | 只读查询目标 Rig 结构，报告写到 Saved/Codex |

构建脚本依赖 [parameters.json](../../Characters/Seven/Evidence/XYP/parameters.json)。该文件保存了本次 Max 场景分解的参数及 33 档分解误差；源场景变化后不能直接沿用。重跑构建会重建两个下眼皮控制并回到默认值，不应在动画制作中随意执行。

本次构建前备份位于 `Saved/Codex/Backup/LowerLids_20261106_141252/`：`disk_before.uasset` 为原磁盘文件，`memory_before.uasset` 为保存当时内存状态后的文件。备份目录被 Git 忽略，仅存在于本机；需要恢复时先关闭资产编辑器并备份现状，再恢复对应包。
