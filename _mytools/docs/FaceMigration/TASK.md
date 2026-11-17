# 面部迁移任务单

> **只改这一份。** 编辑下面第 1、2 节（第 3 节可选），保存，把本文件路径交给 AI。AI 按第 5 节协议生成配置并执行流程，不需要另写说明。
> 第 2 节默认值就是 Seven 当前状态；新角色逐行替换 Max 控制器名即可，其余列一般不动。

## 0. 这份表的作用

| 内容                    | 谁维护                       | 写到哪                                                           |
| --------------------- | ------------------------- | ------------------------------------------------------------- |
| 示例 CR、目标 CR、网格、Max 场景 | 用户，本表第 1 节                | AI 生成 `Jobs/<角色>.json` 与 `Characters/<角色>/face-controls.json` |
| 72 个 Max 控制器名         | 用户，本表第 2 节                | 同上，并替换采样脚本里的硬编码名单                                             |
| 骨骼/Morph 映射           | 一般留空；新角色与 Seven 不同时填第 3 节 | AI 生成角色证据目录下的映射                                               |

不要在本表之外再维护第二份名单。`Characters/Seven/face-controls.json` 是示例角色的已填版本，不是新角色的配置位置。

## 1. 任务

| 字段            | 值（可直接改）                                                       | 说明                                         |
| ------------- | ------------------------------------------------------------- | ------------------------------------------ |
| 角色名           | Seven01 | 新角色填新名字；用于 `Characters/<角色>/` 与 `Jobs/`    |
| 示例 ControlRig | `/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression` | 只读，提供成熟控制设计与求解                             |
| 示例类型          | `ControlRigBlueprint`                                         | 换成 `ControlRigRuntimeAsset` 时同样可读，但 API 不同 |
| 目标 ControlRig | `/Game/_MyTest/Mouth/Seven01ECR/CR_Seven01_Expression` | 实际输出资产，需已存在；父目录以 `/Game/` 开头，必须与示例不同 |
| 目标依赖目录 | `/Game/_MyTest/Mouth/Seven01ECR/ToolsPanel` | 从目标 CR 所在目录推导，其他角色专用依赖全部放这里 |
| 目标类型          | `ControlRigRuntimeAsset`                                      | 空壳可直接构建；已有内容走增量                            |
| 目标网格          | `/Game/_MyTest/Mouth/Mesh/Seven`                              | 决定骨骼、Morph 与预览                             |
| Max 场景        | `D:/Download/Seven_Skin_New.max`                              | 执行前确认编辑器里打开的正是它                            |
| 采样帧           | 0                                                             | 中性帧                                        |
| 任务 ID         | seven01-taskflow-20261117 | 换资产必须换 ID，避免读旧结果                           |

