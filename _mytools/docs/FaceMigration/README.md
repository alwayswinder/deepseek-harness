# FaceMigration

最新 Test 测试的目标为用户指定的 `Expression/test/CR_Test_Expression`。构建、显示、保存重载及独立实例验证通过；Max 原始姿势抽检未通过，PIE 启动触发 FSR 视口断言，正常帧与最终验收未通过。当前状态及阻止复跑的原因见 [Test 角色记录](Characters/Test/README.md)。以下 Seven01 与 Seven 结果仅属于各自任务。

2026-11-17 已按新角色流程完成 `Seven01ECR/CR_Seven01_Expression` 的技术检查：独立绑定探测、72 动画控制 + 2 Visual Cue、1175 组迁移对照、592 组动画空间检查、Max 代表控制抽检和 PIE 81 组正常帧通过；CR 与 `ToolsPanel/` 下全部 8 个依赖已保存重载，示例保持只读。外观/拾取、身体动画播放宿主及 Sequencer 待验收，范围见[Seven01 角色记录](Characters/Seven01/README.md)，配置见[本轮任务](Jobs/seven01-taskflow-20261117.json)。

后续角色产出统一按示例派生：`<父目录>/<角色名>ECR/CR_<角色名>_Expression`，主 CR 直接放根目录，其余新生成或复制的角色专用依赖全部放同包 `ToolsPanel/`。示例 CR 由用户在开始任务的对话里给出，不在文档中预填；依赖沿用 `T_expression`、`M_/SM_/SL_PhonemeReference`、`M_/SM_/SL_SliderRails` 的功能名。完整目录树、主流程路径支持和交付检查见[角色产出目录与命名](Docs/Workflow/Build.md#角色产出目录与命名2026-11-17-起)。2026-11-17 主流程已支持独立复制并重绑定 `ToolsPanel` 依赖，保存重载后核对引用；下方带日期的运行记录仍保留当时路径与结论。

2026-11-12 已在用户新建的空目标 `NewControlRigRuntimeAsset` 上按新角色流程重跑，配置 [seven-taskflow-20261112.json](Jobs/seven-taskflow-20261112.json)。重新读表、独立探测及备份后判为绑定等价，迁入更新后的示例设计：72 动画控制 + 2 Visual Cue、149 骨、28 曲线、1927 节点 / 2645 连接，包含私有头部缓存与 FACE_SPACE。保存前和重载后各 1175 组迁移对照误差为零、显示契约无差异、各 592 组动画姿势检查通过；当前 Max 上眼皮五点抽检及 PIE 81 组正常帧检查通过。源只读，临时 PIE Actor 已清理，未保存用户关卡。

本轮修正了绑定判定的六位舍入误判、补齐 RuntimeAsset 成员变量迁移，并将两项动画空间检查纳入保存重载与交付门禁。保留问题：资产编辑器预览仍停在 0.4 秒，刷新一次无效（PIE 为独立宿主通过）；引擎给私有变量额外设置 Cinematics 标记及丢失分类；身体动画播放宿主、Sequencer、最终画面与拾取尚未验收。不能写整体验收通过。详见本轮 `Saved/FaceMigration/Jobs/seven-taskflow-20261112/Current/Evidence/flow_findings.md` 和[角色当前记录](Characters/Seven/README.md)。下文旧任务记录保留历史结论。

将原来的文档、脚本、角色数据及关联资料集中成一个可迁移目录。整体复制此目录到另一项目的 `Tools/FaceMigration/`；运行日志和备份不需要一起复制。

## 开始：填任务单

新角色只编辑 [TASK.md](TASK.md)：第 1 节填角色名、网格和 Max 场景，第 2 节是 72 个 Max 控制器名（默认就是 Seven 当前值），第 3 节按需填骨骼/Morph 映射；示例 CR 与目标 CR 的完整资产路径不写进任务单，在开始任务的对话里直接给出。保存后把该文件交给 AI，按其中第 5 节协议生成 `Jobs/<角色>.json`、`Characters/<角色>/face-controls.json` 并执行流程。

同一角色换目标资产时，在对话中给出新目标路径，并在任务单更新任务 ID；AI 据此同步角色配置和 job，不复用旧任务结果。不要复制脚本、不要改 `Characters/Seven/`。表之外不再维护第二份名单。

默认流程为**示例 Rig 派生 + Max 源核验 + 目标适配**，见[唯一主流程](Docs/Workflow/Build.md)。示例 CR 由用户在开始任务的对话里给出：允许读取、复制和复用实现，保留控制形状、配色、滑轨、参考图、行程和操作方式。Max 核对真实动作；新角色重新绑定并适配参数。2026-11-10 的从零重建外观已被用户指出不符合示例，数值通过不能作为整体验收通过。

2026-11-10 另做了一次“当成新角色”的流程验证：示例、当前 Max 角色和用户新建的 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset1` 被当作三个不同角色处理，先独立探测目标绑定，再继承示例设计并在空目标上构建。结果分段记录：结构、示例→目标（1175 组 worst 全 0）、显示契约（0 差异）、上眼皮 Max 抽检（0.00344 cm / 0.00059°）和保存重载通过；**正常帧预览未通过**（Rig 时间停在 0.4 s，两次 refresh 未恢复）；用户画面待验收。执行配置为 `Jobs/seven-newchar-20261110.json`，问题清单在该任务 `Current/Evidence/flow_findings.md`。该目标 `Asset1` 随后被删除，本轮记录只作历史。

2026-11-10 第二轮按 TASK.md 第 5 节协议在新空壳 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset` 上完整重跑（配置 `Jobs/seven-taskflow-20261110.json`）：结构、示例→目标（1175 组 worst 全 0）、显示契约（0 差异、55 个形状名全部可解析）、上眼皮 Max 抽检（主骨 0.00344 cm / 0.0808°）、保存重载全部通过；**正常帧预览仍未通过**（时钟停 0.4 s，两次 refresh 无效；手动 Forwards Solve 能出 rig 曲线，但网格动画曲线仍为 0）；12 个部位验证器 2/12 属旧控回归谱系误报。执行与问题清单在 `Saved/FaceMigration/Jobs/seven-taskflow-20261110/Current/Evidence/flow_findings.md`。此前的增量恢复任务 `seven-reference-adapt` 保留为历史。实际状态和范围见[角色记录](Characters/Seven/README.md)。最终画面与拾取手感仍由用户验收。

```text
Tools/FaceMigration/
  TASK.md                     用户填写的任务单（角色名、Max 控制器名单；示例/目标 CR 在对话中给出）
  migrate.py                  固定命令入口
  AGENTS.md                   AI 执行和维护约定
  Docs/                       通用流程、配方、模板、排障
  Scripts/                    共用脚本及路径/API 适配层
  Characters/Seven/           名称表、角色说明、历史采样及回归基准
  Jobs/                       每个目标的轻量配置
  ProjectNotes/               原项目其他系统的历史资料
  preservation.manifest.json 原始证据摘要
  Tests/                      路径隔离和保留规则测试
```

## 迁移到其他项目

动画适配有两项独立要求：**面部求解保留动画头部 Transform**，以及**控制器、滑轨、参考图随头部平移旋转**。症状、修复选择、继承依赖与现有脚本覆盖边界见[主流程两项必查](Docs/Workflow/Build.md#动画头部空间与控制器跟随两项必查)，验收见[独立验收](Docs/Workflow/Validation.md#41-动画头部空间与控制器跟随的独立验收)。当前示例 Blueprint 已修复并有本轮记录；新目标仍需重新绑定和实测，现有通用构建/验证并不自动保证两项通过。

1. 复制整个 `FaceMigration` 文件夹，不复制原项目的 `Saved`。另外准备示例 Rig 及其形状库、材质和贴图依赖，以及 Max 场景、UE 网格、骨架和 Morph；工具包不包含这些 UE 资产，也不包含原始采样（在 `Saved/FaceMigration/Characters/<角色>/`，需要时从原项目拷回或重新采样）。
2. 在 `Jobs/` 增加小型 JSON 配置，使用独立 `job_id`、`character` 和 `asset_overrides`。保留示例和目标为不同资产。一个目标一份配置：`asset_overrides` 必须精确命中脚本里写死的包路径（默认是 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`），它只影响 `asset_path()` / `asset_disk_path()` 的调用点，不影响脚本里的日志或外部命令。换资产后先用 `probe_cr_migration.py` 复核报告里的 `target` 字段，确认没有读写旧路径。旧配方配置 [seven-runtime.json](Jobs/seven-runtime.json) 会将多条 Rig 路径映射到同一目标，不能用于需要独立示例的整图迁移，也不是全量重建清单。
3. 按[主流程](Docs/Workflow/Build.md)先读取并继承示例控制设计，再核对 Max。相同角色保留经验证的实现；新角色重新绑定、定参，只为差异或缺项采样拟合。路径可迁移不等于数值通用。
4. 在目标项目根运行以下检查。工具包放在其他位置时，通过 `--project` 指定 `.uproject` 所在目录。

```powershell
python Tools/FaceMigration/migrate.py check
python Tools/FaceMigration/migrate.py run probe_cr_migration.py --job seven-local --dry-run
```

### 目标项目需要准备的内容

- 本地 Python 3.10 或更新版本；离线拟合另外安装 NumPy / SciPy。Max 客户端示例使用 PowerShell 7（`pwsh`）。
- UE 侧启用 Python Editor Script Plugin，并在项目设置的 Python 中开启远程执行；编辑器打开目标项目。内置 MCP 与 Python 远程执行是不同通道，仅开启 MCP 不足以运行 `migrate.py run` 的 UE 脚本。
- Max 侧需要运行中的 3ds Max 及 3dsmax-mcp 原生命名管道桥接；多实例显式传 `-MaxPid`。`-DryRun` 无需启动 Max。
- 源 Max / FBX 文件、目标 UE 角色资产及其插件依赖由目标项目提供。复制这个目录不会复制 `Content`、插件或原机器的外部素材。

同一 Seven 在另一项目更换资产位置时，在 `Jobs/` 维护一份目标配置，`asset_overrides` 填脚本使用的原资产包路径到目标实际包路径的映射。网格、骨架、Rig、形状库和参考贴图等用到的路径均需核对；导入目录与资产名来自映射后的完整网格路径，骨架路径也应与实际导入结果一致。每个目标只维护自己的配置，不按运行次数复制脚本和文档。

需要 FBX 导入或指定 Max 场景时，在该配置中添加可选 `source` 字段，例如：

```json
"source": {
  "max_scene": "SourceFiles/Seven.max",
  "fbx": "SourceFiles/Seven.fbx",
  "fbx_check": "SourceFiles/Seven_v2.fbx"
}
```

这些相对路径以目标项目根目录为基准，也可显式配置外部文件的绝对路径。只填写本任务使用的项：`import_seven_replace.py` 使用 `fbx`，`import_seven_check.py` 使用 `fbx_check`；缺少配置或文件时会报错，不回退到旧机器的下载目录。Max 的 `-SourceScene` 可覆盖 `max_scene`，同样以目标项目为基准。源文件配置或目标资产改变时使用新的 `job_id`，避免读取旧目标的结果。

### 已覆盖的迁移验证

测试会实际复制整个工具包到含中文、空格路径的临时 UE 项目，从其他工作目录执行检查、Python / Max 入口预演及离线准备，再切换到第二个项目验证输出隔离；同时核对重复执行不新增脚本、归档只保留最近三份、包内文件摘要不变。这些测试不启动 UE / Max，不等同于目标项目内的构建、采样或画面验收。

## 调用脚本

```powershell
# 接任务单的固定顺序（全部是包内入口，不需要临时脚本）
python Tools/FaceMigration/migrate.py run check_character_task_sheet.py --job <任务>
python Tools/FaceMigration/migrate.py run inventory_target.py --job <任务>
python Tools/FaceMigration/migrate.py run build_runtime_face_controls.py --job <任务>
python Tools/FaceMigration/migrate.py run verify_runtime_face_controls.py --job <任务>
python Tools/FaceMigration/migrate.py run crosscheck_max_control.py --job <任务>
python Tools/FaceMigration/migrate.py run finalize_runtime_face_controls.py --job <任务>
python Tools/FaceMigration/migrate.py run probe_runtime_face_morph_preview.py --job <任务>
python Tools/FaceMigration/migrate.py run assemble_delivery.py --job <任务> --offline

# 连接正在运行的目标 UE，执行只读探测；引擎通常可从项目关联/安装位置发现
python Tools/FaceMigration/migrate.py run probe_cr_migration.py --job seven-local

# 显式指定引擎目录；这是本机示例，其他电脑填实际安装位置
python Tools/FaceMigration/migrate.py run probe_cr_migration.py --engine-root E:/Unreal/UE_5.8

# 只显示脚本、输入、输出及配置，不连接 UE
python Tools/FaceMigration/migrate.py run build_lip_controls.py --job seven-runtime --dry-run
```

正常帧验证可使用任务配置 `"preview": {"host": "pie", "prepare": true}`：
`probe_runtime_face_morph_preview.py` 在角色包 `ToolsPanel/` 目录创建带 owner 标记的
`ABP_FacePreview`，添加临时关卡网格并启动模拟，先测示例图实际驱动的 Morph；半程期望从只读示例的独立实例计算，不要求新角色复制历史参数文件。
等本任务 `SevenRuntime/pie_morph_check.json` 的 `pending=false` 且 `passed=true`，
再运行 `verify_runtime_face_preview.py` 测 72 个控制、组合与恢复；配置头部锚点时另加六组头部变换，共 81 组。
后者完成后关闭工具启动的 PIE 并移除临时 Actor，不保存用户关卡。
没有此配置时仍检查资产编辑器预览；两类报告分开保存。已有用户 PIE 时不接管。

`UE_ENGINE_ROOT` 环境变量也可指定引擎。多个 UE 实例用 `--project` 和 `--node-id` 精确定位。`run --offline` 用于普通 Python 拟合脚本；先把本次原始采样放入对应任务的 `Current/Temp/`。NumPy / SciPy 等拟合依赖需要另外安装。

Python 远程发现不可用、但项目安装了 `UE_MCP_Bridge` 时，读取目标项目 `Saved/UE_MCP_Bridge/port.json`，核对 `pid` 与当前编辑器，再为在线命令显式增加 `--bridge-port <port>`。客户端 Python 需安装 `websockets`；执行前仍校验 UE 项目路径。大图构建使用 `--timeout 1200`。端口是本次进程的发现结果，不写成通用固定值；连接断开不等于 UE 已停止，先读本任务报告及编辑器状态，不能直接重发构建。

Bridge 长调用禁用 WebSocket 短心跳，执行仍受显式超时约束；超时或断线不提供取消保证。报告确认构建完成后继续验证，不再次导入整图。PIE 崩溃的停止与恢复规则见[验证规范](Docs/Workflow/Validation.md#pie-启动崩溃时的处理)。

例如生成本任务的采样骨名单：`python Tools/FaceMigration/migrate.py run fit_cheek_controls.py --offline --job seven-local --script-arg=--prepare`。

Max 采样沿用包内客户端，自动注入目标任务 Temp 路径；无需在 MaxScript 中填写项目绝对路径：

```powershell
pwsh -File Tools/FaceMigration/Scripts/max_run.ps1 -ScriptFile probe_mouth_samples.ms -Job seven-local
# 多实例加 -MaxPid；外部项目加 -ProjectRoot；只看将发送的代码加 -DryRun
```

若通过 Max MCP 直接执行采样内容，应先从对应任务配置设置 `FaceMigrationTempDir`；需要加载指定源场景时同时设置 `FaceMigrationSourceScene`。否则使用上面的客户端入口，避免沿用另一任务的 Max 全局变量。

既有脚本的首次构建、增量修改、重建限制仍有效。不要对已建好的资产整段重放所有 `build_*`。内置的 RuntimeAsset 适配层只转发 API，不将临时 host 当作实际预览，也不伪造 Blueprint 编译状态。整图迁移/对照脚本需要保留独立源资产，不能把源和目标映射成同一个包。

滑块手柄默认比滑轨向前浮起 **1 cm**（Seven 为局部 +Y）；滑轨使用 **不透明、正常深度测试的实体辅助形状**，线宽 0.12 cm，关闭原置顶调试线。仅前移不能修复调试线覆盖拾取区域的问题。生成器与显示验证器共用 `Scripts/slider_handle_layout.py`，保留 72 个动画接口与求解；新增的 `VIS_SLIDER_RAILS` 只作不可操作的 Visual Cue。后续生成依赖统一放角色包 `ToolsPanel/`，迁移时携带整个角色包；共用生成与验证入口已统一使用 `ToolsPanel/`。已有目标用 `migrate.py run update_slider_handle_depth.py --job <任务>` 增量修复，详见[拾取间距规则](Docs/Workflow/Build.md#滑块与滑轨的拾取间距)。

口型参考图默认收近到滑轨后方 **1 cm**；Seven 为图形 Y=17、滑轨 Y=18、手柄中心 Y=19。新建与增量修复共用此规则，旧版轨道后方 6 cm 的布局只作历史记录。

2026-11-11 按用户明确要求，同样的布局已同步到原始示例 `CR_Seven_LidWorldRotation`，配置为 `Jobs/seven-reference-layout-20261111.json`；示例依赖在其同名 `_UI/` 目录。普通迁移仍只读示例，后续用新任务读取更新后的示例摘要，历史报告保留原值。

迁移后单独比较示例的控制设计、Max 的动作及目标正常帧输出。控制数、骨骼数或曲线数相同不代表滑轨、口型图和手感完整。先检查代表性小组的外观与操作，再扩大数值采样；未确认和用户已拒绝的视觉状态分开记录。只整理文档时不运行资产修改。

历史文档内的 `Scripts/ue_run.py` 示例已更新到包内路径；新任务优先使用 `migrate.py run`，这样运行上下文和清理规则一致。历史 `Evidence/**/replay_*.py` 保留原字节，只供追溯，不再生成或执行这些磁盘副本。

## 输出与保留规则

```text
<目标项目>/Saved/FaceMigration/
  Characters/<角色>/      外置证据：max_samples、previous_controls、图导出、采样清单
  Imported/               历史批次（例如 CR58）
  Jobs/<job_id>/
    .face-migration.json  所属项目、角色和任务配置
    Current/
      Evidence/          本任务报告、拟合结果、当前回归快照
      Temp/              原始采样输入、日志、一次性诊断
      Backups/           修改前资产备份
    History/             显式交付归档
```

工具包本身只保留参数（`parameters.json`）、小报告、文档和脚本；原始采样等大文件放 `Saved/FaceMigration/Characters/<角色>/`。`read_path` 的顺序是：本任务 `Current/Evidence/` → 项目侧 `Characters/<角色>/` → 包内 `Evidence/`。因此复制工具包到新项目后不会带上采样，新项目要么按 [TASK.md](TASK.md) 重新采样，要么从原项目手工拷回同名目录。

读取参数或基准时，优先使用同任务 `Current/Evidence/` 中的当前文件，再读取包内角色基准。构建、重载和预览报告必须来自当前任务，缺失时不会沿用历史通过状态。更换目标、角色或资产映射时使用新任务 ID。

重复运行更新固定报告文件，不复制整套数据或脚本。成功的同步调用后，按名称分组的带时间戳备份保留最近 3 份；失败调用保留现场。交付需要留档时显式执行：

```powershell
python Tools/FaceMigration/migrate.py archive --job seven-local

# 先预览旧备份/归档清单，再按需应用
python Tools/FaceMigration/migrate.py cleanup --job seven-local
python Tools/FaceMigration/migrate.py cleanup --job seven-local --apply
```

归档也默认保留最近 3 份；目录中放置 `.keep` 可固定保留。清理只处理有本工具归属标记的任务目录，不删除源采样、角色基准、已有 `Saved/Codex` 或本次整理留下的 `Saved/FaceMigration/Imported`。临时诊断结束后可人工清理该任务的 `Temp`，清理前确认需要复现的采样已正式保存。

原来的 `Scripts/_tmp` 和缓存已移到原项目的 `Saved/FaceMigration/Imported/`。整理前的脚本备份和移动核对清单位于 `Saved/FaceMigration/Refactor/`，这两处只为本次整理保留，不跟随工具包迁移，也不反复生成。

## 验证范围

```powershell
python Tools/FaceMigration/migrate.py check
python -B -m unittest discover -s Tools/FaceMigration/Tests
```

离线检查覆盖文档导航、72 项映射、脚本语法、只读数据摘要和路径/保留规则。本次目录整理不重建或保存 UE 资产；历史功能验收及已知误差见 [角色记录](Characters/Seven/README.md)。
