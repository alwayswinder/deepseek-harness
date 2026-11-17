# Seven01 面部 Control Rig

2026-11-17 按新角色流程完成技术交付，任务 `seven01-taskflow-20261117`。当前资产为 `/Game/_MyTest/Mouth/Seven01ECR/CR_Seven01_Expression`（`ControlRigRuntimeAsset`）；只读示例为 `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression`。配置见[本任务](../../Jobs/seven01-taskflow-20261117.json)，输入见[绑定表](face-controls.json)，执行规范见[主流程](../../Docs/Workflow/Build.md)。

## 产出

- 72 个动画控制 + 2 个 Visual Cue，149 骨、28 输出曲线，1927 节点 / 2645 连接；保留私有 `FACE_AnimatedHead` 与 `head001 → FACE_SPACE`。
- 根目录直接放 `CR_Seven01_Expression`，其余 8 个依赖全部放 `ToolsPanel/`：`T_expression`、`M_PhonemeReference`、`SM_PhonemeReference`、`SL_PhonemeReference`、`M_SliderRails`、`SM_SliderRails`、`SL_SliderRails` 和本任务生成的 `ABP_FacePreview`。
- CR 与全部 8 个依赖已保存重载，目标包干净，输入恢复到 Initial；引用检查未发现 SevenECR 角色专用依赖残留。SevenECR 示例及 7 个依赖磁盘摘要未变。目标资产编辑器已打开。

## 本轮验证

| 检查 | 结果 |
|---|---|
| 独立绑定探测 | 目标原为 149 骨 / 87 曲线、0 控制、1 节点的空壳；与示例使用同一网格，骨位置最大差 0.00000211 cm，判为绑定等价 |
| 示例 → 目标 | 保存前、重载后各 1175 组；骨骼、曲线、控制位置误差均为零 |
| 显示与依赖 | 显示参数 0 差异，形状均可解析；CR → 形状库 → 网格/材质 → 贴图已重绑定 |
| 动画头部空间 | 保存前、重载后各 592 组，包含 5 个身体动画时刻的独立实例输入；头部/身体输入保留通过 |
| 控制器头部跟随 | 控制器、滑轨、参考图平移旋转跟随及重复求解检查通过 |
| 当前 Max | 场景 `D:/Download/Seven_Skin_New.max`，帧 0、厘米；72 个控制器名称唯一性核对通过；右上眼皮五点抽检主骨最大误差 0.00343985 cm / 0.00059242°；输入与 Morpher 全部恢复 |
| PIE 正常帧 | 28 条 Morph 半程与恢复通过；81 组逐控、组合、恢复及非零头部变换通过；时钟推进，输入恢复误差 0 |
| 清理 | 本工具启动的 PIE 已关闭，临时 Actor 已移除，用户关卡未保存 |

## 适用范围与未测项

绑定等价允许继承示例求解，本轮没有重新拟合其余 71 个控制。预览所需的三个小型曲线定义参数已采纳并记录[来源与摘要](parameter-provenance.json)；未复制历史采样或历史验证结果。旧求解回归基线不适用于本角色，明确跳过，不计为通过。

右上眼皮次级 Link Constraint 骨 `Bone027` 保留示例已有近似，当前抽检最大差 0.0208485 cm / 0.39335415°，不能以主骨通过掩盖此项。RuntimeAsset 的私有变量附加 Cinematics 标记与分类等引擎元数据差异已单列记录；变量类型、默认值和私有性一致。

本任务采用 PIE 正常帧宿主，未测试资产编辑器自身的预览时钟；身体动画播放宿主、Sequencer、用户画面及实际拾取/手感仍未验收。因此结论为“技术检查通过，待用户画面验收”，不宣称整体验收通过。不要对该非空目标重跑空目标构建器，后续走增量。

报告与备份位于目标项目 `Saved/FaceMigration/Jobs/seven01-taskflow-20261117/Current/`；汇总为 `Evidence/delivery_check.json`，本轮问题清单为 `Evidence/flow_findings.md`。
