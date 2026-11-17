# 左右嘴角与整体嘴控（2026-11-06）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，新增三个 POSITION 控制。本组完成时为 **149 骨、42 控制、1226 节点**；当前完整资产见 [Seven 角色记录](../../Characters/Seven/README.md)。源场景数值对照、旧控回归、组合与保存重载通过；已恢复原预览输入并选中 `CTRL_MOUTH`，画面效果由用户检查，本组尚未记录用户验收。

## 操作

三个手柄父级均为 `Root`，使用参考姿势的世界轴方向：红 X 左右、绿 Y 前后、蓝 Z 上下。左右嘴角为粉红色小框，总嘴控为浅蓝色宽框。0 为中性，蓝轴统一朝上。

| Max 来源 | UE 控制 / 显示名 | UE X | UE Y | UE Z |
|---|---|---|---|---|
| `Animcraft_Left_Mouth_Ctrl` | `CTRL_MOUTH_L` / 左嘴角 | −10～10 | −20～30 | −15～18 |
| `Animcraft_Right_Mouth_Ctrl` | `CTRL_MOUTH_R` / 右嘴角 | −10～10 | −30～20 | −15～18 |
| `Animcraft_Mouth_Ctrl` | `CTRL_MOUTH` / 嘴部整体 | −10～10 | −10～10 | −10～10 |

**左右嘴角使用红 X、蓝 Z 调整表情。** 绿色 Y 对应源 Max X，源控制虽然允许拖动，但全 149 骨和 98 个有效 Morpher 通道均无响应，UE 同样不产生变形。总嘴控三轴均有效。

输入对应关系：左嘴角与总嘴控为 `UE = (-Max.Z, Max.X, Max.Y) * 10`；右嘴角为 `UE = (Max.Z, -Max.X, Max.Y) * 10`。这里映射的是 Position List 第 2 层的输入值，10 为界面输入倍率，不表示骨骼移动 10 cm。实际骨骼由逐目标分段系数驱动；总嘴控的源手柄缩放不作为骨骼增益。

## 驱动关系

本组共驱动 20 根骨骼，其中 14 根有旋转响应；不改变骨骼缩放或 Morpher 权重。

| 控制 | 联动范围 |
|---|---|
| 左嘴角 | `Bone016～019`、`renzhong_L`、`xiabake_L`、`Bone014`、`pingguoji_L`、`lianjia_L`，以及中央 `shangzuichun` / `xiazuichun` 的小幅联动 |
| 右嘴角 | `Bone020～023`、`renzhong_R`、`xiabake_R`、`Bone015`、`pingguoji_R`、`lianjia_R`，以及中央 `shangzuichun` / `xiazuichun` 的小幅联动 |
| 总嘴控 | 上述全部 20 骨，按每轴、正负方向分别响应 |

源链包含 KPoint 的位置表达式与 Euler XYZ 旋转表达式，再经 zCircle / Link Constraint 驱动导出骨。正负行程系数分别采样，左右分别还原，不以镜像替代实测。

UE 新增 **569 个 `MOUTH_` 节点**，先夹紧输入、分解正负贡献。平移叠加到原 `LIP_MAKE_*` 或 `CHEEK_MAKE_*` 的 Translation 前；保留唇控、脸颊既有贡献。旋转先相加源 Euler 层的角度，再用 XYZ 顺序构造四元数，通过每骨固定基变换得到 Rig 全局旋转增量，最后左乘原旋转。不能逐控制相加欧拉化后的世界旋转，或直接相乘各单控最终四元数。

原 Begin 加 47 个 SetTransform 执行链全部保留，不新增重复骨骼写入。求解基于参考变换，不读取上次求解结果累计。

## 验证与参考姿势

