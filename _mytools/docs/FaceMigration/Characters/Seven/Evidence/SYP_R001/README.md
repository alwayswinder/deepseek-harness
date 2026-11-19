# SYP_R001 诊断采样

采集日期：2026-11-06；来源是本次会话中运行的 3ds Max MCP、UE Python 远程执行和几何脚本只读提取。数据从 `Saved/Codex/` 复制留存，没有修改原始数值。

- Max：`D:/Download/Seven_Skin_New.max`，时间 0，SYP_R001 / SYP_L001 局部 Y 从 0 到 -1.75 的 9 个样本。探测后恢复输入。
- UE 原 Rig：`/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders`，预览网格 `/Game/_MyTest/Mouth/Mesh/Seven`，独立测试实例显式复制资产层级，控制 Z 从 0 到 -10。
- 本目录“原 Rig”均指旋转修正前的历史状态。后续早期眉眼基线 Rig 已同步旋转参数，12:24 的新复核在上一级 [control_rig_recheck_2026-11-06.json](../control_rig_recheck_2026-11-06.json)；历史 JSON 保留原样。
- 对照副本：`/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，只改世界旋转轴和对应角度系数，位置沿用原圆弧拟合。
- 长度单位 cm；旋转四元数顺序 x/y/z/w。Max 原始四元数按 Max 约定保存，比较前使用本场景已核对的 UE 映射 `(x,-y,z,w)`；不能将其推广到任意 FBX 骨架。
- 权重文件的 `p` 均已按点坐标 `(Max.x,-Max.y,Max.z)` 换到 UE 坐标；`lid_max_samples.json` 内 `p` 仍是原 Max 坐标。Max 顶点索引从 1 开始，UE 动态网格顶点索引从 0 开始，按参考位置匹配而非索引直接对应。

| 文件 | 内容 |
|---|---|
| [lid_max_samples.json](lid_max_samples.json) | 两侧 6 骨 × 9 样本，54 条原始变换 |
| [lid_live_poses.json](lid_live_poses.json) | 原 Rig 两侧 6 骨 × 5 样本，30 条变换，以及 API 探测信息 |
| [lid_rotation_analysis.json](lid_rotation_analysis.json) | 原 Rig 与 Max 的位置/朝向差、修正旋转轴、端点插值误差 |
| [lid_spin_fix_validation.json](lid_spin_fix_validation.json) | 对照副本 54 条逐样本误差及最大误差 |
| [lid_max_weights.json](lid_max_weights.json) | Max 410 个眼睑骨影响顶点的参考位置、骨名与权重 |
| [lid_import_weights.json](lid_import_weights.json) | UE LOD 提取的 408 个影响顶点及权重；全网格 16829 顶点 |
| [lid_weight_comparison.json](lid_weight_comparison.json) | 参考位置最近点匹配结果摘要与 5 条最大权重差记录 |

匹配不是对全部模型/LOD 的一一拓扑证明；它支持眼睑区域没有明显位置或权重丢失的判断。原 Rig 最大旋转误差约 46.448°，对照副本最大约 0.394°，后者仍有约 0.340 mm 位置拟合误差，未完成所有组合姿势与画面验收。

DQ 权重全零的结论来自 Max MCP 查询结果，未单独导出逐顶点 DQ JSON；不能把本页权重文件当作完整 DQ 证据。结论和复现边界见 [诊断报告](../../../../Docs/Troubleshooting/UpperEyelid.md)。
