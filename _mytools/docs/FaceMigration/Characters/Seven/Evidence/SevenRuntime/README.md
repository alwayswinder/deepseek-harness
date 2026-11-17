# Seven 新式 Control Rig 构建与测试记录

目标：`/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`。
本目录属于本次独立构建，不覆盖原 Seven 各部位的历史采样和报告。

## 输入与实现

- 用户在 2026-11-09 指定新建的 `ControlRigRuntimeAsset`，要求创建全部表情控制器并记录测试问题。
- 连接到的项目为 `E:/Unreal/Projects/MyProject_5_8`，实际引擎为 **5.8.4 / CL 58902052**，与旧文档的 5.8.3 不同。
- 目标原有 Seven 预览网格、149 骨、0 控制、1 个求解入口节点。
- 同一 Seven 网格沿用已实现的完整面部结构：72 个动画控制、1 个参考图 Visual Cue、28 条 Morph 曲线；源为 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。
- 迁移内容包括完整层级、控制设置、形状库、图节点及连接，不是只创建空手柄。参数沿用同一角色已有采样，未重新采集 Max。
- 构建入口：`Tools/FaceMigration/Scripts/build_runtime_face_controls.py`。备份位置、源资产摘要和构建状态见 [build_report.json](build_report.json)。图导出保留在 `graph_export.txt`。

## 测试期间问题

| 问题 | 现象与定位 | 处理 |
|---|---|---|
| UE 连接器传参错误 | 旧 `ue_run.py` 向连接方法传节点列表，回退又传 IP；当前接口要求 `node_id` | 已修复为按项目筛选单个节点 ID，增加多节点拒绝、显式节点参数及连接释放；已实际接入正确项目 |
| 新旧资产 Python 接口不同 | 新资产不提供旧 Blueprint 的 `create_control_rig()`、`get_default_model()` 等直接入口 | 使用 `get_editor_asset()` 编辑图，使用 `hierarchy` 访问层级，使用编辑数据的 `create_rig_vm_host()` 创建测试实例 |
| 库的 Python 名称不同 | 探测 `unreal.ControlRigBlueprintEditorLibrary` 得到 AttributeError | 已通过反射确认实际 Python 类型为 `ControlRigBlueprintLibrary`；首次探测未修改资产 |
| 大图文本导入耗时 | 16 MB 导出、1926 节点、2639 条连接；UE 主线程长时间忙 | 采样调用栈为 `ImportNodesFromText → AddLink → CanLink → GetDiagnosticsAST → FRigVMParserAST`；原生调用栈保存在本机 `Saved/Codex/RuntimeFace/bulk_import_stack.txt`，需等待导入完成后检查结果 |
| 历史验证器固定旧资产与输出目录 | 直接运行会检查原 Rig 并覆盖历史报告，部分还依赖 BlueprintStatus | 为本次运行在内存中适配目标、报告输出及状态读取；原文件和源样本保留，使用真实实例求解验证新版资产 |
| 预览求值停滞 | 24 个滑块均已写入半程，但 Rig 和最终动画的 28 条曲线全零；Rig 时间停在 0.4 秒。单独实例求解正常；开启组件编辑器动画更新和请求一次事件仍无效 | 保留全部输入，关闭并重开目标资产编辑器，恢复输入后正常动画帧复测通过。未改图或增益；具体触发停滞的编辑器内部状态未独立证明，不将现象写成求解公式错误 |
| 重开后存在旧预览实例 | ObjectIterator 同时枚举 World_10 与 World_12，二者均属目标 VM、均有 73 控制，导致唯一性断言失败；当次断言在修改输入前触发 | 骨骼预览测试改用本轮已通过曲线验证的精确组件路径，并核对 VM 所属目标，避免选取停滞的旧实例；不按“最后一个实例”猜测 |
| 文档版本与当前目标滞后 | 旧流程写 5.8.3、角色入口仍指旧 Blueprint；本次运行实际是 5.8.4 新式资产 | 补充新式 API 和预览验证约定，角色表和当前入口指向用户指定资产；旧 Blueprint 作为迁移基准保留 |