目录和命名按[角色产出规范](Docs/Workflow/Build.md#角色产出目录与命名2026-11-17-起)：根目录为角色名加 `ECR`，CR 名为 `CR_<角色名>_Expression`；`ToolsPanel` 内沿用示例依赖名。若目标角色仍是 Seven，须另选父目录，不能覆盖当前只读 SevenECR 示例。旧任务中的 `TMp/NewControlRigRuntimeAsset` 不再作为新目标默认值。

## 2. 3ds Max 控制器名称（默认 = Seven 当前）

- `UE 控制` 是目标 Rig 里的名字，一般不换。
- `Max 控制器` 是新角色在 3ds Max 里的对象名，逐行替换；找不到同名对象时采样脚本会直接报 `Missing control`。
- 停用某项时把该行的 Max 控制器写成 `-`，AI 生成绑定表时置 `enabled: false` 并记录原因。

| #   | 功能 ID            | 功能                  | UE 控制                   | Max 控制器（默认 Seven）              | 分组   |
| ---:| ---------------- | ------------------- | ----------------------- | ------------------------------ | ---- |
| 1   | BROW_L           | 左眉整体                | `CTRL_BROW_L`           | `Animcraft_Left_Brow_Z_Ctrl`   | 眉毛   |
| 2   | BROW_R           | 右眉整体                | `CTRL_BROW_R`           | `Animcraft_Right_Brow_Z_Ctrl`  | 眉毛   |
| 3   | BROW_L_IN        | 左眉内点                | `CTRL_BROW_L_IN`        | `zCircle049`                   | 眉毛   |
| 4   | BROW_L_MID       | 左眉中点                | `CTRL_BROW_L_MID`       | `zCircle050`                   | 眉毛   |
| 5   | BROW_L_OUT       | 左眉外点                | `CTRL_BROW_L_OUT`       | `zCircle048`                   | 眉毛   |
| 6   | BROW_R_IN        | 右眉内点                | `CTRL_BROW_R_IN`        | `zCircle051`                   | 眉毛   |
| 7   | BROW_R_MID       | 右眉中点                | `CTRL_BROW_R_MID`       | `zCircle052`                   | 眉毛   |
| 8   | BROW_R_OUT       | 右眉外点                | `CTRL_BROW_R_OUT`       | `zCircle053`                   | 眉毛   |
| 9   | BROW_L_BEND      | 左眉弯曲                | `CTRL_BROW_L_BEND`      | `Animcraft_Left_Brow_Ctrl`     | 眉毛   |
| 10  | BROW_R_BEND      | 右眉弯曲                | `CTRL_BROW_R_BEND`      | `Animcraft_Right_Brow_Ctrl`    | 眉毛   |
| 11  | EYE_R_CORNER_IN  | 右内眼角                | `CTRL_EYE_R_CORNER_IN`  | `zCircle083`                   | 眼周点  |
| 12  | EYE_R_UP_IN      | 右眼上内                | `CTRL_EYE_R_UP_IN`      | `zCircle074`                   | 眼周点  |
| 13  | EYE_R_UP_MID     | 右眼上中                | `CTRL_EYE_R_UP_MID`     | `zCircle075`                   | 眼周点  |
| 14  | EYE_R_UP_OUT     | 右眼上外                | `CTRL_EYE_R_UP_OUT`     | `zCircle076`                   | 眼周点  |
| 15  | EYE_R_CORNER_OUT | 右外眼角                | `CTRL_EYE_R_CORNER_OUT` | `zCircle082`                   | 眼周点  |
| 16  | EYE_R_DOWN_OUT   | 右眼下外                | `CTRL_EYE_R_DOWN_OUT`   | `zCircle077`                   | 眼周点  |
| 17  | EYE_R_DOWN_MID   | 右眼下中                | `CTRL_EYE_R_DOWN_MID`   | `zCircle078`                   | 眼周点  |
| 18  | EYE_R_DOWN_IN    | 右眼下内                | `CTRL_EYE_R_DOWN_IN`    | `zCircle079`                   | 眼周点  |
| 19  | EYE_L_CORNER_IN  | 左内眼角                | `CTRL_EYE_L_CORNER_IN`  | `zCircle084`                   | 眼周点  |
| 20  | EYE_L_UP_IN      | 左眼上内                | `CTRL_EYE_L_UP_IN`      | `zCircle068`                   | 眼周点  |
| 21  | EYE_L_UP_MID     | 左眼上中                | `CTRL_EYE_L_UP_MID`     | `zCircle069`                   | 眼周点  |
| 22  | EYE_L_UP_OUT     | 左眼上外                | `CTRL_EYE_L_UP_OUT`     | `zCircle070`                   | 眼周点  |
| 23  | EYE_L_CORNER_OUT | 左外眼角                | `CTRL_EYE_L_CORNER_OUT` | `zCircle085`                   | 眼周点  |
| 24  | EYE_L_DOWN_OUT   | 左眼下外                | `CTRL_EYE_L_DOWN_OUT`   | `zCircle071`                   | 眼周点  |
| 25  | EYE_L_DOWN_MID   | 左眼下中                | `CTRL_EYE_L_DOWN_MID`   | `zCircle072`                   | 眼周点  |
| 26  | EYE_L_DOWN_IN    | 左眼下内                | `CTRL_EYE_L_DOWN_IN`    | `zCircle073`                   | 眼周点  |
| 27  | EYE_LID_R        | 右上眼皮                | `CTRL_EYE_LID_R`        | `SYP_R001`                     | 上眼皮  |
| 28  | EYE_LID_L        | 左上眼皮                | `CTRL_EYE_LID_L`        | `SYP_L001`                     | 上眼皮  |
| 29  | EYE_LOWER_LID_R  | 右下眼皮                | `CTRL_EYE_LOWER_LID_R`  | `XYP_R001`                     | 下眼皮  |
| 30  | EYE_LOWER_LID_L  | 左下眼皮                | `CTRL_EYE_LOWER_LID_L`  | `XYP_L001`                     | 下眼皮  |
| 31  | LIP_UP_L         | 左上唇                 | `CTRL_LIP_UP_L`         | `Animcraft_Left_up_Lip_Ctrl`   | 嘴唇   |
| 32  | LIP_UP_C         | 中央上唇                | `CTRL_LIP_UP_C`         | `Animcraft_up_Lip_Ctrl`        | 嘴唇   |
| 33  | LIP_UP_R         | 右上唇                 | `CTRL_LIP_UP_R`         | `Animcraft_Right_up_Lip_Ctrl`  | 嘴唇   |
| 34  | LIP_LOW_R        | 右下唇                 | `CTRL_LIP_LOW_R`        | `Animcraft_Right_low_Lip_Ctrl` | 嘴唇   |
| 35  | LIP_LOW_C        | 中央下唇                | `CTRL_LIP_LOW_C`        | `Animcraft_dn_Lip_Ctrl`        | 嘴唇   |
| 36  | LIP_LOW_L        | 左下唇                 | `CTRL_LIP_LOW_L`        | `Animcraft_Left_low_Lip_Ctrl`  | 嘴唇   |
| 37  | CHEEK_R          | 右脸颊                 | `CTRL_CHEEK_R`          | `Animcraft_Right_Cheek_Ctrl`   | 脸颊   |
| 38  | CHEEK_L          | 左脸颊                 | `CTRL_CHEEK_L`          | `Animcraft_Left_Cheek_Ctrl`    | 脸颊   |
| 39  | NOSE             | 鼻子整体                | `CTRL_NOSE`             | `Animcraft_Nose_Ctrl`          | 鼻子   |
| 40  | MOUTH_L          | 左嘴角                 | `CTRL_MOUTH_L`          | `Animcraft_Left_Mouth_Ctrl`    | 嘴控   |
| 41  | MOUTH_R          | 右嘴角                 | `CTRL_MOUTH_R`          | `Animcraft_Right_Mouth_Ctrl`   | 嘴控   |
| 42  | MOUTH            | 嘴部整体                | `CTRL_MOUTH`            | `Animcraft_Mouth_Ctrl`         | 嘴控   |
| 43  | EYEBALL_L        | 左眼球                 | `CTRL_EYEBALL_L`        | `YanJing_L001`                 | 眼球   |
| 44  | EYEBALL_R        | 右眼球                 | `CTRL_EYEBALL_R`        | `YanJing_R001`                 | 眼球   |
| 45  | EYEBALL_MASTER   | 双眼总控                | `CTRL_EYEBALL_MASTER`   | `YanJing_Zong001`              | 总眼控  |
| 46  | CHIN             | 下巴整体                | `CTRL_CHIN`             | `Line010`                      | 下巴   |
| 47  | EXPR_HUANGZHANG  | 慌张                  | `CTRL_EXPR_HUANGZHANG`  | `Circle117`                    | 整体表情 |
| 48  | EXPR_WUYU        | 无语                  | `CTRL_EXPR_WUYU`        | `Circle118`                    | 整体表情 |
| 49  | EXPR_SIKAO       | 思考                  | `CTRL_EXPR_SIKAO`       | `Circle119`                    | 整体表情 |
| 50  | EXPR_GANGA       | 尴尬                  | `CTRL_EXPR_GANGA`       | `Circle120`                    | 整体表情 |
| 51  | PHONEME_A_FV_01  | 口型 01（a_FV_ctrl01）  | `CTRL_PHONEME_A_FV_01`  | `a_FV_ctrl01`                  | 口型   |
| 52  | PHONEME_B_FV_002 | 口型 02（b_FV_ctrl002） | `CTRL_PHONEME_B_FV_002` | `b_FV_ctrl002`                 | 口型   |
| 53  | PHONEME_C_FV_003 | 口型 03（c_FV_ctrl003） | `CTRL_PHONEME_C_FV_003` | `c_FV_ctrl003`                 | 口型   |
| 54  | PHONEME_A        | 口型 04（A_ctrl）       | `CTRL_PHONEME_A`        | `A_ctrl`                       | 口型   |
| 55  | PHONEME_EE       | 口型 05（EE_ctrl）      | `CTRL_PHONEME_EE`       | `EE_ctrl`                      | 口型   |
| 56  | PHONEME_FV       | 口型 06（FV_ctrl）      | `CTRL_PHONEME_FV`       | `FV_ctrl`                      | 口型   |
| 57  | PHONEME_GNK      | 口型 07（GNK_ctrl）     | `CTRL_PHONEME_GNK`      | `GNK_ctrl`                     | 口型   |
| 58  | PHONEME_MBP      | 口型 08（MBP_ctrl）     | `CTRL_PHONEME_MBP`      | `MBP_ctrl`                     | 口型   |
| 59  | PHONEME_SH       | 口型 09（SH_ctrl）      | `CTRL_PHONEME_SH`       | `SH_ctrl`                      | 口型   |
| 60  | PHONEME_W        | 口型 10（W_ctrl）       | `CTRL_PHONEME_W`        | `W_ctrl`                       | 口型   |
| 61  | PHONEME_OTHER    | 口型 11（Other_ctrl）   | `CTRL_PHONEME_OTHER`    | `Other_ctrl`                   | 口型   |
| 62  | PHONEME_A_A_02   | 口型 12（a_A_ctrl02）   | `CTRL_PHONEME_A_A_02`   | `a_A_ctrl02`                   | 口型   |
| 63  | EYE_EXPR_QI_R    | 右眼_气                | `CTRL_EYE_EXPR_QI_R`    | `R_mouthUpCircleCtrl01`        | 眼神   |
| 64  | EYE_EXPR_NU_R    | 右眼_怒                | `CTRL_EYE_EXPR_NU_R`    | `R_mouthUpCircleCtrl008`       | 眼神   |
| 65  | EYE_EXPR_YOU_R   | 右眼_忧                | `CTRL_EYE_EXPR_YOU_R`   | `R_mouthUpCircleCtrl03`        | 眼神   |
| 66  | EYE_EXPR_HAPPY_R | 右眼_笑                | `CTRL_EYE_EXPR_HAPPY_R` | `R_mouthUpCircleCtrl00`        | 眼神   |
| 67  | EYE_EXPR_QI_L    | 左眼_气                | `CTRL_EYE_EXPR_QI_L`    | `L_mouthUpCircleCtrl00`        | 眼神   |
| 68  | EYE_EXPR_NU_L    | 左眼_怒                | `CTRL_EYE_EXPR_NU_L`    | `L_mouthUpCircleCtrl008`       | 眼神   |
| 69  | EYE_EXPR_YOU_L   | 左眼_忧                | `CTRL_EYE_EXPR_YOU_L`   | `L_mouthUpCircleCtrl02`        | 眼神   |
| 70  | EYE_EXPR_HAPPY_L | 左眼_笑                | `CTRL_EYE_EXPR_HAPPY_L` | `L_mouthUpCircleCtrl04`        | 眼神   |
| 71  | NOSE_SIDE_R      | 右鼻侧                 | `CTRL_NOSE_SIDE_R`      | `Animcraft_Right_Nose_Ctrl`    | 鼻侧   |
| 72  | NOSE_SIDE_L      | 左鼻侧                 | `CTRL_NOSE_SIDE_L`      | `Animcraft_Left_Nose_Ctrl`     | 鼻侧   |

## 3. 可选：骨骼与依赖（默认留空）

| 字段         | 值                 | 说明                                      |
| ---------- | ----------------- | --------------------------------------- |
| 骨骼名映射      | （留空 = 与 Seven 同名） | 格式 `Max骨名=UE骨名`，每行一个                    |
| Morph 通道映射 | （留空 = 按名称匹配）      | 新角色 Morpher 通道顺序不同时填                    |
| 形状库依赖      | 默认继承示例            | 项目内 `SL_PhonemeReference` 缺失时口型图会退回默认形状 |
| 头部骨        | `head001`         | Seven 当前实际锚点；新角色填写实测名称，用于求解动画空间与控制显示跟随 |
| 身体测试动画    | `/Game/_MyTest/Mouth/Mesh/5秒台词测试_不带口型_Anim` | 用于独立实例的五个动画时刻验证；其他角色填写自身动画，不代表 Sequencer 验收 |

## 4. 提交前的自检

- [ ] 目标 CR 已在编辑器中存在，类型与本表一致
- [ ] 根目录为 `<角色名>ECR`，主资产为 `CR_<角色名>_Expression`，其他角色专用依赖在 `ToolsPanel/`；示例与目标路径不同
- [ ] Max 里打开的确实是指定场景，当前帧为采样帧
- [ ] 第 2 节没有残留旧角色的控制器名
- [ ] 目标资产已备份（AI 会在执行前再做一次磁盘与内存备份）

## 5. AI 执行协议（用户不要手改本节）

1. **读表**：解析第 1、2 节；第 3 节为空则按“同名匹配”处理。
2. **建配置**：
   - `Characters/<角色名>/face-controls.json`：以本表第 2 节生成 `bindings[]`（`role_id`、`group`、`label`、`side`、`ue_control`、`max_name`、`enabled`），`source`/`target`/`reference` 取自第 1 节。
   - `Jobs/<角色名>-<日期>.json`：`job_id` 独立，`character` 用第 1 节角色名，`asset_overrides` 至少包含
     `"/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset": "<第 1 节目标 CR>"`；目标不同就用新 job，不复用旧结果。
   - 示例旧固定路径 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation` 映射到第 1 节当前示例。空目标派生入口已复制并重绑定面板依赖，轨道、预览和验证共用 `rig_dependency_folder()`；示例依赖的只读盘点保持指向示例自身，不能把示例与目标资源映射混为一份。使用旧部位配方时，仍须按实际调用列出依赖的精确旧包路径 → 本角色 `ToolsPanel/` 路径。`asset_overrides` 不支持目录前缀替换，不能仅加一个目录键就运行旧入口。
   - 将第 3 节头部骨和身体测试动画写入任务的 `validation.head_bone`、`validation.animation`；没有动画时须明确记录实际动画未测，不能用参考姿势通过代替。
3. **改采样脚本**：把下列文件里硬编码的 Max 对象名替换成第 2 节的值（骨骼名在第 3 节）。
   `probe_lip_samples.ms`、`probe_cheek_samples.ms`、`probe_mouth_samples.ms`、`probe_nose_samples.ms`、`probe_nose_side_samples.ms`、`probe_chin_samples.ms`、`probe_eyeball_samples.ms`、`probe_gaze_master_samples.ms`、`probe_xyp_samples.ms`、`probe_expression_sliders.ms`、`probe_phoneme_sliders.ms`、`probe_eye_expression_sliders.ms`，眉毛与上眼皮另改 `probe_animcraft_*.ms`、`probe_syp*.ms` 里的对象名与骨骼名。
   这些脚本目前不读 `face-controls.json`，所以必须同步改；改完先用 `-DryRun` 检查将发送的代码。
4. **探测与判定**：按 [Build.md](Docs/Workflow/Build.md) 第 1~3 节执行：独立探测目标骨架/网格/Morph，写 `reference_inventory.json`、`adaptation_report.json`；判定“等价核对”还是“重新绑定”。
5. **构建与验证**：先核对并适配生成、验证、备份、保存重载共用入口的路径；空目标用 `build_runtime_face_controls.py`，非空走增量；随后 `verify_runtime_face_controls.py`、保存重载、正常帧预览。滑块手柄须比滑轨向前浮起 1 cm（Seven：Initial/Current shape 局部 +Y=1），并关闭原置顶调试轨道，改用不透明、正常深度测试的实体 Visual Cue（线宽 0.12 cm，新增 `VIS_SLIDER_RAILS`，动画接口不变）。沿用示例时同样应用，不能改控制 offset 或输入值；共用 `slider_handle_layout.py` 的 `apply_slider_layout()`，已有目标用 `update_slider_handle_depth.py`。主 CR 直接放 `<角色名>ECR/`，其余角色专用依赖（含预览 ABP）统一放 `ToolsPanel/`，随整个角色包迁移。报告写到 `Saved/FaceMigration/Jobs/<job_id>/Current/Evidence/`；原始采样与回归快照写到 `Saved/FaceMigration/Characters/<角色>/`，不要写回工具包。
   动画相关必须按[两项必查](Docs/Workflow/Build.md#动画头部空间与控制器跟随两项必查)分别处理：① 面部求解保留输入动画的头部 Transform；② 控制器、滑轨与参考图随头部平移旋转。盘点并迁移私有缓存变量、Null 和头部绑定；保存前、重载后及实际动画帧独立验证，Sequencer 未测须注明。已有空间实现不重复包装；只检查默认姿势、或只复制节点/控制设置均不够。当前通用脚本的覆盖边界见主流程，不能用旧报告代替新目标验证。
6. **交付说明**：列出实际目标 CR、`ToolsPanel/` 依赖清单与重载后的引用检查、已迁移功能、与示例的有意差异、通过项、未通过项（尤其预览与用户画面）、“动画头部空间”与“控制器头部跟随”两项独立结论，以及问题清单 `flow_findings.md`。
7. **边界**：示例资产只读；`previous_controls.json` 只对旧求解谱系有效，空目标新建时不作为门禁；不一致的名称必须报错，不允许静默回退到 Seven 的名字。

口型图布局默认仅在滑轨后方 **1 cm**，不继承旧版 6 cm 的大间距。Seven 为图形 Y=17、轨道 Y=18、手柄中心 Y=19；共用布局与参考图生成器通过 shape translation 调整，保留原 offset、X/Z、大小和逐行对齐。

## 6. 相关文档

- 主流程：[Docs/Workflow/Build.md](Docs/Workflow/Build.md)
- 工具与脚本：[Docs/Workflow/Tools.md](Docs/Workflow/Tools.md)
- 验证规范：[Docs/Workflow/Validation.md](Docs/Workflow/Validation.md)
- 名称总表（示例角色）：[Docs/Reference/ControllerNames.md](Docs/Reference/ControllerNames.md)
- 当前 Seven 状态：[Characters/Seven/README.md](Characters/Seven/README.md)
