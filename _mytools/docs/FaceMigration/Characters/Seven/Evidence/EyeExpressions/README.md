# 左右眼神滑块证据（2026-11-09）

实现及控制映射见 [左右眼神](../../../../Docs/Recipes/EyeExpressionSliders.md)。目标为当前 `CR_Seven_LidWorldRotation`，源场景为 `D:/Download/Seven_Skin_New.max`，0 帧。左右以源 Max 控制名为准，Morph 名后缀恰好相反，已读取实际 Float Wire 连线并逐项采样确认。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 原底层 XYZ、中性、53 组单控及混合；每组 149 骨、98 个有效 Morpher 通道 |
| [parameters.json](parameters.json) | 八个源 / UE 控制、真实 Morph 对应、源 Y 范围、8 cm 行程及两列布局 |
| [source_validation.json](source_validation.json) | 全 98 个通道的映射拟合、全骨骼不变检查 |
| [previous_controls.json](previous_controls.json) | 添加前 111 组旧骨骼控制、整体表情及口型姿势，全部骨骼及原 20 条曲线 |
| [build_report.json](build_report.json) | 双份备份、原预览输入、结构统计与原 / 新执行连接 |
| [validation.json](validation.json) | 重载后 53 组源对照、111 组旧控回归及 111 组眼神叠加，初始、复位、限位及误差 |
| [reload_report.json](reload_report.json) | 保存重载、完整执行链、重载后复验、用户输入恢复及选择 |
| [preview_morph_check.json](preview_morph_check.json) | 正常预览帧中的八条 Morph 类型和一半权重，结束恢复原输入 |
| [preview_before_refresh.json](preview_before_refresh.json) | 首次重载后、刷新前预览曲线为零的缓存记录；不代表最终状态 |
| [preview_restored.json](preview_restored.json) | 帧后检查用户原输入恢复及新曲线归零 |
| [layout_adjustment.json](layout_adjustment.json) | 两列移到玩家视角角色左侧，手柄 / 轨道同步，三组输出保持、保存重载及输入恢复 |

未使用 computer-use 或截图验收，最终画面由用户确认。
