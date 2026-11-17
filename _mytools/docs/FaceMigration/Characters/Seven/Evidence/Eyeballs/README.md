# 左右眼球控制的证据

2026-11-06，源为 `D:/Download/Seven_Skin_New.max`，目标为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。重载后结构为 149 骨、44 控制、1460 节点。

| 文件 | 内容 |
|---|---|
| [max_samples.json](max_samples.json) | 0 帧、中性、七个相关控制原始输入和参考变换；82 组转眼、20 组眼皮组合；逐组 149 骨、辅助点、手柄及 98 个有效 Morpher 通道检查 |
| [parameters.json](parameters.json) | 两侧目标点、源输入基和逆矩阵、枢轴、固定 up、眼皮 Euler 基、22 骨响应及拟合误差 |
| [previous_controls.json](previous_controls.json) | 添加前 42 控制的 154 组姿势（中性与差异），另有 20 组眼皮姿势完整快照 |
| [build_report.json](build_report.json) | 双份备份路径、原预览值、原 / 新执行链、插入点、节点统计与保存状态 |
| [validation.json](validation.json) | 重载后源对照、174 组旧控与 348 组独立实例组合、缓存残差、重复求解、回零、输入和手柄方向 |
| [reload_report.json](reload_report.json) | 包重载、编译、执行链可达、重载后验证、预览恢复并选中左眼球 |

采样临时归零 `YanJing_L001/R001/Zong001`、`SYP_L001/R001`、`XYP_L001/R001`，正常和异常路径均恢复保存的底层输入。其他源控制保留当时场景值；对照各自中性的完整变换增量，不把源场景全部绝对参考姿态视为 UE 参考姿态。

眼皮组合中的上眼皮保留原近似误差，报告单列。`warm_cache_*` 为连续切换时的残差，并按 `FRigComputedTransform::Equals` 的分量容差检查；`regression_mixed_*` 为独立实例的严格公式复核。详见 [操作与边界](../../../../Docs/Recipes/EyeballControls.md)。数值和持久化通过，画面由用户检查。
