# 双眼总控证据（2026-11-09）

目标为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，新增 `CTRL_EYEBALL_MASTER`。源为 `D:/Download/Seven_Skin_New.max`。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 0 帧、中性、七个源控制原始值、47 组总控 / 单眼和 20 组眼皮组合；逐组 149 骨、辅助点、手柄及 98 个有效 Morph 通道检查 |
| [parameters.json](parameters.json) | 总控源输入基及逆矩阵、参考位置、每侧独立分段位置项与离线误差 |
| [previous_controls.json](previous_controls.json) | 添加前 44 控制的 210 组完整姿势 |
| [build_report.json](build_report.json) | 双份备份路径、原预览输入、执行链、修改的输入连接、节点数及保存状态 |
| [validation.json](validation.json) | 重载后源对照、210 组旧控、420 组公式组合、手柄跟随、重复求解和回零 |
| [reload_report.json](reload_report.json) | 保存重载、完整执行链、复验、原预览输入恢复及选中总控 |
| [initial_position_fix.json](initial_position_fix.json) | 单眼手柄落到脚底的原因、修复前后 Initial 值和位置、备份目录、重载与实时预览复核 |

当前 `validation.json` 另含 `authored_defaults` 和 `reset_without_manual_zero_passed`，检查主动清零输入之前的原始初始值，并验证重置姿势。此前测试的主动清零掩盖了改父级导致的错误默认值；用户反馈后已修复并补测。

采样临时归零三个眼球控制和四个上下眼皮控制，正常及异常路径均恢复底层值，不保存 Max 场景。其余源控制保持当时值；对照以各自中性的完整变换增量为准。

上眼皮的既有近似残差单独记录。精确组合复核强制临时实例的驱动骨骼超过缓存写入容差，方法见 [操作与验证说明](../../../../Docs/Recipes/GazeMasterControl.md)。画面待用户检查。
