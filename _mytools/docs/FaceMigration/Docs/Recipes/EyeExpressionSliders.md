# 左右眼神：气、怒、忧、笑（2026-11-09）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，新增八个独立眼神滑块。本组完成时为 **149 骨、70 个动画控制 + 1 个参考图 Visual Cue、1918 节点、28 条 Morph 曲线**；当前完整资产见 [Seven 角色记录](../../Characters/Seven/README.md)。源对照、旧控及组合回归、限位和保存重载通过，视觉效果由用户检查。

## 使用及布局

按用户反馈，已从口型参考图右侧移到 **玩家视角的画面左侧、靠近角色**。两列中，左列是蓝色的右眼控制，起终点 X=−34～−26 cm；右列是绿色的左眼控制，X=−22～−14 cm。两列均位于 Y=18 cm，按 **气、怒、忧、笑** 自上而下排列，Z=164/160/156/152 cm，行距 4 cm。口型及其参考图保持原位置，参考图仍为 Y=12 cm。

此次布局调整同时移动了八个手柄和对应轨道；从左向右的 8 cm 行程、颜色、名称和驱动保持。调整前已备份，三组中性 / 当前输入 / 八项混合的全部骨骼与曲线输出保持一致，保存重载后再次确认位置、方向和节点连接，恢复预览输入。详见 `layout_adjustment.json`。

