# Seven 的 MetaHuman 身体控制器

> 本页功能数据来自 2026-11-03。2026-11-06 只读核对：资产存在、BS_UP_TO_DATE，内部为 439 个骨骼元素、160 个控制；本次未重新执行完整身体动画/回解验收。文档入口见 [README](../../Characters/Seven/README.md)。

已将 `D:/Unreal/Project/MetaHuman_58` 中的
`/Game/MetaHumans/Common/Common/MetaHuman_ControlRig` 复制并适配到：

`/Game/_MyTest/Mouth/Rig/CR_Seven_MetaHuman`

目标网格为 `/Game/_MyTest/Mouth/Mesh/Seven.Seven`，其 `Default Animating Rig`
在 2026-11-03 适配时指定为上述控制器，预览网格也设置为 Seven；默认绑定本次未重新核对，使用前在 Mesh 编辑器确认。

## 使用

在内容浏览器打开 `CR_Seven_MetaHuman`，即可在控制器编辑器中操纵 Seven。
在 Sequencer 中对 Seven 的 Skeletal Mesh 轨道添加 Control Rig 时，选择
`CR_Seven_MetaHuman`。身体动画可使用手脚 IK、四肢 FK 和躯干控制器；
从骨骼动画烘焙回控制器时，脊柱使用 FK 保留 Seven 的三节脊柱姿势。

## 适配内容

- 保留 Seven 原有骨架，包括面部和挂点骨骼。
- 将 MetaHuman 的五节脊柱映射到 Seven 的三节脊柱；控制器内部保留两个中间骨骼。
- 按 Seven 的骨骼轴向调整手脚 IK、FK 朝向、膝盖极向量及头部 IK 朝向。
- 控制器的项目资产依赖为 Seven；控制形状库来自引擎 ControlRig 插件。
- 原 MetaHuman 控制器及预览依赖另保留在本地 `/Game/MetaHumans/`，该目录按现有
  `.gitignore` 规则被忽略，适配后的控制器不依赖该目录。

## 验证与限制（2026-11-03）

已检查编辑器预览、默认绑定、FK/IK 初始姿势、双手双脚 IK 位移以及回解后再次正解。
已测手脚及躯干姿势的最大回解位置误差小于 `0.006 cm`（`0.06 mm`）。
头部 IK 受原控制器的拉伸约束限制，控制器位移不保证完全到达；单独的头部拉伸测试中，
回解后再次正解的位置误差约 `0.144 cm`（`1.44 mm`）。这些为指定姿势的测试结果，
尚未用完整动画片段验证所有运动范围。

本次迁移为身体控制器适配，不包含 MetaHuman 面部控制器迁移。
历史数值、依赖清单及编辑器截图保存在本机 `Saved/Codex/MetaHumanSeven/`（Git 忽略，未随本文归档）：
`functional_final.json`、`roundtrip_fkspine.json`、`final_audit.json`、
`final_save.json` 和 `final_editor.png`。中间测试文件记录的是调试过程。
