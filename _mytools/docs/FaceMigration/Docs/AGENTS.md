# AI 入口：3ds Max 面部控制迁移到 Unreal Control Rig

本目录只维护这条迁移流程：以用户指定的 UE Rig 为示例，结合 Max 源场景完成目标适配。允许读取和复用示例的层级、图、控制设置及显示资源；不要求从零重建。AI 完成差异核对、适配、验证和记录，最终画面由用户检查。不使用 computer-use。

## 从这里开始

1. 读取[任务单](../TASK.md)：用户在其中写明示例 CR、目标 CR、网格、Max 场景和 72 个控制器名；按它的第 5 节协议生成任务配置。没有填写任务单时，再读[迁移配置](migration.config.json)确认当前角色和目标。
2. 执行唯一主流程 [Workflow/Build.md](Workflow/Build.md)。名称表填写用 [Markdown 模板](Templates/CharacterFaceControllers.md)或 [JSON 模板](Templates/CharacterFaceControllers.json)，二选一即可。
3. 按需阅读 [探测与实现方法](Workflow/MigrationGuide.md)、[工具和脚本索引](Workflow/Tools.md)、[验证规范](Workflow/Validation.md)。
4. 只读取本次涉及的部位配方与证据。Seven 的当前资产、计数和已知边界统一见 [角色记录](../Characters/Seven/README.md)，完整名称见 [名称总表](Reference/ControllerNames.md)。

## 执行约定

- 后续输出遵守[角色产出目录与命名](Workflow/Build.md#角色产出目录与命名2026-11-17-起)：`<父目录>/<角色名>ECR/CR_<角色名>_Expression`，其余角色专用依赖全部在同包 `ToolsPanel/`。当前只读示例是 `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression`。下列带日期的记录、旧 job 和角色表保留当时路径；新任务按 TASK.md 重新生成独立配置，并先适配共用脚本遗留路径。
- 最新新角色流程验证为 `seven01-taskflow-20261117`，目标是 `/Game/_MyTest/Mouth/Seven01ECR/CR_Seven01_Expression`。空壳独立探测为绑定等价，1175 组迁移对照、显示契约、每阶段 592 组动画空间检查、Max 代表控制抽检和 PIE 81 组正常帧通过；CR 与 ToolsPanel 全部 8 个依赖已保存重载，目标干净、输入恢复。最终画面/拾取、身体动画播放宿主和 Sequencer 待验收，详见[Seven01 记录](../Characters/Seven01/README.md)及本任务 `Current/Evidence/flow_findings.md`。`seven-taskflow-20261112` 和下方 2026-11-10 的“当前任务”保留为历史批次。

- **分别确认示例、Max 源和输出目标。** 当前示例是 `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression`，类型 `ControlRigBlueprint`；Max 核对真实动作，示例提供成熟控制设计。2026-11-10 第二轮按 TASK.md 协议在空壳 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`（`ControlRigRuntimeAsset`，149 骨、87 曲线、0 控制、1 节点）上完成构建；第一轮目标 `.../TMp/NewControlRigRuntimeAsset1` 已不在磁盘，只能作为历史记录引用。流程要求把示例、当前 Max 角色和新目标当作三个不同角色处理，见[新角色与示例骨架相同的情况](Workflow/Build.md#新角色与示例骨架相同的情况)。该批次技术检查分段记录：结构、示例→目标、显示契约、Max 抽检、保存重载通过；正常帧预览未通过；用户画面待确认。历史任务为 `seven-taskflow-20261110`，问题清单在该任务的 `Current/Evidence/flow_findings.md`。历史运行资料见 [运行时资产记录](../Characters/Seven/Evidence/SevenRuntime/README.md)，当前状态见[角色记录](../Characters/Seven/README.md)。
- **继承控制设计后再适配。** 同角色优先复制、完整类型迁移或增量修复，保留形状、颜色、面板轨道、参考图、操作轴和行程；新角色保留设计并重新绑定、定参。默认不做全量拟合和统一默认形状重建。示例资产保持不变，目标已有内容时不为运行空目标构建器而先清空。
- 名称表是功能入口映射。新角色必须重新探测骨骼、Morph、活动控制层、限位、空间、枢轴和增益；不复制 Seven 的绝对坐标或数值。现有脚本大多固定 Seven，适配目标与依赖后再执行，当前没有读取表格即通用一键生成的程序。
- 修改前备份磁盘包和内存状态；采样保存并恢复帧、底层控制值和预览输入，异常时同样恢复并读回。保留已有控制接口、执行链和骨骼 / 曲线输出。
- 辅助虚拟体的变换与表达式属于求解逻辑；无需作为可见模型导出，但不能遗漏其效果。共享目标先按源顺序合成，避免覆盖已有控制。
- 动画适配按[两项必查](Workflow/Build.md#动画头部空间与控制器跟随两项必查)分别处理面部求解的动画头部空间和控制器/滑轨/参考图的头部跟随，按[独立验收](Workflow/Validation.md#41-动画头部空间与控制器跟随的独立验收)记录。继承私有变量与 Null 空间，明确当前脚本覆盖边界；参考姿势一致不代表动画或 Sequencer 通过。
- 分别进行示例到目标的接口/外观/操作对照、Max 到目标的动作对照及实际预览。数值、预览曲线、保存重载、用户画面反馈分开记录；用户明确指出外观差异时标记视觉未通过，不能只留“待确认”。已知近似和历史证据不得改写。文档整理任务不运行资产构建或覆盖。

## 文件维护

| 目录 | 唯一用途 |
|---|---|
| `Workflow/` | 接表到交付的执行步骤、探测方法、工具和验证规范 |
| `Reference/` | 功能与 Max / UE 精确名称对应，不存另一份驱动参数 |
| `Templates/` | 新角色可填写输入，不预填新角色绑定名 |
| `../Characters/` | 已填角色表、角色当前状态与限制 |
| `Recipes/` | 部位的实际实现、参数解释、脚本及验证范围 |
| `Troubleshooting/` | 仍有复用价值的故障原因与判定依据 |
| `../Characters/<角色>/Evidence/` | 只读源采样、拟合参数、历史回归基准及报告；其中 JSON 会被脚本直接读取 |
| `<目标项目>/Saved/FaceMigration/Characters/<角色>/` | 外置的大采样、回归快照和图导出；`read_path` 优先读这里，包内只留参数与小报告 |

本 Docs 顶层只保留本 AI 入口和 `migration.config.json`。文档链接相对当前文档；JSON 的文档 / 证据路径相对工具包根目录。新增角色数据放 `../Characters/<角色>/`，不覆盖 Seven。运行配置放 `../Jobs/`，本次报告和备份写到目标项目的 `Saved/FaceMigration/Jobs/<任务>/Current/`。完整保留与清理规则见 [包维护约定](../AGENTS.md)。

角色 `Evidence/` 中的旧计数是对应批次快照，不能批量改成当前计数；采样、参数和 `previous_controls.json` 是复现及回归输入，不因文件大或日期早而删除——但大文件保存在目标项目 `Saved/FaceMigration/Characters/<角色>/`，包内只留参数、清单和小报告（见上表 `moved_out`）。变更路径时同步模板、角色表、脚本引用和链接，并运行 `python Tools/FaceMigration/migrate.py check`。同功能修改共用脚本，换目标改任务配置，不新增项目专用重放副本。
