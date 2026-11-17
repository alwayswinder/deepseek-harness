# 左右鼻侧控制证据（2026-11-09）

实现、操作和边界见 [左右鼻侧小控制](../../../../Docs/Recipes/NoseSideControls.md)。源为 `D:/Download/Seven_Skin_New.max` 的两个鼻侧第 3 层位置控制和鼻子整体第 2 层位置控制，0 帧。最终画面由用户确认。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 原始九个底层值、中性、103 组完整输入；每组 helper 变换、149 骨、98 个有效 Morpher 通道 |
| [source_validation.json](source_validation.json) | 旋转及位置拟合误差、非目标骨 / Morph 不变 |
| [parameters.json](parameters.json) | 源层 / 轴、UE 控制名、蓝轴行程、整体控制下方布局及旋转公式 |
| [previous_controls.json](previous_controls.json) | 添加前 124 组旧姿势，全部骨骼与 28 条曲线 |
| [build_report.json](build_report.json) | 双份备份、原预览输入、结构统计、原旋转输入和执行链 |
| [validation.json](validation.json) | 重载后 103 组源对照、124 组旧控及 248 组组合、限位 / 初始 / 回零 / 抵消 |
| [reload_report.json](reload_report.json) | 保存重载、复验、输入恢复和选择状态 |
