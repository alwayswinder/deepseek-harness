# 三个嘴部整体控制的证据

2026-11-06，源为当前运行中的 Seven Max 场景，目标为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。使用与已迁移唇控、脸颊、鼻子相同的 149 骨名单。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 场景名、0 帧、中性、12 个相关控制原始值/限位、125 组嘴控、12 组源混合，逐样本 149 骨完整变换与目标 KPoint Euler 层，98 个 Morph 通道变化检查 |
| [max_expressions.txt](max_expressions.txt) | 受影响骨骼辅助链上的位置及旋转表达式只读摘录 |
| [parameters.json](parameters.json) | 三控制界面映射、20 骨分段位置/Euler 系数、14 骨旋转基及离线拟合误差 |
| [previous_controls.json](previous_controls.json) | 新增前 39 控制的 130 组姿势，保存中性与每组差异 |
| [build_report.json](build_report.json) | 双份备份目录、原预览值、原执行链、插入位置、节点统计与保存状态 |
| [validation.json](validation.json) | 重载后 125 组源嘴控、12 组源组合、130 组旧控、260 组旧控组合；全骨变换、限位、回零、重复求解、手柄方向 |
| [reload_report.json](reload_report.json) | 保存重载、执行链可达、编译状态、预览恢复及选中总嘴控 |

Max 采样期间将 `jaw_move` 第 2 层 Y 从约 −1.22047 临时设为 0，恢复值保存在 `preserved_jaw_move_y`。相关控制保存 Float Limit 下的原始 Bezier 值，正常和异常路径均恢复；不保存 Max 场景。当前帧保持原值，采样在 `at time 0` 范围执行。

本组验证以**控制增量**为判据，同时公开绝对残差；右脸颊既有参考差异和未参与本组控制的 Root_Camera 静态旋转差异见 [操作与边界](../../../../Docs/Recipes/MouthControls.md)。数值和重载通过不代表用户已验收画面效果。
