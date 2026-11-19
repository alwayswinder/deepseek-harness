# 下巴整体证据（2026-11-09）

目标 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，新增 `CTRL_CHIN`，源为 `D:/Download/Seven_Skin_New.max` 的 `Line010`。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 0 帧、20 个相关源控制的参考位置与原始底层输入、55 组下巴和 20 组源组合；逐组 149 骨、辅助体、手柄及 Morph 通道变化 |
| [parameters.json](parameters.json) | 源 / UE 输入映射、控制行程、Euler 基、辅助体位置 / 旋转权重与 30 骨分段位置参数 |
| [previous_controls.json](previous_controls.json) | 添加前 45 控制的 238 组完整姿势 |
| [build_report.json](build_report.json) | 双份备份路径、构建前预览输入、原 / 新执行链、重接的输入与保存状态 |
| [validation.json](validation.json) | 重载后源对照、源组合、238 组旧控、476 组公式组合、初始值、限位、手柄轴向、重复求解和重置 |
| [reload_report.json](reload_report.json) | 包重载、完整执行链、复验、预览输入恢复及选中下巴控制 |
| [travel_adjustment.json](travel_adjustment.json) | 用户要求行程缩为 1/3：旧 / 新限位、三倍增益、等效姿势对照、预览输入补偿及保存重载 |

采样期间将 `jaw_move` 的 Y 临时归零，最终恢复它及 20 个相关控制的原始底层输入并读回检查；不保存 Max 场景。所有样本的有效 Morpher 通道未发现变化。原上眼皮近似误差单列，效果待用户检查；操作和验证边界见 [下巴整体](../../../../Docs/Recipes/ChinControl.md)。
