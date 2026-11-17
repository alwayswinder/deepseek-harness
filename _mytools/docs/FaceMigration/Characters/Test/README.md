# Test 面部迁移测试

本角色使用 [test-taskflow-20261117](../../Jobs/test-taskflow-20261117.json) 独立执行新角色流程。示例为 `/Game/Developers/StoryEditorExamples/Expression/SevenECR/CR_Seven_Expression`，目标保留用户明确指定的 `/Game/Developers/StoryEditorExamples/Expression/test/CR_Test_Expression`，依赖放目标同级 `ToolsPanel/`。输入见 [face-controls.json](face-controls.json)；运行证据在目标项目 `Saved/FaceMigration/Jobs/test-taskflow-20261117/Current/`。

## 当前结果

| 检查 | 本任务结果 |
|---|---|
| 任务单与绑定 | 72 项；目标并非完全等价，采用已声明的 `head_frame_rebind` 路线，原始目标参考姿势保留在盘点报告 |
| 构建与迁移对照 | 72 动画控制 + 2 Visual Cue、188 骨、92 曲线、1927 节点 / 2645 连接；保存前和重载后各 1175 组，误差为零 |
| 显示与头部空间 | 显示对照无差异、形状均可解析；两阶段各 296 组独立实例检查通过；未配置身体动画，不含实际身体动画播放验收 |
| 保存重载 | CR 与 7 个面板依赖重载通过；输入恢复、目标干净；崩溃后磁盘摘要仍与最终保存状态一致，示例及其依赖摘要未变 |
| 当前 Max 抽检 | `Seven_Skin_New.max`，72 个源名称核对，上眼皮五点原始姿势对照未通过：Bone028 最大 2.39204257 cm / 1.07126404°；输入和 Morpher 已恢复。坐标系/参考姿势差异与动作误差尚未分离，不能改写为动作通过 |
| 旧部位回归 | 本角色没有同谱系基线，跳过；不借用 Seven 历史通过结果 |
| 正常帧 | PIE 视口创建时崩溃，探测初始化前退出；没有通过的正常帧证据 |
| 最终验收 | 整体未通过；正常帧、身体动画宿主、Sequencer、画面与拾取均未验收 |

## 发现的问题与恢复条件

大图构建时客户端短心跳断开，UE 继续完成构建。没有重发构建；报告落盘后执行验证。Bridge 客户端已禁用短心跳并保留显式执行超时，断线不意味着执行被取消。

口型参考图深度原按 Rig 全局 Y 计算，旋转面板导致断言和深度错误。共用函数改为轨道 Initial 空间；目标按增量入口备份、修复并重载，1 cm 间距及 1175 组回归通过，示例保持只读。

PIE 在 2026-11-17 16:43:21（UTC+8）触发 `FFXFrameInterpolation::GetRHIViewport()` 的 `SlateWindow.IsValid()` 断言，项目源码行 1336，调用链来自视口创建事件。崩溃目录为 `Saved/Crashes/UECC-Windows-9F36524A46F6DF50E943279299926494_0000`；日志与上下文副本在本任务 `Current/Temp/crash_20261117_164321/`，摘要及保存状态核对在 `Current/Evidence/preview_crash.json`。工具未保存用户关卡；重启后的关卡及临时 Actor 状态需核对。

任务已设置 `preview.blocked_reason`，两个预览入口在创建或修改宿主前拒绝执行。先解决视口与 FSR 插件兼容问题，再解除阻止并重测；关闭插帧 CVar 未被证实能避开无条件视口回调。正常帧脚本的恢复期望也已改为从独立示例实例按保存输入求解，避免读取已移除的 `morphs` 字段；此修复尚未在正常帧宿主实测。
