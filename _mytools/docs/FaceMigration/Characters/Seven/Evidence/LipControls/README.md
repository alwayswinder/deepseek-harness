# 六个嘴唇控制证据

采集日期：2026-11-06。Max 场景 `D:/Download/Seven_Skin_New.max`，时间 0；UE 目标为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。

| 文件 | 内容 |
|---|---|
| [max_expressions.txt](max_expressions.txt) | 12 个目标对应 KPoint 的位置与旋转表达式，包含本次范围以外的变量；只有指定六唇控的贡献被迁移 |
| [max_samples.json](max_samples.json) | 6 × 9 档单控和 6 组组合，12 骨完整变换；98 个有效 Morpher 通道变化检查；缩放包含矩阵行列式符号 |
| [parameters.json](parameters.json) | 六控位置、方向、满行程全局位移；线性拟合最大位置残差约 `0.0000153 cm` |
| [previous_controls.json](previous_controls.json) | 修改前 149 骨中性姿势、原 30 个控制的 89 组输入及变化骨快照；每组完整姿势由 `neutral` 与该组 `bones` 合并还原 |
| [build_report.json](build_report.json) | 394 → 506 节点、30 → 36 控制、12 个 SetTransform、备份位置与保存状态 |
| [validation.json](validation.json) | 重载后的 60 组 Max 对照、限位、非目标骨独立性、89 组旧控回归、89 组混合输入和回零 |
| [reload_report.json](reload_report.json) | 保存包重载成功、执行链、重载后数值复核结果 |

构建时第一次完整缩放检查发现 Max `scalePart` 对镜像人中仅返回正幅值。随后补采矩阵行列式，使用有符号缩放复核通过；Rig 一直保留原始缩放，无须修改网格或重新导出。

这些是当前源场景与资产的数值快照。没有把编译通过或数值通过记为用户画面验收。操作说明见 [六个嘴唇控制](../../../../Docs/Recipes/LipControls.md)。
