# 十二个口型滑块（2026-11-09）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。本组完成时为 **149 骨、62 个动画控制、1878 节点、20 条 Morph 曲线**；参考图随后新增 1 个 Visual Cue，未增加图节点。当前完整资产见 [Seven 角色记录](../../Characters/Seven/README.md)。12 个口型滑块放在现有四个整体表情滑块旁，数值与保存重载验证通过，画面由用户检查。

## 操作与布局

布局位于 **角色左侧、玩家视角右侧**。四表情列在 X=22–30 cm，新口型列在 X=34–42 cm，两列间隔 4 cm；Y 均为 18 cm。12 行从上到下严格按用户给定顺序排列，起始 Z=164 cm，行距 4 cm，末行 Z=120 cm。使用黄色轨道与球形手柄，手柄直径约 1 cm；层级显示名沿用 Max 控制名，便于逐项对照。

上述 Y=18 为控制 offset 与轨道所在平面。后续生成按[拾取间距规则](../Workflow/Build.md#滑块与滑轨的拾取间距)将手柄 shape 沿局部 +Y 前移 1 cm，中心为 Y=19；旧置顶调试线关闭，轨道改为正常深度测试的不透明实体辅助形状，线宽 0.12 cm。参考图现在显示于 Y=17，仅在轨道后方 1 cm，保留辅助控制原 offset。历史示例资产保持不变。

每行 **从玩家视角左端向右端拖动**增加口型，左端为 0，右端为完整权重。控制类型为 `POSITION`，局部 X 范围 0–8，局部 Y/Z 锁定为 0，Initial 值为 0；X=4 为一半权重，X=8 为完整权重。各项可独立使用或叠加，也可与骨骼嘴部控制、四个整体表情组合。

| 顺序 | Max / 显示名 | UE 控制 | 实测对应 Morph |
|---|---|---|---|
| 1 | `a_FV_ctrl01` | `CTRL_PHONEME_A_FV_01` | `1_jian` |
| 2 | `b_FV_ctrl002` | `CTRL_PHONEME_B_FV_002` | `1_xiaozhang` |
| 3 | `c_FV_ctrl003` | `CTRL_PHONEME_C_FV_003` | `1_nu` |
| 4 | `A_ctrl` | `CTRL_PHONEME_A` | `1_happy` |
| 5 | `EE_ctrl` | `CTRL_PHONEME_EE` | `1_you` |
| 6 | `FV_ctrl` | `CTRL_PHONEME_FV` | `1_qi` |
| 7 | `GNK_ctrl` | `CTRL_PHONEME_GNK` | `1_hellow` |
| 8 | `MBP_ctrl` | `CTRL_PHONEME_MBP` | `1_yi` |
| 9 | `SH_ctrl` | `CTRL_PHONEME_SH` | `1_xiu` |
| 10 | `W_ctrl` | `CTRL_PHONEME_W` | `1_hou` |
| 11 | `Other_ctrl` | `CTRL_PHONEME_OTHER` | `1_jing` |
| 12 | `a_A_ctrl02` | `CTRL_PHONEME_A_A_02` | `1_pa` |

对应关系来自 Max 实测，不以导出的 Morph 名称推断发音。全部使用当前 Seven 网格已存在的 Morph，不需要重新导出模型。独立资产 `CR_Seven_FaceMorphs` 也使用其中部分 Morph，但本次只修改当前诊断 Rig。

## 口型参考图

2026-11-09 使用用户提供的 `Texture2D /Game/_MyTest/Mouth/LidDiagnostic/口型单列竖排12个_去背景_1`（1158 × 3620），在每行滑块右侧添加对应口型。按原图自上而下顺序对应上表；原图各行不等距，通过十二块独立 UV 平面对齐到 Z=164–120 cm，行距 4 cm。图形中心 X=47、Y=12 cm，口型最大宽 4.5 cm，所有行保持同一像素比例。显示区域只取十二个口型，跳过外围留白和底部水印，原贴图未修改。

用户反馈滑块偶尔难选中后，参考图从 Y=18 后移到 Y=12 cm，位于滑块 Y=18 平面后方 6 cm；X/Z 和逐行对齐保持，减少斜视时参考图平面对滑块拾取的遮挡。参考图仍是不可选择的 Visual Cue。`Tools/FaceMigration/Scripts/update_phoneme_reference_depth.py` 已备份、保存重载并恢复用户输入，其他控制偏移与 Rig 节点 / 执行连接保持；实际选取手感由用户确认。

上段是旧版修改记录。2026-11-11 改为正常深度测试的实体滑轨后，用户要求收近图形与滑轨：当前目标参考图从显示 Y=12 收近到 Y=17，轨道后方间距从 6 cm 减至 1 cm，X/Z、比例、行序、控制 offset 和手柄间距保持。此调整通过参考图 Initial/Current shape translation 完成；共用生成器、验证器与 `update_phoneme_reference_depth.py` 均遵循新规则，历史示例不改写。

展示资产位于 `/Game/_MyTest/Mouth/LidDiagnostic/PhonemeReference/`：`SM_PhonemeReference` 是 24 三角面的参考网格，`M_PhonemeReference` 使用原贴图 RGB 自发光、Alpha 遮罩和双面显示，`SL_PhonemeReference` 是独立形状库。Rig 保留原默认形状库，追加此库。`VIS_PHONEME_REFERENCE` 是三轴锁定的 POSITION / VISUAL_CUE，只用于显示，不参与骨骼或 Morph 驱动，也不作为动画滑块。

保存重载后复核图形绑定与位置，预览已实际创建可见的 ShapeActor，并绑定上述网格及材质。14 组中性、逐项完整权重和组合输入的全部骨骼 / 20 条曲线，与添加前完全一致；1878 个节点与执行连接保持。视觉大小和顺序由用户检查。证据见 [PhonemeReference](../../Characters/Seven/Evidence/PhonemeReference/README.md)。

新增脚本：`Tools/FaceMigration/Scripts/build_phoneme_reference.py` 负责双份备份、创建资产、添加参考图和输出对照；`Tools/FaceMigration/Scripts/finalize_phoneme_reference.py` 保存重载并恢复预览；`Tools/FaceMigration/Scripts/verify_phoneme_reference_preview.py` 只读检查预览绑定。原 `verify_phoneme_sliders.py` 按非 Visual Cue 控制统计至少 62 个原动画控制，允许附加参考图及后续眼神组。

## 驱动与验证

源为 `D:/Download/Seven_Skin_New.max`，0 帧。12 个控制均由 Position List 第 2 层 X 输入驱动，源行程 0–1。源 Y/Z 是保留微小参考值的 Bezier 轨道，采样只改变 X，不重置 Y/Z；结束时读取检查全部底层输入已恢复，不保存 Max 场景。

采集 60 组单控（每项 0.125、0.25、0.5、0.75、1）、12 组混合与 1 组全部为 1，共 **73 组**。逐组读取全部 149 骨和 98 个有效 Morpher 通道；各项只驱动表中各自一条头部 Morph，骨骼保持原值。映射为 `Morph = clamp(X,0,8) / 8`，混合参数拟合最大权重误差约 `3.6e-8`。

新增 **60 个 `PHON_` 节点**，每行包含读取、限幅、增益、SetCurveValue 和轨道绘制。原节点与执行连接保持，尾部追加 12 个曲线写入和 12 条轨道绘制；原四表情的八条曲线单独保留。

验证包含 73 组源曲线、原 50 控制的 257 组回归及 257 组叠加口型，检查全骨骼变换和原八条表情曲线保持；另检查单轴限位、初始值、重置、重复求解、手柄起终点、完整执行链与保存重载。预览动画曲线另作帧后读取，最终网格效果由用户确认。

控制板仍使用固定 Rig 空间，未实现随头部动画移动。此前预览缓存排查见 [四个整体表情滑块](ExpressionSliders.md)，本次未修改项目优化开关、引擎源码或正式 `CR_Seven_MorphSliders`。

新建曲线后首次包重载也出现了 Rig 曲线正确、动画实例暂未更新的预览缓存现象；使用 `refresh_phoneme_preview.py` 重新打开编辑器并保留全部输入，随后进行帧后检查。前后快照分别留在证据目录，不能把 Rig 层级曲线正确单独当成网格预览已经正确。

## 脚本与证据

证据见 [PhonemeSliders](../../Characters/Seven/Evidence/PhonemeSliders/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_phoneme_sliders.ms` | Max 受控采样，返回 JSON，正常及异常路径恢复底层输入；通过 Max MCP 执行 |
| `Tools/FaceMigration/Scripts/build_phoneme_sliders.py` | 双份备份、旧控 / 表情曲线快照、增量建图，拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_phoneme_sliders.py` | 源曲线、旧控及表情、口型组合、骨骼不变、限位、初始 / 重置与端点检查 |
| `Tools/FaceMigration/Scripts/reload_phoneme_sliders.py` | 验证、保存重载、复验、恢复原输入并选中首个口型 |
| `Tools/FaceMigration/Scripts/probe_phoneme_preview.py` | 临时设置十二口型一半权重，帧后读取最终动画 Morph 曲线并恢复原输入 |
| `Tools/FaceMigration/Scripts/refresh_phoneme_preview.py` | 保留全部控制输入，重新打开预览刷新曲线传输，并帧后检查 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_phoneme_sliders.py`。
