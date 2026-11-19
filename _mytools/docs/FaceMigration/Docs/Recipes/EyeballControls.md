# 左右眼球控制（2026-11-06）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。2026-11-06 本组完成时为 **149 骨、44 控制、1460 节点**，数值对照、旧控回归及保存重载通过。当时恢复中性并选中左眼球，画面由用户检查，尚未记录本组画面验收。2026-11-09 已追加 [双眼总控](GazeMasterControl.md)及[下巴整体](ChinControl.md)，当前统计见 [Seven 角色记录](../../Characters/Seven/README.md)。

## 操作

| Max 来源 | UE 控制 / 显示名 | 操作 |
|---|---|---|
| `YanJing_L001` | `CTRL_EYEBALL_L` / 左眼球 | 拖动眼前的绿色框改变左眼注视目标 |
| `YanJing_R001` | `CTRL_EYEBALL_R` / 右眼球 | 拖动眼前的绿色框改变右眼注视目标 |

均为 POSITION 控制，使用参考姿势的 Rig 全局轴：红 X 左右、蓝 Z 上下、绿 Y 调整目标远近。`(0,0,0)` 为单眼局部中性；输入 1 对应目标移动 1 cm，不套用嘴部的 10 倍界面倍率。手柄参考位置分别为 `(4.306676,35.296112,158.986832)` 和 `(-4.292577,35.296104,158.875061)` cm。2026-11-09 起父级由 `Root` 改为 `CTRL_EYEBALL_MASTER`，总控位移另行叠加；单眼输入保持独立。

源 Max 眼球位置输入无行程限位，UE 同样不加限位。源 Position List 第 2 层存在父级旋转和缩放，不能直接抄其 XYZ 到 UE。完整换算矩阵及逆矩阵见 [parameters.json](../../Characters/Seven/Evidence/Eyeballs/parameters.json) 的 `source_world_basis` / `inverse_input_rows`；日常直接拖 UE 目标即可。

## 驱动关系

共影响 **22 根骨骼**，不改变骨骼缩放。采样检查的 98 个有效 Morpher 通道均未变化。

| 范围 | 左侧 | 右侧 |
|---|---|---|
| 眼球及子骨 | `yanqiu_L`、`Eye_L01` | `yanqiu_R`、`Eye_R01` |
| 上眼皮 | `Bone036～038` | `Bone027～029` |
| 下眼皮 | `Bone039～041` | `Bone030～032` |
| 眼角 / 眼袋 | `Bone044～045`、`yandai2_L` | `Bone042～043`、`yandai2_R` |

眼球用目标点、眼球枢轴及每侧固定 up 方向构造朝向，并消除中性偏置。子骨围绕眼球枢轴旋转，保留参考偏移。

眼皮跟随先在源空间合并转眼与上/下眼皮的 XYZ Euler 贡献，再转为 Rig 空间旋转。使用 `总旋转 * 原眼皮旋转的逆` 调整原眼皮输出，按源顺序加入分段位置项，保留原眼皮、眼周点控及脸颊贡献。眼角 / 眼袋的线性项接到既有 `EYE_MAKE_*` / `CHEEK_MAKE_*` 前。

新增 **234 个 `GAZE_` 节点**。原 47 个 SetTransform 执行链保留，末尾追加四个眼球 / 子骨写入；眼皮及眼袋复用原写入节点。完整链为 Begin 加 51 个 SetTransform，已检查无断链和循环。

## 验证与边界

- 源场景 `D:/Download/Seven_Skin_New.max`，0 帧、全 149 骨：单轴 54 组、单侧角点 16 组、左右混合 12 组，共 **82 组**；另有 **20 组**上下眼皮组合。采样后恢复相关控制原始值，不保存 Max 场景。
- 82 组源对照最大位置误差约 **0.00006337 cm**，朝向约 **0.00005544°**；非目标骨位置保持原值。
- 20 组眼皮组合中，眼球最大位置 / 朝向误差约 `0.00001554 cm / 0.00003725°`；下眼皮及其余目标约 `0.00012159 cm / 0.00002463°`。上眼皮保留既有近似，最大残差 **0.033745 cm / 0.393217°**，未宣称与 Max 完全一致。
- 添加前 **42 控制、154 组**旧姿势，再加 **20 组**眼皮输入，共 **174 组**回归通过；各配两组转眼，**348 组**独立实例组合通过，最大误差约 `0.000000309 cm / 0.00000871°`。
- 重复求解、回零、三轴手柄方向及超出 ±10 的输入读取通过。保存、关闭资产编辑器、重载包后重复完整验证通过，编译 `BS_UP_TO_DATE`。

极小输入存在 UE 层级缓存容差：`FRigComputedTransform::Equals` 默认按位置、四元数、缩放各分量 `0.0001` 判断是否写入。连续从单独转眼切到含极小眼皮输入的组合时，相对新实例最多约 **0.00009941 cm / 0.002332°**。已另行检查该差异各分量在引擎容差内；严格组合公式仍用独立实例按原精度验证，未放宽全部验证。

沿用诊断 Rig 的静止头部参考空间。头部 / 身体动画空间适配及未迁移控制的组合不在本组验证范围内；`YanJing_Zong001` 已于 2026-11-09 另行实现并验证，见 [双眼总控](GazeMasterControl.md)。目标与眼球中心重合或方向平行固定 up 的退化姿势未验收。早期眉眼基线 Rig `CR_Seven_MorphSliders` 本次未修改。

## 脚本与证据

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_eyeball_samples.ms` | 源全骨、辅助点、手柄和 Morph 采样，恢复底层输入 |
| `Tools/FaceMigration/Scripts/fit_eyeball_controls.py` | 分解注视、眼皮 Euler 基与分段位置；普通 Python，需 NumPy / SciPy |
| `Tools/FaceMigration/Scripts/build_eyeball_controls.py` | 首次增量建图、双份备份和旧控采集；拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_eyeball_controls.py` | 临时实例数值、组合及缓存容差复核；不保存或改变预览 |
| `Tools/FaceMigration/Scripts/reload_eyeball_target.py` | 验证、保存、重载、重复验证，恢复预览并选中左眼球 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_eyeball_controls.py`。

数据与报告见 [Eyeballs 证据](../../Characters/Seven/Evidence/Eyeballs/README.md)。拟合读取本机 `Saved/Codex/eyeball_samples_raw.json`，交接用副本为证据目录的 `max_samples.json`。重新采样前应生成 / 核对 `Saved/Codex/cheek_bone_names.txt` 的 149 骨名单；备份目录见 `build_report.json`，`Saved/` 不随仓库交接。
