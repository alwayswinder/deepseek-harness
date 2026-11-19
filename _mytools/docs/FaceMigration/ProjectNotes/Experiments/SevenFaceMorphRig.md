# Seven 简易表情滑条

> 本页记录 2026-11-03 创建与布局测试。2026-11-06 只读核对：资产仍为 7 控制、0 骨、29 节点，编译状态 BS_UP_TO_DATE；本次没有重跑全部功能测试。
> 本资产不同于 28 个骨骼控制的 [CR_Seven_MorphSliders](../../Docs/Recipes/SevenBrowsAndEyes.md)。文档入口见 [README](../../Characters/Seven/README.md)。

资产：`/Game/_MyTest/Mouth/Rig/CR_Seven_FaceMorphs`

预览网格：`/Game/_MyTest/Mouth/Mesh/Seven`

参考 MetaHuman 的 `Face_ControlBoard_CtrlRig` 的 Float 控制方式，新建了七个
相互独立的控制项，名称和截图中的 Morph 一一对应：

| 显示名称 / Morph | 内部控制名称 |
|---|---|
| `1_happy` | `CTRL_1_happy` |
| `1_happy_l_es` | `CTRL_1_happy_l_es` |
| `1_happy_r_es` | `CTRL_1_happy_r_es` |
| `1_hellow` | `CTRL_1_hellow` |
| `1_hou` | `CTRL_1_hou` |
| `1_jian` | `CTRL_1_jian` |
| `1_jing` | `CTRL_1_jing` |

各项默认值为 0，范围为 0–1；0 为关闭，1 为完整权重。控制板放在参考姿势的头部旁，
七行滑轨从上到下与上表顺序一致。每个滑条的可拖动手柄使用不同颜色。
布局更新后，滑轨与角色正面同向（XZ 平面），位于脸旁、稍靠前的位置；
滑轨长 14 cm，行距 4 cm，球形手柄直径约 1.2 cm。

## 操作

1. 打开 `CR_Seven_FaceMorphs`。预览过小时，将鼠标放在预览窗口内按 F 聚焦，再缩放。
2. 在左侧 Rig Hierarchy 中选择对应名称。拖动预览中的滑条手柄，或修改 Details 中的
   Current Value。也可多选七个控制，集中编辑数值。
3. 在 Sequencer 的 Seven Skeletal Mesh 轨道添加 Control Rig，选择
   `CR_Seven_FaceMorphs`，即可为七个 Float 控制设置关键帧。

这是独立的 Morph 控制器，未替换 Seven 的默认身体控制器。它只输出七条 Morph 曲线，
没有身体骨骼输出，也不包含完整 MetaHuman 脸部求解、头部旋转控制或动画回解。
控制板位置固定在网格局部空间，未实现跟随动画头部的布局逻辑。

## 验证

已编译并保存，七个滑条分别以 0、0.5、1 驱动各自曲线，其余六条保持 0；
七条曲线同时使用不同权重的混合测试也通过。重新加载后，七个控制和曲线仍存在，
求解结果一致。已通过 MCP 打开编辑器，检查层级名称和编译状态。

创建脚本：`Tools/FaceMigration/Scripts/create_seven_face_rig.py`（拒绝覆盖同名资产）。
已有资产可在编辑器的 Cmd 控制台执行
`py "Tools/FaceMigration/Scripts/update_seven_face_layout.py"` 更新布局并保存。
以下历史报告保存在本机、被 Git 忽略的 Saved 目录，不能假定其他机器也有。详细数值报告：`Saved/Codex/SevenFace/creation_report.json`、`reload.json`。
布局更新结果：`Saved/Codex/SevenFace/layout_report.json`。
