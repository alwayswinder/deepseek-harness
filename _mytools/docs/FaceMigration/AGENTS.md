# 面部迁移工具包入口

内部推理、计划和中间分析使用中文。此包可整体复制到其他项目的 `Tools/FaceMigration/`，不依赖原项目绝对路径。新角色从[任务单](TASK.md)开始：用户在那一份表里填示例 CR、目标 CR 和 Max 控制器名单，AI 据此生成 `Jobs/`、`Characters/<角色>/face-controls.json` 并执行流程。然后读[使用说明](README.md)，按[迁移流程](Docs/AGENTS.md)执行。最终画面由用户确认，不使用 computer-use。

## 维护规则

- **后续角色产出目录固定**：以 `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression` 为只读示例，输出为 `<父目录>/<角色名>ECR/CR_<角色名>_Expression`；主 CR 直接放角色包根目录，其他新生成或复制的角色专用依赖全部放同包 `ToolsPanel/`，依赖沿用示例功能名。完整规范与当前脚本路径适配缺口见 [角色产出目录与命名](Docs/Workflow/Build.md#角色产出目录与命名2026-11-17-起)。旧 job、证据与配方中的路径只作历史，不作为新任务默认值；仅整理文档时不修改脚本或 UE 资产。
- 正式入口是 `python Tools/FaceMigration/migrate.py`，命令从目标项目根运行。离线检查用 `check`；调用现有脚本用 `run <文件名> --job <任务名>`。不要重新创建项目根 `Docs` / `Scripts`。
- 接任务单的八个固定入口见 [工具选择](Docs/Workflow/Tools.md#主流程入口按顺序执行全部在包内)：`check_character_task_sheet.py` → `inventory_target.py` → `build_runtime_face_controls.py` → `verify_runtime_face_controls.py` → `crosscheck_max_control.py` → `finalize_runtime_face_controls.py` → `probe_runtime_face_morph_preview.py` → `assemble_delivery.py`。新角色照这串执行；需要新能力时扩展这些共用脚本，不再往任务 `Temp/` 写一次性入口。
- 同一功能修改共用脚本；换项目、Rig 路径用 `Jobs/*.json`。参数化路径不代表任意角色的求解已经通用化；新角色仍须重新采样、拟合、补齐名称映射和验证。
- 不为每次运行新增 `build_<项目>.py`、`probe_<项目>.py`、`replay_*.py` 或一套 README。临时诊断放目标项目的 `Saved/FaceMigration/Jobs/<任务>/Current/Temp/`；有复用价值的功能合入现有脚本。
- `Characters/Seven/Evidence/` 为整理前历史数据，包括已有未提交修改，受 `preservation.manifest.json` 保护。其中旧绝对路径属于历史记录，不作为现行执行入口。历史 `.py` / `replay_*.py` 只用于追溯，禁止原样执行。
- 新写入通过 `face_paths.output_path()`，新读取通过 `read_path()`。读取顺序为：本任务 `Current/Evidence/` → 目标项目 `Saved/FaceMigration/Characters/<角色>/` → 包内 `Characters/<角色>/Evidence/`。运行报告不得写回工具包。正式采纳新参数时才有意更新角色基准及摘要，不能自动覆盖历史证据。
- **包内只放可迁移的常量**：脚本、文档、`face-controls.json`、`parameters.json`、小报告和采样清单。原始采样（`max_samples.json`、`previous_controls.json`、`before_outputs.json`）、图文本导出和历史批次放目标项目 `Saved/FaceMigration/Characters/<角色>/`，历史批次放 `Saved/FaceMigration/Imported/`。复制工具包到新项目时**不要**复制这些大文件；新项目按 TASK.md 重新采样，或从原项目手工拷回同名目录。2026-11-10 已按此规则把 176.7 MB 移出包（包内由 181 MB 降到 4.5 MB），移动清单见 `preservation.manifest.json` 的 `moved_out`；脚本引用这些路径时，校验以 `moved_out` 认定有效。
- 新任务输出位于目标项目 `Saved/FaceMigration/Jobs/<job_id>/Current/`。任务 ID / 角色 / 资产映射不能用于另一套目标后继续读取旧结果；换目标用独立 ID。
- 当前报告使用固定文件名。成功的同步调用后，各备份组保留最近 3 份；显式 `archive` 保留最近 3 份归档。失败调用不自动清理。`.keep` 目录固定保留；未标记、名称不符的目录不清理。采样基准、`Imported` 和已有 `Saved/Codex` 不参与自动清理。
- 修改前备份目标资产，保留原控制接口和执行链；采样无论成功或失败都恢复输入并读回。检查源对照、原控回归、正常帧预览和保存重载，不能把历史报告、编译或名称存在当作本次通过。
- 默认按示例派生并结合 Max 适配：允许读取和复用用户指定的参考实现，保留其形状、配色、轨道、参考图、操作轴和行程。新角色重新绑定和核验数值；不默认全量重建或把所有点控裁到同一采样范围。示例与目标分开，已有目标按差异增量处理。
- 动画适配必须分别检查“动画头部 Transform 的求解空间”和“控制器/滑轨/参考图随头部平移旋转”，按 [主流程两项必查](Docs/Workflow/Build.md#动画头部空间与控制器跟随两项必查)执行并单列验收。继承示例须携带私有头部缓存变量与 FACE_SPACE Null 并重绑定目标头部；现有 RuntimeAsset 构建/通用验证尚未自动覆盖全部兼容点，不能凭示例旧报告或参考姿势对照宣称动画通过。
- 外观和操作独立验收。数值、正常帧输出通过不等于控制设计合格；用户已指出外观差异时记录“视觉验收未通过”。只整理文档的任务不修改 UE / Max 资产。
- 滑块手柄与滑轨必须分层：默认手柄沿面板朝向前移 1 cm，Seven 为 Initial/Current shape transform 局部 +Y=1；轨道必须使用遵守深度测试的不透明实体 Visual Cue（线宽 0.12 cm），关闭原置顶调试线，不能只靠前移解决拾取遮挡。共用 `Scripts/slider_handle_layout.py` 的 `apply_slider_layout()`，保留输入、offset、求解和图连接；继承示例时同样应用，显示对照单列此差异及新增 `VIS_SLIDER_RAILS`。生成依赖统一放角色包 `ToolsPanel/`，随整个角色包迁移；主流程生成、验证、备份、预览已共用 `rig_dependency_folder()`，旧部位配方仍需核对。详细规则见 `Docs/Workflow/Build.md`。
- 口型参考图默认仅在滑轨后方 1 cm（当前 Seven 图形 Y=17、轨道 Y=18、手柄中心 Y=19），不再继承旧版 6 cm 间距。共用布局通过 Initial/Current shape translation 调整图形，保留参考控制 offset、X/Z 和逐行对齐。
- `Scripts/ue-mcp.ps1` 仍是 DSH 规范脚本的副本；需要修改时先改 DSH 规范版本再同步。

## 检查

`python Tools/FaceMigration/migrate.py check` 校验链接、72 项映射、脚本语法及原始证据摘要，默认不写文件。

`python -B -m unittest discover -s Tools/FaceMigration/Tests` 验证项目隔离、只读基准、任务配置、迁移路径与保留规则。它们不替代 UE 功能或用户画面验收。
