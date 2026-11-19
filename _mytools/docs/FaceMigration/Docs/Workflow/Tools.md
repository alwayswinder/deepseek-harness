# 工具与脚本选择

本页供 AI 执行时查入口。命令从目标项目根运行。统一入口为 `python Tools/FaceMigration/migrate.py`，任务配置在包内 `Jobs/`，运行输出在目标项目 `Saved/FaceMigration/Jobs/<任务>/Current/`。`migration.config.json` 仍是流程导航，角色求解仍以 Seven 为参考；文件可迁移不等于任意角色一键生成。

默认先读取用户在开始任务的对话里指定的示例 CR，保留其控制接口、图、形状、轨道、配色和参考图，再结合 Max 核验动作。新角色按差异重新绑定和定参；从零采样重建属于显式选择的实验路线，不再是默认入口。文档整理任务不连接编辑器执行构建。

后续角色输出统一为 `<父目录>/<角色名>ECR/CR_<角色名>_Expression`，其余角色专用依赖放同包 `ToolsPanel/`，详见[目录与命名规范](Build.md#角色产出目录与命名2026-11-17-起)。以下命令表仍是现有入口；轨道生成/验证与预览 ABP 已统一调用 `rig_dependency_folder()`，空目标构建复制并重绑定面板，重载后校验依赖闭包。旧部位配方仍须单独核对路径；精确 `asset_overrides` 不会自动改写动态拼接目录。历史 job 保留用于追溯，不可原样用于新目录。

## 主流程入口（按顺序执行，全部在包内）

接任务单到交付不再需要临时脚本。每一步一个固定入口，命令从目标项目根运行：

| # | 步骤 | 命令 | 输出（本任务 `Current/Evidence/`） |
|---|---|---|---|
| 1 | 读表、核对/草拟角色表与采样脚本名单 | `migrate.py run check_character_task_sheet.py --job <任务>` | `task_sheet_check.json`（表缺失时写 `face-controls.draft.json`） |
| 2 | 备份目标、盘点示例契约、独立绑定探测、判路线 | `migrate.py run inventory_target.py --job <任务>` | `reference_inventory.json`、`binding_probe.json`、`adaptation_report.json`、`Backups/` |
| 3 | 空目标构建（仅当 `route=derive_...` 且目标为空） | `migrate.py run build_runtime_face_controls.py --job <任务>` | `SevenRuntime/build_report.json`、图文本导出 |
| 4 | 迁移对照 + 显示契约 + 部位验证器分段 | `migrate.py run verify_runtime_face_controls.py --job <任务>` | `SevenRuntime/before_reload/summary.json`、`layout_validation.json` |
| 5 | Max 抽检一个代表控制 | `migrate.py run crosscheck_max_control.py --job <任务>` | `max_crosscheck_<name>.json` + `_max.json`（Max 原始采样） |
| 6 | 保存、关闭、重载、复验、收尾状态 | `migrate.py run finalize_runtime_face_controls.py --job <任务>` | `reload_report.json`、`final_state.json` |
| 7 | 正常帧预览（必要时刷新一次） | `migrate.py run probe_runtime_face_morph_preview.py --job <任务>`；停滞再跑 `refresh_runtime_face_preview.py` | `SevenRuntime/preview_morph_check.json`（含 `stall_diagnosis`）；资产编辑器不 tick 时另用关卡 + AnimBlueprint + PIE 取证，写 `pie_preview_check.json` |
| 8 | 汇总分段结论 | `migrate.py run assemble_delivery.py --job <任务> --offline` | `validation.json`、`delivery_check.json` |

要点：

- 第 1 步的名单核对会解析 TASK.md 第 2 节的表格（容错对齐空格），并把 `.ms` 里的字符串字面量分成“控制器名 / 骨架骨骼名 / 未知辅助体”，因此 `names = #(...)`、`TARGETS = #(...)` 这类写法都能识别。
- 第 2 步的 `route` 有三值：`derive_from_reference_equivalence_check`（等价且目标为空）、`incremental_repair_existing_target`（目标已有内容）、`rebind_and_refit`（骨架/Morph 不一致）。第 3 步只在第一种情况执行；已有内容时构建器会拒绝，属预期。
- 第 5 步的抽检参数来自任务配置的 `crosscheck` 段（或 `Characters/<角色>/crosscheck.json`）：控制名、Max 对象、控制器槽位、轴、UI 缩放、骨表、主骨与容差。Max 采样由 MaxScript 直接返回，**不经过人工转录**；`safe_mode` 只拦文件写，返回载荷不受影响。
- 第 4 步把“旧控回归”当成分段而非全局门禁：`legacy_status=not_applicable` 时写原因（`case.bones` 为空、历史曲线名不在当前层级、缺 `previous_controls.json`），不跑该段，也不把它算作通过。
- 第 6 步的保存前门禁 = 迁移对照 + 显示契约 + 动画空间检查通过；旧控回归仅在同谱系时才要求通过。任务必须填写 `validation.head_bone`，并以 `validation.animation` 指定本角色身体动画。第 4、6 步分别生成 `SevenRuntime/<before_reload|after_reload>/animated_space_validation.json`，单列头部输入保留、身体输入保留、控制/形状跟随及重复求解；第 8 步缺少任一报告不得通过。
- 动画交付还必须按[主流程两项必查](Build.md#动画头部空间与控制器跟随两项必查)和[独立验收](Validation.md#41-动画头部空间与控制器跟随的独立验收)补齐“动画头部空间”和“控制器头部跟随”两项结论。第 2 步盘点依赖、第 3 步适配、第 4～7 步在动画姿势和保存重载后复验、第 8 步单列状态。现有八个入口尚未自动覆盖这两项全部检查；默认姿势的迁移对照或旧交付报告不能替代。
- `validation` 是本轮测试参数；`layout` 用于修改资产的空间安装入口，属于任务归属标记。任务初始化后更改后者会被隔离机制拒绝，不应删除或手改归属标记绕过检查。
- `verify_runtime_face_preview.py` 在配置头部锚点的 PIE 任务中增加六组非零头部变换（两方向 × 中性/单控/组合），检查最终网格、全部控制与形状；加上 72 单控、组合和恢复共 81 组。注入方式为实际 Rig 层级，宿主仍是参考姿势 AnimBP；这不能声称已经在播放身体动画的 AnimBP 或 Sequencer 中验收。

## 工具连接

### 已有 Blueprint 面部图的动画头部跟随

`wrap_face_head_space.py` 通过任务的 `layout.target`、`layout.head_bone`、`layout.readonly_asset` 定位目标、头部锚点和只读保护资产。在正向入口缓存当前头部，临时将其 Current 归到 Initial 参考空间；原链末尾恢复缓存头部。两次设置均传播子级，内部原始求解不改。脚本先备份磁盘和当前内存资产，再做原姿态及头部运动的控制回归，失败会回滚自身节点与变量。已有包装时拒绝重装。

此入口目前仅支持 Blueprint Rig，且要求原求解只写头部锚点下的面部骨骼；不要用于已有相同头部空间转换的图。它保留原 Rig 对面部的覆盖语义，不等于保留动画面部姿态的增量层。Seven 本轮用户明确授权修改示例，配置见 `Jobs/seven-reference-head-space-20261112.json`；一般迁移仍默认只读示例。

UE 5.8 的 `add_member_variable` 对结构体要求完整类型路径（如 `/Script/CoreUObject.Transform`），传 `FTransform` 会触发引擎断言。`add_variable_node` 则使用 `FTransform` 并显式传入 Transform 的 ScriptStruct。复制旧式 Blueprint 后应先保存重载再接线，避免重复对象的旧 RigVM 链接缓存失效。

| 任务 | 入口 | 使用要求 |
|---|---|---|
| Max 对象、控制器及场景检查 | 3ds Max MCP 专用工具 | 先发现工具 schema，核对场景完整路径及采样帧；同名歧义必须处理 |
| Max 自定义采样 | Max MCP 执行 MaxScript，或 `Tools/FaceMigration/Scripts/max_run.ps1` | `-ScriptFile <脚本>`；多实例用 `-MaxPid`。采样脚本需保存底层值、异常恢复并读回 |
| UE 资产查询 | 内置 MCP `http://127.0.0.1:8000/mcp`，客户端 `Tools/FaceMigration/Scripts/ue-mcp.ps1` | `-Toolsets` 发现、`-Describe <完整工具集名>` 读 schema，再调用；没有 load_toolset 步骤 |
| UE RigVM / 层级操作 | `python Tools/FaceMigration/migrate.py run <脚本.py> --job <任务>` | PythonScriptPlugin 远程节点可用；先核对项目、网格和配置资产路径 |
| 离线参数拟合 | 普通 Python；部分脚本需 NumPy / SciPy | 先检查输入路径和数据版本；拟合本身不会同步 UE 图 |
| 文档完整性 | `python Tools/FaceMigration/migrate.py check` | 不连接编辑器、不改资产，校验导航、72 项映射、配方覆盖及数据保留；默认不生成报告文件 |

UE 远程节点不可用时，继续做离线资料检查并明确未进行实时检查；不为文档任务重启用户编辑器。发现多个 UE 节点时先明确执行目标，不能仅凭存在 UnrealEditor 进程判断接入正确项目。引擎路径从安装信息、项目关联、`UE_ENGINE_ROOT` 或 `--engine-root` 发现，不再绑定原机器绝对路径。

### 参考契约盘点（UE 5.8 形状 API）

读控制外观用下面这组接口（2026-11-10 在 5.8.4 / CL 58902052 实测）：

| 需要的内容 | 正确入口 | 常见误写 |
|---|---|---|
| 形状名 | `hierarchy.get_control_settings(key).shape_name` | `gizmo_name`（已废弃，仍可读但会告警） |
| 颜色 | `settings.shape_color`（RGBA） | `gizmo_color`（已废弃） |
| 形状尺度 | `hierarchy.get_global_control_shape_transform(key, True).scale3d` | `settings.shape_transform`（示例多为单位变换，尺度实际在全局形状变换里） |
| 局部形状偏移 | `hierarchy.get_global_control_offset_transform(key, True)` | — |
| 形状库 | `asset.get_editor_property('shape_libraries')` 的 `get_path_name()` | 没有 `get_shape_names()`；`ControlRigShapeDefinition` 也没有 `name` |
| 限位显示 | `settings.draw_limits`、`settings.shape_visible` | 不要与控制自身 `scale` 混用 |

`RigHierarchyController` 没有 `get_control_shape_transform`；形状读取在 `RigHierarchy` 上。探测失败时先怀疑接口名，不要先判“示例没有形状设置”。示例当前两个形状库：`/ControlRig/Controls/DefaultGizmoLibraryNormalized` 与项目内 `SL_PhonemeReference`。

2026-11-10 第二轮补充（实测）：`ControlRigShapeLibrary.shapes` 是 struct 数组，元素只能读 `shape_name`；`get_class()`、`mesh`、`material`、`type` 全部报 `Failed to find property`。项目库里的形状名带库前缀（`SL_PhonemeReference.PhonemeReference`），而 `DefaultGizmoLibraryNormalized` 有 54 项、`SL_PhonemeReference` 1 项。判断“形状能否解析”时要按 `库名.形状名` 拆分，否则会把正常资产判成形状缺失。取骨骼/控制的全局变换直接传 element 本身（`hierarchy.get_global_transform(bone, True)`）；`RigElementKey` 没有 `get_key()`。

## 按依赖查 Seven 脚本

下表是功能索引，**不是可整段重放的安装脚本**。旧构建器多为首次增量添加，目标已经存在时会拒绝；早期眉眼构建会重建节点并影响后续接线。新角色先生成独立参数和任务配置，适配共用脚本；已有完整 Rig 只改本次范围。

| 功能 | Max 探测 / 拟合 | UE 构建 | 验证 / 保存重载 |
|---|---|---|---|
| 眉毛整体、点、弯曲 | `probe_animcraft_world.ms`、`probe_animcraft_rb*.ms`、`probe_animcraft_lb.ms`；见配方源数据 | `build_brow_two.py` → `build_brow_points.py` → `build_brow_bend.py` / `build_brow_bend_left.py` | 先修配方所列 API 和实例断言边界；`fix_brow_exec.py` 仅在已定位断链后使用 |
| 眼周点、上眼皮 | `probe_eye_r.ms` / `probe_eye_l.ms`、`probe_syp*.ms` | `build_eye_points.py`、`build_eye_lid_arc.py` | 早期基线采集：`Tools/FaceMigration/Characters/Seven/Evidence/recheck_control_rig.py`，不代表完整 Rig 验收 |
| 下眼皮 | `probe_xyp_samples.ms`；已存分解参数 | `build_lower_lids.py` | `verify_lower_lids.py` / `reload_lower_lid_target.py` |
| 六嘴唇 | `probe_lip_samples.ms` / `fit_lip_controls.py` | `build_lip_controls.py` | `verify_lip_controls.py` / `reload_lip_target.py` |
| 脸颊 | `probe_cheek_samples.ms` / `fit_cheek_controls.py` | `build_cheek_controls.py` | `verify_cheek_controls.py` / `reload_cheek_target.py` |
| 鼻子整体 | `probe_nose_samples.ms` / `fit_nose_controls.py` | `build_nose_controls.py` | `verify_nose_controls.py` / `reload_nose_target.py` |
| 三嘴控 | `probe_mouth_samples.ms` / `fit_mouth_controls.py` | `build_mouth_controls.py` | `verify_mouth_controls.py` / `reload_mouth_target.py` |
| 单眼目标 | `probe_eyeball_samples.ms` / `fit_eyeball_controls.py` | `build_eyeball_controls.py` | `verify_eyeball_controls.py` / `reload_eyeball_target.py` |
| 双眼总控 | `probe_gaze_master_samples.ms` / `fit_gaze_master.py` | `build_gaze_master.py` | `verify_gaze_master.py` / `reload_gaze_master.py` |
| 下巴 | `probe_chin_samples.ms` / `fit_chin_control.py` | `build_chin_control.py` | `verify_chin_control.py` / `reload_chin_control.py` |
| 整体表情 | `probe_expression_sliders.ms`；已存增益 | `build_expression_sliders.py` | `verify_expression_sliders.py` / `reload_expression_sliders.py` |
| 十二口型 | `probe_phoneme_sliders.ms`；已存参数 | `build_phoneme_sliders.py` | `verify_phoneme_sliders.py` / `reload_phoneme_sliders.py` |
| 口型参考图（示例已有则继承） | 角色贴图、行序、Alpha 边界 | `build_phoneme_reference.py` | `finalize_phoneme_reference.py` / `verify_phoneme_reference_preview.py` |
| 八眼神 | `probe_eye_expression_sliders.ms`；已存参数 | `build_eye_expression_sliders.py` | `verify_eye_expression_sliders.py` / `reload_eye_expression_sliders.py` |
| 鼻侧 | `probe_nose_side_samples.ms` / `fit_nose_side_controls.py` | `build_nose_side_controls.py` | `verify_nose_side_controls.py` / `reload_nose_side_controls.py` |

表中无目录前缀的文件均位于 `Tools/FaceMigration/Scripts/`。具体备份、输入恢复、拟合条件和误差见对应 [配方](../AGENTS.md#文件维护)及 [Seven 角色记录](../../Characters/Seven/README.md)。旧的 `probe_*`、`set_*`、`inspect_*`、`clear_rig.py` 不因出现在 Scripts 中就成为主流程步骤。

## 修复与布局必须按当前状态选择

下表是示例中的历史调整，不表示当前输出候选已经具备这些设置。先读取示例与目标差异；尤其不能对已缩短的下巴再次缩放，也不能把调试限位线当作正式滑轨。

| 已完成需求 | 对应脚本 | 重跑边界 |
|---|---|---|
| 脸颊蓝轴翻转并保留世界拖动效果 | `fix_cheek_handle_axes.py` | 已修复；拒绝重复应用，原轴向和输入补偿必须一起处理 |
| 总眼控改父级后初始目标回到眼前 | `fix_gaze_master_initials.py` | 建图已同步修正；先读 Initial，避免手工清零掩盖错误默认值 |
| 下巴 UI 行程缩为 1/3 | `resize_chin_travel.py` | 已缩放；拒绝重复缩放，动画旧值 / 增益需对应处理 |
| 表情在画面右侧、向右增加 | `update_expression_slider_layout.py` | 当前已应用；按角色和当前布局核对 |
| 眼神在画面左侧靠近角色 | `update_eye_expression_layout.py` | 当前已应用；同步轨道和手柄 |
| 参考图贴近滑轨后方 | `update_phoneme_reference_depth.py` | 共用布局入口，默认轨道后方 1 cm；Seven 图形 Y=17、轨道 Y=18、手柄中心 Y=19，不再沿用旧版 6 cm |
| 手柄在轨道前方，便于拾取 | `update_slider_handle_depth.py` / `slider_handle_layout.py` | shape 局部 +Y=1 cm；旧置顶调试线关闭，改为线宽 0.12 cm 的不透明、遵守深度测试的实体 Visual Cue；生成和验证共用此规则，见 [布局规则](Build.md#滑块与滑轨的拾取间距) |
| Morph 层级曲线有值、预览暂未收到 | `refresh_expression_preview.py` / `refresh_phoneme_preview.py` / `refresh_eye_expression_preview.py` | 保留输入重开预览，正常动画帧后检查；眼神结束采样另用 `finish_eye_expression_preview.py` 检查恢复 |

### 控制器显示跟随动画头部

`update_face_control_space.py` 使用 `layout.target`、`layout.head_bone`、`layout.readonly_asset` 和可选的 `layout.animation`，给已能正确处理头部动画的 Blueprint 面部 Rig 增加 `head → FACE_SPACE` Null。共用层级操作在 `face_design_space.attach_face_control_space()`；只转换顶层控制的参考 offset，保留子控制层级、Initial/Current 输入、控制设置和形状，不改图。已有 FACE_SPACE 时拒绝重装；已有其他 Null 或多父级时停止，先明确空间映射。保存前、重载后对照原骨骼/曲线输出与控制器/形状头部跟随，异常回退自身层级修改。示例任务为 `seven-reference-control-space-20261112`。

该入口不提供面部皮肤贴附或动画回解。动画采样写入骨骼时应像 AnimNode 一样传播非骨骼子级；不要用 `bAffectChildren=False` 保世界来模拟动画输入。重设父级会清理显示名标点，须恢复完整控制设置。继承更新后的示例时还须携带 FACE_SPACE 及其头部绑定；仅逐个复制控制设置的旧增量适配器需要先适配新父级，不能把 Null 当成普通骨骼。

## 示例派生与新式资产迁移入口

### 对已有采样求解增量恢复示例设计

`adapt_sampled_face_design.py` 保留现有求解及全部原执行连接，复制示例控制设置、形状库、口型图 Visual Cue 和 24 条滑轨，在原输入 Clamp 前接入显式矩阵转换。它要求当前任务的 `design_plan.json`、`solver_before.json`、`source_validation.json`，不能直接用于另一角色或未盘点的图。

`design_plan.json` 包含独立 `source` / `target`、`head_bone`、原模型 `source_axes`，以及逐控制的 `name`、`role_id`、`matrix`（源原始输入对 UI 的 3×3 矩阵）、`inverse`、`source_bounds`、UI 限位和测试姿势。矩阵须从源活动层、空间与示例接口核定；仅支持复用已经验证的采样求解，当前不自动推导任意角色。`solver_before.json` 是执行前盘点，不是另一目标的历史通过报告；须核对其节点、控制、源轴和目标路径。新角色应适配脚本中的结构断言。

执行前读取两套图并制作上述计划，在 Max 采集本轮覆盖新 UI 行程的独立样本，保存原值，采后恢复底层输入并读回。输入恢复、原始参考差异和固定参考配准另存报告。`seven-reference-adapt` 是 2026-11-10 第一轮的增量恢复任务，其目标已不在磁盘；第一轮流程验证任务 `seven-newchar-20261110` 的目标 `...Asset1` 也已删除。当前流程验证任务为 `seven-taskflow-20261110`，在空壳 `TMp/NewControlRigRuntimeAsset` 上从示例构建，不使用旧 `seven-runtime` 的合并资产映射。`adapt_sampled_face_design.py` 只适用于“保留既有采样求解、再补示例设计”，对空目标不适用。

```powershell
python Tools/FaceMigration/migrate.py run adapt_sampled_face_design.py --job seven-reference-adapt
python Tools/FaceMigration/migrate.py run verify_sampled_face_design.py --job seven-reference-adapt
```

适配器拒绝重复添加 `DESIGN_` 节点。发生失败时先看备份、当前内存与报告，不能直接重跑已部分完成的转换。现有大图逐项添加节点可能长时间占用 UE 主线程；等待同一次调用结束，期间不再连接第二个 UE 修改或验证任务。按批次关闭自动重编译，完成后只编译一次；必要时用图文本批量导入替代大量交互式连线。

`verify_sampled_face_design.py` 分开写 `layout_validation.json` 及重载前/后数值报告，检查示例的 73 项显示接口、当前 Max 姿势、全部 149 骨、Morph、回零、重复求解及头部跟随。`Temp/verify_phase.txt` 为 `before_reload` 或 `after_reload`；正常帧网格输出仍需另验。当前报告只写本任务，不更新冻结证据。

`finalize_sampled_face_design.py` 要求本轮保存前与布局检查通过，保存、关闭目标编辑器并重载包，再运行保存后验证并重新打开目标。`verify_face_design_preview.py` 在真实目标预览实例按正常动画帧检查 72 控制代表姿势、组合与中性，共 76 组；同时核对实际网格骨骼、最终 Morph 类型/数值、时间推进及输入恢复。返回 scheduled 不是通过，须等 `preview_validation.json` 的 `pending=false` / `passed=true`。测试期间不并发修改同一预览输入，成功或失败都恢复临时编辑器偏好。

源通道盘点、网格 Morph 总数、动画输出曲线数分别记录。当前 Seven 网格有 87 个 Morph，但示例面部接口驱动 28 条；本轮对未绑定源通道另检查是否随输入变化，源 `L` / `R` 常量不计作新增动画控制。不能仅因名称在层级中出现就宣称已迁入动作，也不能把不属于当前接口的静态源权重当作动态曲线回归失败。

### 完整图迁移（仅空目标）

下表记录 Seven 既有完整图迁移实现，历史实测环境为 UE 5.8.4 / CL 58902052。源为用户指定的旧 Blueprint，脚本默认目标为 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`，使用独立任务配置适配实际输出路径。优先用 `python Tools/FaceMigration/migrate.py run <脚本.py> --job <新任务>`。这组脚本可作为复用实现入口，但已有内容的目标不能直接执行空目标构建器；应先比较并选择增量修复，或在用户指定的独立空目标上迁移。2026-11-10 已在空壳 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset1` 上重跑成功：149 骨、72 动画控制 + 1 Visual Cue、28 曲线、1926 节点、2639 连接，`asset_overrides` 把默认目标键映射到 `...Asset1` 即可，脚本无需改动。构建期间 UE 主线程约 6 分钟无响应（`Responding=False`），属大图文本导入的已知行为，不要重复提交构建或并发连接第二个 UE 任务。

`build_runtime_face_controls.py` 包含层级（含 Null）复制、`shape_libraries` 等属性复制、成员变量迁移及节点导入。成员存储必须先于图导入创建，结构体使用 `cpp_type_object` 的完整路径，保留类型、默认值和 public/private；暴露给 Spawn/Cinematics 的变量暂不支持，遇到会停止。仍须检查绘制、轨道、参考图和材质依赖，函数库、不同骨架和资产版本需另行适配。

绑定等价判定必须使用引擎原始精度；不能先把变换舍入六位再与 `1e-6` 门限比较。本轮实测原始四元数差约 `5.96e-8`，舍入后会成为 `1.00000000003e-6`，错误进入重新绑定路线。

**路径配置注意：** 源和目标必须保持不同，整图构建器会断言拒绝两者相同。`Jobs/seven-runtime.json` 是旧部位脚本的合并路径适配配置，其中将示例路径映射到目标，不能直接用于这组整图构建与对照。另建任务，仅对实际输出路径及所需依赖作映射，保持示例只读。`--dry-run` 只检查配置和命令，不会验证 UE 目标是否为空。

| 脚本 | 范围与重跑边界 |
|---|---|
| `Tools/FaceMigration/Scripts/build_runtime_face_controls.py` | 完整层级与图迁移；仅接受空目标，备份后构建，已有内容拒绝覆盖 |
| `Tools/FaceMigration/Scripts/verify_runtime_face_controls.py` | 1175 组迁移对照及 12 个适配后的源样本验证器；报告隔离在 SevenRuntime，不覆盖历史参数或报告 |
| `Tools/FaceMigration/Scripts/finalize_runtime_face_controls.py` | 保存、关闭、包重载并复验；需先有保存前通过报告 |
| `Tools/FaceMigration/Scripts/refresh_runtime_face_preview.py` | 保存实例输入、重开目标编辑器并恢复；只在预览停滞时使用 |
| `Tools/FaceMigration/Scripts/probe_runtime_face_morph_preview.py` | 异步正常帧半程检查 28 条曲线及输入恢复；读取 JSON 的 pending / passed 后再判断结果 |
| `Tools/FaceMigration/Scripts/verify_runtime_face_preview.py` | 依赖本轮曲线检查通过的精确组件路径；75 组正常帧检查覆盖全部 72 控制、149 骨、28 曲线、组合及恢复 |

两项预览检查依次运行，不能同时修改预览输入；异步返回只说明已安排测试。表中的固定计数和旧报告属于历史验证范围，执行前检查是否适用于当前资产；当前报告必须写入新任务，不沿用[历史运行时资产报告](../../Characters/Seven/Evidence/SevenRuntime/README.md)的通过状态。外观和操作还需按[验证规范](Validation.md#11-示例max-和目标分开对照)另验。

`verify_runtime_face_controls.py` 同时跑两件事：1175 组示例→目标迁移对照（任何谱系都适用），以及把 12 个部位验证器重定向到目标。后者内部有“源动作段”和“旧控回归段”两类断言，前者读 `max_samples.json`，后者读 `previous_controls.json`。2026-11-10 实测：源动作段全部通过，旧控回归段有 10 个验证器失败，原因是该文件属于已废弃的采样求解资产（130 个 case 的 `bones` 为空，脚本回落到“149 骨全保持中性”的期望）。空目标新建或从示例派生时，旧控回归没有对象；`finalize_runtime_face_controls.py` 的前置断言因此会直接拒绝。此时应分段记录结论并手工完成保存重载，不要为了通过门禁去伪造同谱系基线，也不要把这类失败写成资产缺陷。

## 离线输入与交接

### 历史实验：不复用既有 Rig 的采样重建

只有用户明确要求“不参考已有实现”时才采用这条路线，该限制不能延续为其他任务的默认要求。2026-11-10 的独立重建虽通过数值检查，用户已指出控制外观与示例差异明显；其统一形状、行程和大量拟合节点不作为新流程模板。当前主路线允许参考实现，应优先使用上述派生/迁移或增量修复。

`build_sampled_face_controls.py` 使用本任务 `Current/Evidence/SourceModel/model.json`，只接受没有动画控制且仅有求解入口的 RuntimeAsset。模型应包含本次探测得到的有效约束父级、辅助变换链、独立拟合参数和输入映射；构建器不加载参考 Rig，不读取角色历史数值。它是采样模型的构建入口，不是新角色的一键采样器。

`verify_sampled_face_controls.py` 对照同任务 `SourceModel/source_validation.json` 的独立 Max 样本，检查 UE 实际实例的完整骨骼变换、曲线、回零、重复求解和头部移动旋转跟随。保存重载前后分别执行，结果写 `before_reload_validation.json` / `after_reload_validation.json`；正常帧预览仍需另验，不能用临时 host 的通过代替。

源中没有限位的轴，必须在本次报告中明确采样范围和 UE 行程。不能把有限采样范围的通过写成无限行程都已验证。

### 当前拟合输入

角色 `Evidence/<部位>/parameters.json`、`max_samples.json` 和 `previous_controls.json` 被构建 / 验证代码直接读取，必须保留。当前任务中生成的同名文件优先读取。部分 `fit_*.py` 仍需原始采样或管道输出文本，统一从目标项目 `Saved/FaceMigration/Jobs/<任务>/Current/Temp/` 读取；不能因交接目录中已有采样，就声称这些历史命令在干净环境直接可跑。

- Seven 的 149 骨采样名单可由 `python Tools/FaceMigration/Scripts/fit_cheek_controls.py --prepare` 从已留存嘴唇基准生成当前任务 Temp 下的 cheek_bone_names.txt；此旧命令使用默认 seven-local 任务，新角色通过对应任务配置生成自己的名单，不能沿用 Seven。
- 嘴角、眼球、总眼控、下巴拟合使用当前任务 Temp 下对应的 *_samples_raw.json。离线复现时，可核对格式后将该角色留存 max_samples.json 复制到拟合器指定位置，或适配读取路径；不要为了补中间文件覆盖源证据。
- 嘴唇、脸颊、鼻子拟合读 MCP 管道输出文本，需保留外层协议或适配为读取留存样本；不能把 JSON 直接改后缀当管道返回。
- 下眼皮和上眼皮没有统一的新角色拟合 CLI；按配方和诊断方法重建角色参数，随后完整采样验证。

完整迁移以 [主流程](Build.md) 的角色参数、源对照及重载结果为准。局部历史验证脚本可能固定控制数或假设后续部位尚不存在；验证当前完整 Rig 时先检查断言和比较范围，不能用早期快照要求覆盖当前合法功能。

早期 fix_brow_axis.py 的说明字符串含未转义 Windows 路径，本次改为原始字符串以恢复语法解析，未重新验收其修复逻辑。它不在上述有效构建入口中，不能把 Scripts 目录中的旧修复脚本都作为主流程。