后续生成按[拾取间距规则](../Workflow/Build.md#滑块与滑轨的拾取间距)将手柄 shape 沿局部 +Y 前移 1 cm；控制 offset 和轨道仍在 Y=18，手柄中心为 Y=19。旧置顶调试线关闭，轨道改为正常深度测试的不透明实体辅助形状，线宽 0.12 cm。历史示例资产保持不变。

2026-11-11 当前目标的口型参考图进一步收近到 Y=17（轨道后方 1 cm），替代上文历史 Y=12；眼神滑块的布局保持。

每项都是 POSITION 控制，局部 X 0–8，Y/Z 锁定为 0，Initial 为 0。从玩家视角左端向右拖增加权重：X=0 中性，X=4 一半，X=8 完整。左右可独立操作，也可与其他眼神、眼球目标、眼皮、骨骼面控、整体表情和口型组合。滑块层级显示为“右眼_气”等中文名称，手柄直径约 1 cm。

## Max 实际对应关系

| Max 控制 | 含义 | UE 控制 | 读取到的 Morph |
|---|---|---|---|
| `R_mouthUpCircleCtrl01` | 右眼_气 | `CTRL_EYE_EXPR_QI_R` | `1_qi_l_es` |
| `R_mouthUpCircleCtrl008` | 右眼_怒 | `CTRL_EYE_EXPR_NU_R` | `1_nu_l_es` |
| `R_mouthUpCircleCtrl03` | 右眼_忧 | `CTRL_EYE_EXPR_YOU_R` | `1_you_l_es` |
| `R_mouthUpCircleCtrl00` | 右眼_笑 | `CTRL_EYE_EXPR_HAPPY_R` | `1_happy_l_es` |
| `L_mouthUpCircleCtrl00` | 左眼_气 | `CTRL_EYE_EXPR_QI_L` | `1_qi_r_es` |
| `L_mouthUpCircleCtrl008` | 左眼_怒 | `CTRL_EYE_EXPR_NU_L` | `1_nu_r_es` |
| `L_mouthUpCircleCtrl02` | 左眼_忧 | `CTRL_EYE_EXPR_YOU_L` | `1_you_r_es` |
| `L_mouthUpCircleCtrl04` | 左眼_笑 | `CTRL_EYE_EXPR_HAPPY_L` | `1_happy_r_es` |

**左右命名沿用源 Max 控制的 R/L。** 源右侧控制确实连到带 `_l_es` 后缀的 Morph，左侧连到 `_r_es`；这是通过读取 Float Wire 父控制和逐项采样确认的关系，不按 Morph 后缀交换左右。左侧编号也不能按右侧直接替换 R 为 L。

源场景是 `D:/Download/Seven_Skin_New.max`，0 帧。八项使用直接 Position XYZ 的局部 Y Float Limit，范围 −1～0，平滑为 0；Wire 表达式为底层 Y × −100。采样只改变底层 Y，保留源 X/Z 的微小初始参考值，结束恢复全部底层 XYZ 并读回检查，不保存 Max 场景。UE 使用 `Morph = clamp(X,0,8) / 8`，中性相同，完整动作与源 Y=−1 对应。

## 实现与验证

八条 Morph 均已存在于当前预览网格，无需模型重新导出。每行新增读取、Clamp、增益、SetCurveValue、轨道绘制共五个 `EEXPR_` 节点，合计 40 个；旧节点及执行连接保留，尾部顺序追加八次曲线写入和八次轨道绘制。此组不写骨骼，也不复用四整体表情和十二口型的曲线。

- Max：40 组单控中间值 / 端点、12 组混合、一组全部完整，共 53 组；逐组检查 149 骨和全部 98 个有效 Morpher 通道。只有表中八条 Morph 改变，全骨骼变换保持。归一化拟合误差约 `3.6e-8`。
- UE：53 组源对照，曲线最大误差约 `3.56e-8`；添加前旧控制的 111 组姿势 / 表情 / 口型快照，以及每组叠加眼神的 111 组组合，验证全部骨骼与原 20 条曲线保持。
- 限位：各项测试 X=−10/0/4/8/20、无效 Y/Z、初始值、复位、重复求解及手柄起终点。骨骼最大位置差约 `3.62e-10 cm`，旋转数值差约 `4.83e-6°`，缩放保持。
- 保存重载后再次验证，并恢复用户原有预览输入，选中 `CTRL_EYE_EXPR_QI_R`。另外经正常预览动画帧检查新增八条曲线的 Morph 类型和一半权重；结构数值通过不等同于用户视觉验收。

首次重载后也出现了此前整体表情 / 口型新增曲线时的预览缓存现象：临时实例正常，预览曲线暂为零。保留输入、关闭并重新打开 Rig 编辑器后，正常动画帧下八条曲线均正确输出 0.5。临时采样结束仅恢复层级输入时，动画曲线也可能保留上次的 0.5；结束采样后再重开预览，恢复全部输入，并单独进行帧后归零检查。未修改项目优化开关；刷新前快照和最终检查分别留存，最终以 `preview_morph_check.json` 和 `preview_restored.json` 为准。

布局仍固定在 Rig 空间，与现有滑块一致。源输出允许八项混合，UE 也未增加互斥逻辑。

## 脚本和证据

证据见 [EyeExpressions](../../Characters/Seven/Evidence/EyeExpressions/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_eye_expression_sliders.ms` | 通过 Max MCP 采样，正常及异常路径恢复全部底层 XYZ |
| `Tools/FaceMigration/Scripts/build_eye_expression_sliders.py` | 双份备份、旧控快照、增量添加控制 / 曲线 / 节点 |
| `Tools/FaceMigration/Scripts/verify_eye_expression_sliders.py` | 源曲线、旧控及组合、骨骼保持、初始 / 复位 / 限位 |
| `Tools/FaceMigration/Scripts/reload_eye_expression_sliders.py` | 保存重载、复验、恢复用户输入并选中首项 |
| `Tools/FaceMigration/Scripts/probe_eye_expression_preview.py` | 正常动画帧下临时设置一半权重，读回八条 Morph 曲线并恢复 |
| `Tools/FaceMigration/Scripts/refresh_eye_expression_preview.py` | 保留输入并重开预览，刷新新增曲线缓存 |
| `Tools/FaceMigration/Scripts/verify_eye_expression_restoration.py` | 帧后检查原输入及新曲线中性恢复 |
| `Tools/FaceMigration/Scripts/finish_eye_expression_preview.py` | 采样结束后重开预览，清除残留曲线并恢复全部输入，再检查归零 |
| `Tools/FaceMigration/Scripts/update_eye_expression_layout.py` | 移至玩家视角角色左侧，同步手柄和轨道，检查输出不变并保存重载 |

数值复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_eye_expression_sliders.py`。
