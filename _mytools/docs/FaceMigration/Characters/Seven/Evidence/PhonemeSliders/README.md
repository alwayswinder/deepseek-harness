# 十二口型滑块证据（2026-11-09）

目标 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，源 `D:/Download/Seven_Skin_New.max`。源控制名、排列顺序与 Morph 对应见 [口型滑块](../../../../Docs/Recipes/PhonemeSliders.md)。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 12 控制原始底层值、中性、73 组单控 / 混合，逐组 149 骨与 98 个有效 Morpher 通道 |
| [parameters.json](parameters.json) | 控制 / Morph 对应、源行程、增益、十二行位置与黄色样式 |
| [previous_controls.json](previous_controls.json) | 添加前 50 控制的 257 组全骨骼姿势与原八条表情曲线 |
| [build_report.json](build_report.json) | 双份备份、原预览输入、结构统计、原 / 新执行链与保存状态 |
| [validation.json](validation.json) | 重载后源曲线、旧控 / 原表情、组合、骨骼不变、端点、限位、初始及重置 |
| [reload_report.json](reload_report.json) | 保存重载、执行链、复验、原预览输入恢复与选择 |
| [preview_morph_check.json](preview_morph_check.json) | 等待编辑器帧后读取十二口型的最终动画曲线和 Morph 类型，结束恢复原输入 |
| [preview_before_refresh.json](preview_before_refresh.json) | 新增曲线后首次包重载，预览缓存尚未刷新时的零输出；后续重新打开预览，最终状态以 preview_morph_check 为准 |

Max 采样只改变这十二项 X 输入，其他控制及微小 Y/Z 值保持；正常与异常路径均恢复全部底层原值并读回检查。不保存 Max 场景；最终画面由用户确认。
