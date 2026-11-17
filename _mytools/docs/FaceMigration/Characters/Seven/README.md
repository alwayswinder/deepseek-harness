# Seven 面部迁移状态

## 2026-11-17 当前示例目录与后续产出规范

用户整理后的当前示例为 `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression`。根目录 `SevenECR/` 直接放 CR，其余 7 个依赖放 `ToolsPanel/`：`T_expression`、`M_PhonemeReference`、`SM_PhonemeReference`、`SL_PhonemeReference`、`M_SliderRails`、`SM_SliderRails`、`SL_SliderRails`。后续角色采用 `<角色名>ECR/CR_<角色名>_Expression` 与同包 `ToolsPanel/`，详见[目录与命名规范](../../Docs/Workflow/Build.md#角色产出目录与命名2026-11-17-起)。

本次仅按磁盘目录核对并整理文档，没有重新运行 UE 功能或引用验证。下方日期章节、资产表、`face-controls.json` 和旧 job 均保留各自批次路径与验证结论；其中“当前”指该历史批次，不代表新任务默认值。新任务从 TASK.md 生成独立配置，执行前核对当前示例依赖并适配共用脚本路径，不能直接重放旧 job。

## 2026-11-12 新建 RuntimeAsset 全流程验证（当前目标）

用户再次新建 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`，本轮初始为 149 骨、87 曲线、0 控制、1 节点。按 TASK.md 用独立任务 [seven-taskflow-20261112.json](../../Jobs/seven-taskflow-20261112.json) 执行八个固定入口，没有读取旧任务的通过报告。骨架名称/顺序、参考姿势、同一网格及 Morph 独立探测等价，故继承当前示例设计与数值，不重复拟合；当前 Max 重新核对全部 72 个对象名并抽检右上眼皮五点，其余控制没有重新采集 Max。

已保存并重载的目标为 72 动画控制 + 2 Visual Cue、149 骨、28 曲线、1927 节点 / 2645 连接。私有 `FACE_AnimatedHead` 的 Transform 类型、默认值、public/private 与 `head001 → FACE_SPACE` 一并迁移。保存前/重载后各 1175 组迁移对照 worst 全 0，显示契约 0 差异，各 592 组空间检查通过（74 组输入 × 参考、两方向头部运动、身体动画五个时刻）；控制和形状跟随最大位置误差约 `0.000012 cm`，输入头部保持且重复求解不累加。

本轮 Max 主骨 Bone028 最大误差 `0.00343985 cm / 0.00059242°`；次级 Bone027 为 `0.0208485 cm / 0.39335415°`，单列保留。源输入与 Morpher 全部恢复。PIE 28 条 Morph 检查和 81 组正常帧检查通过：72 单控、六组非零头部姿态、组合与恢复，最终曲线误差 0；临时 Actor 已销毁，PIE 已结束，用户关卡未保存。非零头部姿态通过直接写实际 Rig 层级注入，宿主仍为参考姿势 AnimBP，不能当作身体动画播放宿主或 Sequencer 验收。

本轮修复：原始精度绑定判定、成员变量先于节点导入、两项动画空间的保存前/重载后门禁。已知未修复：资产编辑器预览仍停在 0.4 秒，half_error=0.50014，刷新一次无效，输入恢复通过；UE 5.8.4 无条件赋予变量 `CPF_Interp`，Cinematics 标记从 false 变 true，分类 Default 变空，缓存仍 private=true/public=false，数值执行通过。实际动画宿主、Sequencer、最终画面与拾取待验收，不写整体通过。完整报告、问题清单和备份在本任务 `Current/`，示例磁盘摘要保持 `c06af7b84a4f7b636202bed3b0ae1e7f1226b9d23438c81de535ad1a12890804`。以下示例修复和旧目标记录仍为各自日期的历史。

## 2026-11-12 示例 CR 控制器头部跟随

用户明确授权在 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation` 增加 `head001 → FACE_SPACE`（Null）。原来直接挂 Root 的 72 个顶层控制改挂 FACE_SPACE，两个单眼控制继续挂眼球总控；合计仍为 72 动画控制 + 2 Visual Cue，149 骨 / 28 曲线 / 1927 节点 / 2645 连接。形状、颜色、操作轴、行程、Initial/Current 输入、眼球子层级及完整图保持。手柄、实体滑轨和口型图均随头运动；这不包含跟随眉毛/嘴唇变形的皮肤贴附或逆向解算。

共用实现为 [face_design_space.py](../../Scripts/face_design_space.py) 的 `attach_face_control_space()`，安装与验证入口为 [update_face_control_space.py](../../Scripts/update_face_control_space.py)，配置为 [seven-reference-control-space-20261112.json](../../Jobs/seven-reference-control-space-20261112.json)。已有 FACE_SPACE 时拒绝重复安装。修改前备份磁盘、当前内存、层级、图和预览输入；报告与备份放目标项目 `Saved/FaceMigration/Jobs/seven-reference-control-space-20261112/Current/`。

保存前、重载后各 592 组对照通过：74 组输入（中性、72 单控、组合）× 参考姿势、两组头部运动和用户身体动画五个时刻。149 骨和 28 曲线对修改前差异为 0；控制与形状的头部跟随最大位置误差约 `0.000017 cm`，重复求解不累加。当前实际编辑器预览另观察 15 帧，时钟推进、74 控制位置及输入保持检查通过；最终 Sequencer 画面与拾取由用户验收，检查时没有打开的序列。RuntimeAsset 本次未修改。

注意：UE 的重设父级会清理显示名标点，安装器显式恢复完整控制设置。动画验证按 AnimNode 的默认行为传播非骨骼子级；逐骨 `set_global_transform(..., bAffectChildren=False)` 会保世界并改写辅助 Null 的局部值，不能用来模拟动画输入。本次诊断失败已自动回退后修正验证方式，正式通过报告为 `Current/Evidence/control_space_report.json`，实际预览观察为 `live_control_space.json`。

## 2026-11-12 示例 CR 动画头部空间修复

用户明确授权修改 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。在本次当前图上增加 6 个 `HSPACE_` 节点和私有 Transform 缓存 `FACE_AnimatedHead`：入口保存动画当前 `head001`，将其 Current 全局变换临时设为 Initial 并传播子级；原面部链执行结束后恢复缓存头部并传播子级。原有节点默认值、内部连接、控制输入和布局保留，仅替换 Begin 的第一条连接并追加出口。当前为 1927 节点 / 2645 连接；RuntimeAsset 本次未修改。

共用入口为 [wrap_face_head_space.py](../../Scripts/wrap_face_head_space.py)，任务配置为 [seven-reference-head-space-20261112.json](../../Jobs/seven-reference-head-space-20261112.json)。脚本拒绝重复安装；仅适用于参考 Rig 空间求解、所有输出骨骼都位于头部锚点下的 Blueprint Rig。这里的 Global 是 Rig 空间。

备份、基准和报告位于目标项目 `Saved/FaceMigration/Jobs/seven-reference-head-space-20261112/Current/`。正式 CR 保存前与重载后各通过 148 组检查（中性、72 个单控、组合 × 参考姿态/头部运动），149 骨和 28 曲线对照；另外取用户身体动画五个时刻、五组控制，25 组与独立原求解器加显式头部空间包装的结果一致。重复求解不累加。尚未在用户当前 Sequencer 中做最终画面验收；检查时没有打开的序列。

边界：名为“不带口型”的动画仍包含与参考姿态不同的面部骨骼数值。此修复保留既有 Rig 的面部覆盖语义，仅修正头部跟随；默认控制不会自动还原该动画原有的面部姿态，实测面部位置变化最大约 1.85 cm。需要保留并编辑原面部姿态时，应另行采用输入姿态增量或逆向解算方案。

首次尝试在 `AddMemberVariable` 传入 `FTransform` 简写，触发 UE 5.8 `CPPTypeObject` 断言，未接入新图。现已改为 `/Script/CoreUObject.Transform` 并先在临时 Rig 验证。复制 Blueprint 后须保存重载，刷新其 RigVM 链接缓存后再改图；临时探测资产在验证结束后清理。

本页统一维护当前目标、各组入口和已知边界。**2026-11-10 已按示例增量恢复控制设计**：以 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation` 为示例，在保留目标采样求解和头部跟随的基础上，恢复手柄、配色、操作轴/行程、24 条滑轨及口型图，并加入源输入矩阵转换。当前技术检查与显示设置对照通过，最终画面与拾取手感待用户验收。执行方法见[主流程](../../Docs/Workflow/Build.md)；此前从零版本的视觉拒绝记录仍保留，不能改写成已获用户确认。

2026-11-09 的完整图迁移、数值、保存重载和正常帧测试保留为[历史交付记录](Evidence/SevenRuntime/README.md)，不代表当前资产仍是当时版本。历史下眼皮和脸颊画面已获用户确认，也不能替代本次整体验收。

## 2026-11-10 流程验证（当成新角色）

用户要求把示例、当前 Max 角色和新建的 `NewControlRigRuntimeAsset1` 当作三个不同角色，验证流程是否通顺（该资产现已删除，见下）。执行结果：

| 阶段 | 结论 |
|---|---|
| 独立绑定探测 | 与示例等价：149 骨同名同序、同一 `Seven` 网格、87 Morph 全含、目标 0 控制 |
| 示例契约盘点 | 73 控制、2 个形状库（含 `SL_PhonemeReference`）、24 条滑轨 |
| 空目标构建 | 通过，1926 节点 / 2639 连接，导入约 6 分钟无响应 |
| 示例 → 目标 | 通过，1175 组 worst 全 0（保存前与重载后各一次） |
| 显示契约 | 通过，0 差异 |
| Max → 目标抽检 | 上眼皮 5 点，0.00344 cm / 0.00059° |
| 保存重载 | 通过，示例磁盘摘要未变 |
| 正常帧预览 | **未通过**：Rig 时间停在 0.4 s、28 条 Morph 全 0，两次 refresh 未恢复 |
| 旧控回归（12 部位验证器） | **不适用**：`previous_controls.json` 属已废弃采样求解谱系，10/12 误报失败 |
| 用户画面 | 待验收 |

问题清单与建议见该任务 `Current/Evidence/flow_findings.md`；预览停滞判定见[排障](../../Docs/Troubleshooting/PreviewStall.md)。其余 71 个控制没有重新拟合 Max，只做迁移等价对照。

## 2026-11-10 第二轮：按 TASK.md 协议完整重跑（当前）

环境被重置为新的空壳目标 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`（149 骨、0 控制、87 曲线、1 节点），上一轮的 `...Asset1` 已删除。本轮从 TASK.md 第 1、2 节重新生成配置 `Jobs/seven-taskflow-20261110.json`，走完读表 → 备份盘点 → 独立探测 → 空目标构建 → 三方验证 → 保存重载 → 正常帧预览。结论与上一轮一致：结构、数值、显示、重载通过；正常帧预览仍停滞（0.4 s，两次 refresh 无效）；12 个部位验证器 2/12（旧控回归谱系不符）。新增发现：任务单表格对齐格式会让解析正则失效、形状库 struct 只有 `shape_name` 可读、手动 `execute('Forwards Solve')` 能出 rig 曲线但 mesh 曲线仍 0、保存后目标不 dirty（上一轮记录的“必然重新 dirty”不成立）、Max 次级眼皮骨有 0.021 cm / 0.41° 的差异。报告在 `Saved/FaceMigration/Jobs/seven-taskflow-20261110/Current/Evidence/`，问题清单 `flow_findings.md`。

## 2026-11-11 指定目标重新完成

本轮任务 `seven-complete-20261111` 重新盘点时，用户指定的 `NewControlRigRuntimeAsset`
实际为空壳（0 控制、1 节点、149 骨、87 曲线）。独立核对同一预览网格、骨骼顺序、
初始位移/旋转/缩放和 Morph 依赖后，按更新后的示例重新派生；未改动示例。
构建为 72 动画控制 + 2 Visual Cue、149 骨、28 曲线、1926 节点、2639 连接。
保存前后各 1175 组示例对照与显示契约通过。Max 本轮重新核对全部 72 个名称的唯一性，
只重采右上眼皮五点：主骨误差 0.00343985 cm / 0.00059242°；次级骨 Bone027
仍有 0.0208485 cm / 0.39335415° 的已知差异。其余控制继承示例，未全量重新拟合。
最终正常帧、恢复与交付结论以本任务 `Current/Evidence/delivery_check.json` 为准，
不沿用旧任务通过状态。用户画面与拾取手感仍待验收。
本轮 PIE 的 28 条 Morph 半程/恢复检查及全部 75 组逐帧控制测试均已通过；
网格骨骼最大差 7.2683e-8 cm / 2.4148e-6°，最终曲线及输入恢复误差为 0。
资产编辑器自身的预览仍停在 0.4 s，单列未通过；PIE 已结束，临时测试 Actor 已移除，用户关卡未保存。

## 当前资产

2026-11-11 用户明确要求把上述布局同步回原始示例 `CR_Seven_LidWorldRotation`，已通过独立任务 `seven-reference-layout-20261111` 完成：24 个手柄前移 1 cm，实体滑轨线宽 0.12 cm，口型图位于轨道后方 1 cm；示例当前同样为 72 动画控制 + 2 Visual Cue，149 骨 / 28 曲线 / 1926 节点 / 2639 连接。原控制 offset、输入、节点和连接保持，旧调试轨道仅关闭绘制；1175 组示例与 RuntimeAsset 对照差异全 0，已保存重载。独立依赖在 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation_UI/`。RuntimeAsset 本次作为只读对照，包摘要未变；旧任务记录的示例摘要属于更新前快照，不改写历史报告，后续迁移用新任务重新盘点。此次是用户对“默认示例只读”规则的明确例外；普通迁移仍保持示例只读。

2026-11-11 后续按用户反馈进一步收近口型图：显示平面从 Y=12 改为 Y=17，距 Y=18 滑轨后方 1 cm；手柄中心仍 Y=19。仅改参考图 Initial/Current shape 局部 Y=5，原辅助控制 offset、X/Z、图形大小、逐行对齐和所有动画接口保持。保存重载及 1175 组迁移对照通过，原骨骼、曲线、控制位置误差均为 0。共用生成、单独参考图生成及验证规则均已同步；当前间距见任务报告 `slider_handle_depth.json` 的 `phoneme_reference_depth`。

2026-11-11 首次将 24 个手柄的 Initial/Current shape 局部 +Y 设为 1 cm（轨道 Y=18，手柄中心 Y=19），数值与重载通过，但用户随后反馈重叠区域仍无法选择，故该次拾取修复**未通过用户验收**。进一步实测：当前手柄实际为 Opaque，半透明 X-Ray 材质未使用；原调试滑轨被引擎按前景置顶绘制，单独加深度间距不足。

同日后续修复：保留手柄 1 cm 间距，把 24 条滑轨改成不透明、正常深度测试的实体网格，线宽 0.12 cm，保留坐标、端点和分组配色；原轨道节点仅设 `bEnabled=False`，节点和全部连接保持。增加不可操作的 `VIS_SLIDER_RAILS`，当前为 **74 控制 = 72 动画控制 + 2 Visual Cue**，149 骨 / 28 曲线 / 1926 节点 / 2639 连接。依赖在 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset_UI/`，随 Rig 迁移。保存重载及 1175 组对照通过，骨骼、曲线、原控制位置误差均为 0，示例磁盘包未改动，资产与预览输入已恢复。当前预览已读到新实体轨道和 Opaque 材质，重复执行不叠加；像素拾取与手感仍待用户实际验收。生成器、任务单和验证共用新规则。报告为当前任务 `Current/Evidence/slider_handle_depth.json`、`slider_picking_validation.json`。资产编辑器原有非 tick 宿主问题另按预览章节记录。

| 项目 | 路径 / 状态 |
|---|---|
| Max 源场景 | `D:/Download/Seven_Skin_New.max`，采样帧 0 |
| UE 网格 | `/Game/_MyTest/Mouth/Mesh/Seven`，历史核对 149 骨、87 个 Morph Target |
| 当前输出目标 | `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`，类型 `ControlRigRuntimeAsset`；149 骨、72 动画控制 + 2 Visual Cue、28 曲线、1926 节点/2639 连接；2026-11-11 改为正常深度测试的实体滑轨，已保存重载；像素拾取和画面待用户验收 |
| 历史输出目标 | `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset1`，2026-11-10 第一轮流程验证的对象；**该资产已不在磁盘**，相关报告只作历史记录 |
| 本轮示例 Rig | `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`；2026-11-11 按用户明确要求同步最新布局，72 动画控制 + 2 Visual Cue；普通迁移时仍只读 |
| 完整名称与输入表 | [Seven.face-controls.json](face-controls.json)，72 项 |
| 2026-11-09 历史结构 | 149 骨、72 个动画控制 + 1 个参考图 Visual Cue、1926 节点、28 条 Morph 曲线；不作为当前盘点 |
| 当前保存结构 | 本轮 149 骨、72 动画控制 + 2 Visual Cue、1926 节点、2639 连接、28 输出曲线；实体轨道和口型参考图保留 |
| 2026-11-10 流程测试记录 | 72 个动画控制、9166 节点、28 条 Morph；2846 组源姿势、保存重载及 79 组正常帧测试有数值通过记录，但未迁入完整示例控制设计及口型参考图 |
| 当前运行报告位置 | `Saved/FaceMigration/Jobs/seven-complete-20261111/Current/Evidence/`；任务配置 `Jobs/seven-complete-20261111.json`。此前任务报告保留为历史 |
| 历史 Max 对照 | 先前增量采样资产的 517 组配准姿势，覆盖完整 UI 行程、组合与脸颊阈值；不作为本轮重新采样或验收结论 |
| 当前显示对照 | 73 项形状、颜色、限位、行程、初始 offset 与 shape transform 无差异；两个形状库及 24 条滑轨的参考点/颜色/粗细一致，控制和滑轨适配为头部跟随 |
| 历史运行环境 | UE 5.8.4 / CL 58902052；旧配方的 5.8.3 是历史环境，执行时重新发现 |
| 2026-11-09 历史结构及功能依据 | [历史重载](Evidence/SevenRuntime/reload_report.json)、[1175 组迁移对照](Evidence/SevenRuntime/after_reload/transfer_validation.json)、[12 组源样本验证器](Evidence/SevenRuntime/after_reload/source_verifiers.json) |
| 历史名称覆盖依据 | 2026-11-09 迁移对照实时核对新资产全部 72 项；[旧名称核对说明](Evidence/ControllerCatalog/README.md)保留当时的 `live_checked=false`，不改写历史报告 |
| 2026-11-09 历史正常帧预览依据 | [75 组逐控与组合](Evidence/SevenRuntime/preview_controls_validation.json)、[28 条半程 Morph 及恢复](Evidence/SevenRuntime/preview_morph_check.json)、[73 个可见手柄绑定](Evidence/SevenRuntime/delivery_check.json) |

上述批次中的 `LidDiagnostic` 路径保留历史原名；2026-11-17 起当前示例已改为 `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression`，不再把旧路径作为新任务默认输入。`/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders` 是早期 28 控制眉眼基线；其 330 节点数据只用于解释基础实现与上眼皮诊断，不能替代当前目标。后续增量修改以用户给出的资产为准。

## 功能清单

| 功能 | 动画控制数 | 实现与边界 |
|---|---:|---|
| 眉毛整体 / 三点 / 弯曲 | 10 | [基础配方](../../Docs/Recipes/SevenBrowsAndEyes.md)；整体 Y 掩码有数值复核，早期弯曲完整朝向的历史验证边界保留 |
| 眼周点 | 16 | [基础配方](../../Docs/Recipes/SevenBrowsAndEyes.md)；每骨平移，注意后续眼皮和眼球接线 |
| 上眼皮 | 2 | [诊断](../../Docs/Troubleshooting/UpperEyelid.md)；旋转轴已修正，保留约 0.340 mm / 0.394° 的既有近似 |
| 下眼皮 | 2 | [下眼皮](../../Docs/Recipes/XYP_LowerLids.md)；数值、重载及用户效果确认 |
| 六嘴唇 | 6 | [唇控](../../Docs/Recipes/LipControls.md)；中央与侧唇联动 |
| 左右脸颊 | 2 | [脸颊](../../Docs/Recipes/CheekControls.md)；用户确认变形，蓝轴和输入符号已补偿；参考残差单列 |
| 鼻子整体 | 1 | [鼻子](../../Docs/Recipes/NoseControl.md)；鼻尖三轴平移 |
| 左右嘴角 / 总嘴控 | 3 | [嘴部](../../Docs/Recipes/MouthControls.md)；正负分支、源 Euler 层合成 |
| 单眼目标 | 2 | [眼球](../../Docs/Recipes/EyeballControls.md)；目标朝向及眼皮 / 眼袋联动 |
| 双眼总控 | 1 | [总控](../../Docs/Recipes/GazeMasterControl.md)；两眼跟随；Initial 错误已修复 |
| 下巴 | 1 | [下巴](../../Docs/Recipes/ChinControl.md)；UI 行程为初版 1/3，增益补偿保持完整动作 |
| 慌张 / 无语 / 思考 / 尴尬 | 4 | [整体表情](../../Docs/Recipes/ExpressionSliders.md)；8 条头部 / 瞳孔 Morph |
| 十二口型 | 12 | [口型](../../Docs/Recipes/PhonemeSliders.md)；12 条 Morph，独立参考图不计动画控制 |
| 左右气 / 怒 / 忧 / 笑 | 8 | [眼神](../../Docs/Recipes/EyeExpressionSliders.md)；8 条 Morph，源左右编号和后缀不规则 |
| 左右鼻侧 | 2 | [鼻侧](../../Docs/Recipes/NoseSideControls.md)；第 3 层 Y 合成鼻尖扭转，保留整体平移 |
| 合计 | **72** | 完整接口见 [名称总表](../../Docs/Reference/ControllerNames.md) |

各部位报告保留原批次含义。2026-11-09 额外对当时的新资产运行 1175 组迁移对照、12 个适配后的源样本验证器和 75 组正常帧预览；眉眼基础的迁移一致性不扩大成重新采集 Max 的全功能对照，所有动画、LOD 和最终视觉姿势也未完整验收。2026-11-10 的独立重建是另一批次，该批外观未通过，不能沿用前一批次的结构和显示结论。

2026-11-10 本轮适配保留全部 185 条原执行连接及 57 骨输出，再追加显示与输入适配。新发现并修复右脸颊横向为零时眼袋门控的约 2 mm 偏差；增加 22 组阈值两侧样本后复验通过。原始采样、备份、输入恢复、显示、数值、正常帧及持久化报告均在当前任务目录。原始 Max 中性与网格参考姿势仍有右脸颊约 0.16649 mm / 0.41026° 的差异，完整姿势对照使用固定每骨参考配准，源动作保持，不能将上述配准误差称为原始参考姿势完全一致。

最终正常帧验证覆盖 72 控制代表姿势、3 组全脸组合及中性，共 76 组；实际网格骨骼与 Rig 输出一致，28 条曲线均属于 Morph 类型，源姿势/最终曲线通过，输入与临时编辑器偏好已恢复。目标编辑器已打开；画面和拾取手感仍等待本轮用户验收。

## 已确定的布局

- 表情和口型在玩家正面视角的画面右侧，从左向右增加权重；眼神在画面左侧靠近角色，左右眼分两列，每列气 / 怒 / 忧 / 笑。
- 口型参考图逐行对齐，在滑块平面后方 6 cm：滑块 Y=18、图 Y=12；它是 `VIS_PHONEME_REFERENCE`，不参与求解和动画手柄计数。
- 鼻侧两个小手柄在鼻子整体下方；单眼目标以总控为父级，重置后应仍在眼前。

## 仍需保留的边界

1. 旧配方采用固定 Root / Rig 参考空间。本轮目标保留采样求解的头部跟随，并将手柄及滑轨随头部移动；本轮已测头部平移旋转，完整身体动画、LOD、非均匀缩放和最终用户操作仍须按用途验收。
2. 示例旧求解有约 0.393° 的上眼皮近似；本轮保留目标独立采样求解，当前 517 组的完整旋转误差约 0.0012°。这不改写旧证据，也不扩大成无限行程、全部动画姿势均通过。
3. 右脸颊中性参考差异约 `0.01665 cm / 0.41026°`。控制增量通过不能表述为绝对参考姿势完全一致；`Root_Camera` 静态基差异也不作为嘴控旋转误差。
4. UE 层级存在微小变换写入缓存容差；连续求解和独立实例公式验证要分别报告，见眼球配方。
5. 新增 Morph 后曾出现预览曲线缓存；应检查正常动画帧的最终 Morph 曲线及输入恢复，不能只看 Rig 层级值。
6. 现有 Seven 脚本有初次添加和早期断言限制；增量修改不能整套重放。新角色按 [主流程](../../Docs/Workflow/Build.md) 配置独立任务、重新绑定和定参，复用并适配共用脚本。

## 数据位置

[Evidence](Evidence/README.md) 保留参数、小报告和说明。2026-11-10 起，原始采样（`max_samples.json`）、旧控快照（`previous_controls.json`）、`before_outputs.json` 和 `SevenRuntime/graph_export.txt` 已移到目标项目 `Saved/FaceMigration/Characters/Seven/`（176.7 MB），CR58 早期批次移到 `Saved/FaceMigration/Imported/CR58/`；移动清单在 `preservation.manifest.json` 的 `moved_out`，`read_path` 会优先读项目侧。各部位文档的数量是对应批次，原 JSON 不改写成当前计数。`Saved/Codex/Backup/` 是本机备份，不随 Git 交接；所需证据已另存。

音频驱动口型、身体 IK/FK、七 Float 实验和 SevGame 版本兼容资料已移到项目 [ProjectNotes](../../ProjectNotes/README.md)，不属于本流程构建依赖。