## 验证策略与当前状态

2026-11-09 本次构建、数值、持久化和正常帧预览检查均已通过；最终画面仍待用户确认。

| 检查 | 本次实际结果 | 证据 |
|---|---|---|
| 结构与迁移对照 | 72 项名称齐全，149 骨、28 曲线、1926 节点、2639 连接；109 条执行连接单链可达、57 个唯一骨骼写入。1175 组初始 / 逐轴中间 / 正负端点 / 越界 / 32 组混合输入，与旧 Seven 参考的完整变换和曲线差异为零 | [保存前](before_reload/transfer_validation.json)、[重载后](after_reload/transfer_validation.json) |
| 历史源样本回归 | 下眼皮、唇、脸颊、鼻、嘴、眼球、总眼控、下巴、表情、口型、眼神、鼻侧共 12 个适配后的验证器全部通过；输出单独保存 | [保存前](before_reload/source_verifiers.json)、[重载后](after_reload/source_verifiers.json) |
| 保存重载 | 目标已保存；关闭编辑器、重新加载包后重复以上测试通过；源磁盘摘要保持不变 | [reload_report.json](reload_report.json) |
| 预览失败与恢复 | 失败记录保留；重开后 28 条 Morph 半程检查通过，最终曲线最大误差约 1.14×10⁻⁸，输入及恢复曲线误差为零 | [恢复前](preview_before_refresh.json)、[恢复后](preview_morph_check.json) |
| 全部控制正常帧预览 | 75 组：中性、72 控各一组、全功能组合、原输入恢复。每组对照 149 骨及 28 条最终曲线，确认实例时间推进。网格骨骼最大位置误差约 2.14×10⁻⁶ cm、旋转约 4.83×10⁻⁶°，曲线误差为零 | [preview_controls_validation.json](preview_controls_validation.json) |
| 实际手柄创建 | 目标预览世界中 73 个 ShapeActor 均绑定可见网格，含 1 个参考图，五项阶段报告通过，源磁盘摘要仍不变 | [delivery_check.json](delivery_check.json) |

预览结束已恢复进入测试前的全部 73 个输入（本轮均为零），目标资产编辑器保持打开。首次两次失败快照也保留为 `preview_first_attempt.json`、`preview_second_attempt.json`。

## 操作与复测

- 眉毛、眼周、眼皮、六唇、脸颊、鼻、嘴角 / 总嘴控、下巴、左右眼球 / 总眼控、鼻侧均在原 Seven 面部布局；选择后沿其开放轴平移，范围见 [名称总表](../../../../Docs/Reference/ControllerNames.md)。
- 玩家正面视角右侧是四整体表情及十二口型滑块，左侧是八个眼神滑块；水平向右增加，行程 0～8。参考图在口型滑块后方；鼻侧在总鼻控下方。
- 已存在内容时不要重跑构建脚本；数值复测用 `Tools/FaceMigration/Scripts/verify_runtime_face_controls.py`。正常帧预览先执行 `Tools/FaceMigration/Scripts/probe_runtime_face_morph_preview.py`，等待 JSON 的 `pending=false` 且 `passed=true`，再执行 `Tools/FaceMigration/Scripts/verify_runtime_face_preview.py`；两个异步测试不能并行。
- 预览不更新时用 `Tools/FaceMigration/Scripts/refresh_runtime_face_preview.py` 保留输入重开，再依次复测。该脚本及测试固定本次路径，换目标必须适配。新建预览世界后旧路径失效，不能直接复用上次的实例路径或历史通过状态。

历史上眼皮约 0.34 mm / 0.394° 的近似、右脸颊参考姿势偏差和固定 Root 空间限制仍然存在。新资产的迁移一致性通过不表示消除了这些源实现边界；头部动画、LOD 和最终视觉效果由对应测试与用户反馈单独判定。
