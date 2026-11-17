# 四个整体表情滑块证据（2026-11-09）

目标 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，源 `D:/Download/Seven_Skin_New.max` 中 `Circle117`–`Circle120`。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 原始底层输入、中性、24 组单控 / 混合，全部 149 骨和 98 个有效 Morpher 通道 |
| [parameters.json](parameters.json) | 中文显示名、控制 / Morph 对应、源行程、输出增益、四行布局和颜色 |
| [previous_controls.json](previous_controls.json) | 添加前 46 控制的 244 组姿势 |
| [build_report.json](build_report.json) | 双份备份、预览输入、节点 / 控制数量、原 / 新执行链及保存状态 |
| [validation.json](validation.json) | 重载后源曲线、旧控、组合、骨骼不变、端点、限位、初始 / 重置检查 |
| [reload_report.json](reload_report.json) | 包重载、执行链、重新验证、预览输入恢复与选择 |
| [layout_adjustment.json](layout_adjustment.json) | 按用户截图修正为角色左侧 / 玩家右侧，从左到右增加权重；变更前后位置 / 朝向、备份、预览输入保留与重载 |
| [preview_morph_check.json](preview_morph_check.json) | 原有优化设置为 1 下，等待编辑器帧后读取最终动画曲线和 Morph 类型，结束恢复原输入 |
| [pose_adapter_disabled_probe.json](pose_adapter_disabled_probe.json) | 排查时临时关闭优化后也能正确输出；最终已恢复原设置，不能据此归因为优化开关故障 |

源采样只修改四个滑块，其他源控制保持当时值；四滑块的骨骼响应以本次中性为基准比较。画面由用户确认；操作见 [表情滑块](../../../../Docs/Recipes/ExpressionSliders.md)。
