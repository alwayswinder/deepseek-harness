# XYP 下眼皮证据

2026-11-06，源场景 `D:/Download/Seven_Skin_New.max`，时间 0。UE 目标为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，预览网格为 `/Game/_MyTest/Mouth/Mesh/Seven`。

| 文件 | 范围 |
|---|---|
| [max_samples.json](max_samples.json) | 两侧 XYP 分别 33 档、每档 3 根下眼睑骨及枢轴；另有 3 档上下眼皮组合、每档 12 骨 |
| [parameters.json](parameters.json) | 分解到 UE 坐标的枢轴、旋转轴/角度、旋转前表达式位移、附加旋转，以及离线分解误差 |
| [build_report.json](build_report.json) | 构建后 394 节点 / 30 控制、83 组旧控制回归、执行链保持及备份路径 |
| [reload.json](reload.json) | 关闭目标资产编辑器并重载保存的包后，结构和编译状态检查 |
| [validation.json](validation.json) | 重载后独立实例的 198 条下眼睑完整变换对照、36 条上下眼皮组合、交叉、限位与回零 |

Max JSON 的 `p/q/scale` 是 Max 世界变换，长度单位 cm，四元数顺序 x/y/z/w；输入是原 position_list 第 2 层局部 Y。参数文件和 UE 验证使用本场景的点映射 `(x,-y,z)`、四元数映射 `(x,-y,z,w)`，并归一化比较朝向。该约定需按源骨架验证，不能推广到任意 FBX。

采样会临时设置 XYP_R/L 与 SYP_R/L 输入，并在正常和异常路径恢复原值；未保存 Max 场景。验证在 UE 临时实例中求解，不修改用户的预览值。数值结论仅对已列输入与骨骼有效。

效果验收：2026-11-06 用户在当前会话检查后确认“效果没问题”，左右下眼皮效果通过。此为用户反馈，未新增截图或扩充数值测试范围，原 JSON 报告保持不变。

实现及操作见 [XYP 下眼皮](../../../../Docs/Recipes/XYP_LowerLids.md)。