- Max 扫描 **149 骨**：9 个源轴各 9 档（81 组）、24 个单控角点、20 组多控混合，共 **125 组**；另有 **12 组**与鼻子、六唇控和脸颊的源场景组合。98 个有效 Morpher 通道均无变化。
- 离线分段位置拟合最大残差约 `0.00008001 cm`，旋转基拟合最大误差约 `0.00002759°`。
- UE 相对各自中性的完整变换增量：最大位置误差约 **0.00007994 cm（0.0007994 mm）**，最大朝向误差约 **0.00002711°**；源场景组合最大位置误差约 `0.00006980 cm`、朝向误差约 `0.00002035°`。缩放保持 UE 原值。
- 原 **39 控制、130 组**回归通过；再各配两组嘴控，**260 组**组合回归通过。旧姿势位置变化为 0，混合相加位置误差小于 `2.86e-14 cm`。
- 非目标骨保持原姿势；连续求解、回零、XYZ 限位、三轴手柄方向检查通过。保存后关闭资产编辑器、重载包，重复完整数值检查通过，编译 `BS_UP_TO_DATE`。

首次采样发现当前 Max 的 **`jaw_move` 第 2 层 Y = −1.2204715**，使嘴部基准相对 UE 偏移约 1.22 cm。最终证据采样临时将该轴归零，结束恢复原值；没有把这个下巴姿势烘焙进三嘴控。鼻子、脸颊、六唇控、左右嘴角和总嘴控的原始输入也全部恢复，不保存 Max 场景。

最终中性对照仍保留既有 **`lianjia_R` 约 0.01665 cm / 0.41026°** 的参考差异，其余 19 个本组目标中性位置误差小于 `0.000266 cm`。报告同时列出绝对误差与增量误差。全 149 骨绝对朝向统计中的 `120°` 来自**未受本组控制影响的 `Root_Camera` 静态基差异**，不能当成本组旋转误差；全部骨骼的本组增量均做了检查。

当前仍沿用诊断 Rig 的静止头部参考空间求解；头部/身体动画空间适配及其他尚未迁移的源控制组合需另行实现。2026-11-09 已追加 [下巴整体](ChinControl.md)并验证嘴部组合，范围见专文。早期眉眼基线 Rig `CR_Seven_MorphSliders` 本次未修改。

## 脚本与证据

数据与报告见 [MouthControls 证据](../../Characters/Seven/Evidence/MouthControls/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_mouth_samples.ms` | 全骨、完整变换、Euler 层、Morph 采样，临时归零相关输入并恢复原值 |
| `Tools/FaceMigration/Scripts/fit_mouth_controls.py` | 普通 Python 下拟合分段位置、Euler 系数和旋转基，需要 NumPy / SciPy |
| `Tools/FaceMigration/Scripts/build_mouth_controls.py` | 首次增量建图，双份备份与旧控采集，拒绝重复添加 |
| `Tools/FaceMigration/Scripts/update_mouth_parameters.py` | 同一节点结构下同步重新拟合的系数，再完整验证、保存与重载；不负责新增响应项或调整手柄布局 |
| `Tools/FaceMigration/Scripts/verify_mouth_controls.py` | 独立实例数值复核，不改变预览输入，不保存资产 |
| `Tools/FaceMigration/Scripts/reload_mouth_target.py` | 验证、保存、重载、再次验证，恢复构建前预览并选中总嘴控 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_mouth_controls.py`。

重新采样前先运行 `python Tools/FaceMigration/Scripts/fit_cheek_controls.py --prepare` 生成 149 骨名单，再用 `Tools/FaceMigration/Scripts/max_run.ps1 -ScriptFile Tools/FaceMigration/Scripts/probe_mouth_samples.ms` 或 Max MCP 执行该脚本。拟合输出本身不会修改 UE 图。

本次备份路径见 [build_report.json](../../Characters/Seven/Evidence/MouthControls/build_report.json)，包含原磁盘包及保存当时内存状态后的包。`Saved/` 被 Git 忽略，交接数据已另存到 Tools/FaceMigration/Docs/Evidence。
