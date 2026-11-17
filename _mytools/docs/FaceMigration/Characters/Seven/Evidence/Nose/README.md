# 鼻子控制证据

2026-11-06，Max 场景 `D:/Download/Seven_Skin_New.max`，时间 0；UE 目标 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。

| 文件 | 内容 |
|---|---|
| [max_wires.txt](max_wires.txt) | 鼻子位置层限位、Position Wire、KPoint 和鼻尖约束链 |
| [max_samples.json](max_samples.json) | 41 组鼻子样本、源手柄变换、鼻尖完整变换、临时归零控制的有效/原始输入；初扫 149 骨，非目标最大位置变化为 0；98 个有效 Morpher 通道变化检查 |
| [parameters.json](parameters.json) | UE 世界轴映射、控制位置、XYZ 限位、0.1 增益、拟合残差及源旋转/缩放增量 |
| [previous_controls.json](previous_controls.json) | 修改前 149 骨中性和原 38 控制的 123 组输入；每组由 `neutral` 与该组 `bones` 合并还原 |
| [build_report.json](build_report.json) | 650 → 657 节点、38 → 39 控制、原执行连接、备份位置与保存状态 |
| [validation.json](validation.json) | 重载后的完整 Max 对照、非目标骨、限位、手柄轴、123 组回归、246 组混合、重复求解和回零 |
| [reload_report.json](reload_report.json) | 保存包重载、执行链、复核结果、预览恢复与鼻子选中状态 |

采样保留 Float Limit 下的原始值，包含鼻子 X 被夹住的负输入；不会用夹紧后的有效 0 覆盖原值。源参数当前仅有鼻尖平移贡献，旋转/缩放及 Morph 均无增量。

这些是数值快照；尚未记录本组用户画面验收。操作见 [鼻子控制](../../../../Docs/Recipes/NoseControl.md)。
