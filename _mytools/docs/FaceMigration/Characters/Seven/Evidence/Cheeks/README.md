# 左右脸颊控制证据

2026-11-06，Max 场景 `D:/Download/Seven_Skin_New.max`，时间 0；UE 目标为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。

| 文件 | 内容 |
|---|---|
| [max_expressions.txt](max_expressions.txt) | 12 个目标对应 KPoint 的位置/旋转表达式，包含眼袋 X 条件分支；其他变量不在本次迁移范围 |
| [max_samples.json](max_samples.json) | 54 组样本的 12 目标完整变换、源控制姿势/冻结值/轴方向、暂时归零的嘴唇原值；初次扫描全部 149 骨、其余 137 骨最大位置变化 0，98 个有效 Morpher 通道变化检查 |
| [parameters.json](parameters.json) | 左右分别测量的 X/Z 正负分支、眼袋门控位移与切换阈值；最大离线拟合位置残差约 `0.0000161 cm` |
| [previous_controls.json](previous_controls.json) | 修改前 149 骨中性姿势与原 36 控制的 107 组输入；每组完整姿势由 `neutral` 与该组 `bones` 合并还原 |
| [build_report.json](build_report.json) | 506 → 650 节点、36 → 38 控制、原执行连线、两个共用人中的接入点、10 个新增 SetTransform 与备份位置 |
| [validation.json](validation.json) | 重载后的 Max 对照、绝对/增量误差、参考姿势残差、旧控回归、214 组混合输入、重复求解、限位及回零 |
| [reload_report.json](reload_report.json) | 保存包重载成功、47 个执行节点的完整链、重载后验证结果 |
| [axis_adjustment.json](axis_adjustment.json) | 用户确认变形效果后，反转左右蓝色轴并补偿 Z 输入；54 组 × 149 骨变形不变、手柄世界位置保持、重载通过 |

右 `lianjia_R` 在修改前就有约 0.1665 mm / 0.41026° 的 Max/UE 中性差异，保持原 UE 参考姿势。验证通过指本组控制的增量、联动和回归通过；不是声明该骨绝对变换已完全对齐。

零点附近的输入采用缩放后的科学计数法输出，避免 Max 格式化函数把非零极小值写成 0，掩盖眼袋门控切换。采样脚本正常/异常路径恢复两个脸颊和六个嘴唇的原始输入。2026-11-06 用户确认脸颊变形效果通过；轴向调整后的操作手感待后续检查。参数中的 `source_control_rotation` 保留初版方向，`control_rotation` 为修正后手柄方向，`input_sign=[1,1,-1]` 用于源输入换算；位移系数保持原值。

操作说明见 [左右脸颊控制](../../../../Docs/Recipes/CheekControls.md)。
