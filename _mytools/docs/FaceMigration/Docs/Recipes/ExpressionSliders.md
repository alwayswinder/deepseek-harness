# 四个整体表情滑块（2026-11-09）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。本组完成时为 **149 骨、50 控制、1818 节点、8 条 Morph 曲线**；后续追加了 [十二口型](PhonemeSliders.md)，当前统计见 [Seven 角色记录](../../Characters/Seven/README.md)。新增四个独立滑块，数值对照、旧控回归和保存重载通过，画面由用户检查。

## 操作与布局

四行滑块放在 **角色左侧、玩家视角右侧**，从上到下为 **慌张、无语、思考、尴尬**。各行使用不同颜色的球形手柄和轨道，行距 4 cm，轨道长 8 cm，手柄直径约 1 cm。层级中的显示名使用中文。

后续生成默认遵循[拾取间距规则](../Workflow/Build.md#滑块与滑轨的拾取间距)：手柄 shape 沿局部 +Y 前移 1 cm，轨道 Y=18、手柄中心 Y=19；旧置顶调试线关闭，轨道改为正常深度测试的不透明实体辅助形状，线宽 0.12 cm。控制 offset、输入与 Morph 增益保持原样；历史示例资产仍保留原布局。

| Max 控制 | UE 控制 | 显示名 | 同时驱动的两个 Morph |
|---|---|---|---|
| `Circle117` | `CTRL_EXPR_HUANGZHANG` | 慌张 | `Seven_Head_huangzhang`、`Seven_Pupil_huangzhang` |
| `Circle118` | `CTRL_EXPR_WUYU` | 无语 | `Seven_Head_wuyu`、`Seven_Pupil_wuyu` |
| `Circle119` | `CTRL_EXPR_SIKAO` | 思考 | `Seven_Head_sikao`、`Seven_Pupil_sikao` |
| `Circle120` | `CTRL_EXPR_GANGA` | 尴尬 | `Seven_Head_ganga`、`Seven_Pupil_ganga` |

在玩家视角中，从轨道左端向右端拖动球形手柄增加表情，左端为 0，右端为完整表情。每个控制采用 `POSITION` 类型，局部 X 范围 0–8，局部 Y/Z 锁为 0，Initial 值为 0。可以分别设置权重或叠加四项；设 X=4 为一半，X=8 为最大。

按用户截图确认的玩家视角，四行起点已改为 `(22,18,164/160/156/152)` cm，终点 X 为 30 cm。控制偏移旋转为单位四元数，局部正 X 与 Rig 全局正 X 一致，向玩家视角右侧增加权重。此次同时修正了首次布局的左右位置和滑动方向，原有表情输入值、8 cm 行程及 Morph 增益保持不变。面板使用固定 Rig 空间，未实现随头部动画移动。布局修正与重载证据见 [layout_adjustment.json](../../Characters/Seven/Evidence/ExpressionSliders/layout_adjustment.json)。

## 驱动与验证

源为 `D:/Download/Seven_Skin_New.max`，0 帧。四个 Max 控制均只有 Position List 第 2 层 X 可动，行程 0–6.8，Y/Z 锁定。采集 20 组单控中间值 / 端点及 4 组混合，共 24 组；逐组读取 149 根骨骼和 98 个有效 Morpher 通道。四项均不改变骨骼，每项独立驱动头部、瞳孔各一条 Morph；采样后恢复原始底层控制值，不保存 Max 场景。

源终点实际输出为 `100.028%`，因此 UE 保留源比例：`Morph = clamp(X,0,8) / 8 × 1.00028`。没有把头部、瞳孔漏接为单个 Morph，也没有套用其他整体表情。

新增 28 个 `EXPR_` 节点：每行读取、限幅、两路增益、两次 SetCurveValue 与一条轨道。原骨骼执行链保持，尾部追加 8 次曲线写入与 4 次绘制。

| 检查 | 结果 |
|---|---|
| 24 组源 Morph 对照 | 最大权重误差约 `6.94e-8` |
| 原 46 控制的 244 组姿势 | 最大骨骼位置变化 `3.62e-10 cm`、朝向变化 `0.00000513°` |
| 244 组旧控叠加四表情 | 骨骼保持原结果，八条 Morph 输出正确 |
| 四滑块交叉、上下限、手柄端点、初始值、重置及重复求解 | 通过 |
| 保存、包重载、完整执行链、重新求解 | 通过，恢复原预览输入并选中慌张滑块 |

### 预览动画复核

首次在新建曲线的预览实例中直接调用 `execute()` 后，发现 Rig 层级曲线有值而动画实例曲线为零。重新打开预览并由动画节点正常求值后，八条动画曲线均正确收到 `0.50014`，Morph 类型也正确。

排查时临时关闭 / 开启了实验性 Pose Adapter；重建预览后，两种配置均能正确输出，因此不能把首次异常归因于该开关。最终恢复原值 `ControlRig.EnableAnimNodePerformanceOptimizations=1`，项目配置没有增加优化开关。

重载脚本现在直接恢复控制输入，让预览动画节点正常求值，不在它之外提前执行一次 Rig。最终帧后检查见 [preview_morph_check.json](../../Characters/Seven/Evidence/ExpressionSliders/preview_morph_check.json)。若预览没有及时更新，可运行 `Tools/FaceMigration/Scripts/refresh_expression_preview.py` 重新打开并保留输入。

预览复核读取动画实例中最终求值的曲线及其 Morph 类型，未通过截图验收。`SkeletalMeshComponent.get_morph_target()` 读取手动覆盖值，与最终动画权重不同，因此其零值不作为失败判据。

本次数值验证不替代网格画面验收。已有骨骼控制的参考姿势 / 眼皮残差保持原边界，参见各部位文档。

## 脚本与证据

证据见 [ExpressionSliders](../../Characters/Seven/Evidence/ExpressionSliders/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_expression_sliders.ms` | Max 受控采样，返回 JSON，正常及异常路径恢复底层输入；通过 Max MCP 执行 |
| `Tools/FaceMigration/Scripts/build_expression_sliders.py` | 备份并增量建图，拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_expression_sliders.py` | 源曲线、旧控、混合、骨骼不变、限位、手柄及初始 / 重置检查 |
| `Tools/FaceMigration/Scripts/reload_expression_sliders.py` | 验证、保存重载、复验、恢复预览并选中慌张滑块 |
| `Tools/FaceMigration/Scripts/probe_expression_preview.py` | 临时设置四滑块一半权重，等待编辑器帧后读取最终动画曲线与 Morph 类型，恢复输入 |
| `Tools/FaceMigration/Scripts/refresh_expression_preview.py` | 重新打开预览、保留控制输入并帧后检查，不修改全局设置 |
| `Tools/FaceMigration/Scripts/update_expression_slider_layout.py` | 修正到角色左侧 / 玩家右侧，并使玩家从左到右增加权重；保留预览输入、保存重载 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_expression_sliders.py`。
