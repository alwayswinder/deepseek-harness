# 新角色面部控制器名称表（填写模板）

复制本文件为 `Tools/FaceMigration/Characters/<角色名>.face-controls.md` 后填写。功能编号和中文功能保持，改最后一列为新角色的 Max 精确名称；没有的功能将“启用”改为“否”，写明缺少，不猜相似名称。也可以填写同目录的 [JSON 模板](CharacterFaceControllers.json)。

## 角色与资产

| 项目 | 填写值 |
|---|---|
| 角色名 | 待填 |
| Max 场景完整路径 | 待填 |
| 源采样帧 | 0（有专用参考帧时修改） |
| UE SkeletalMesh 资产路径 | 待填 |
| UE 目标 ControlRig 资产路径 | 从对话写入用户指定的实际路径，与示例不同；未指定命名时默认 `<父目录>/<角色名>ECR/CR_<角色名>_Expression` |
| UE 目标依赖目录 | 目标 CR 同目录的 `ToolsPanel`；其余角色专用依赖全部放这里 |
| UE 示例 Rig（参考实现） | 待填；由用户在开始任务的对话里给出完整路径，须在目标项目可访问 |
| 可选基础 Rig 资产 | 无 / 待填 |
| 可选口型参考 Texture2D | 无 / 待填 |
| 布局额外要求 | 默认继承示例形状、配色、滑轨、参考图和行程，再按目标解剖适配；眼神在画面左侧，表情 / 口型在右侧 |

坐标、骨骼名、Morph 名和增益由探测补齐；无需为了填表先猜这些值。Max 和 UE 需要能通过 MCP 或项目远程执行接口访问。模型应已导入 UE，所需骨骼和 Morph 可用。

目录与依赖命名遵守[角色产出规范](../Workflow/Build.md#角色产出目录与命名2026-11-17-起)。JSON 模板的 `target.control_rig` 填同样的实际路径，依赖目录由其父目录推导；空目标派生主流程已支持 `ToolsPanel/`，旧部位配方使用前仍须核对路径。

示例 Rig 提供控制设计和可复用实现，Max 核验动作；不要求从零构建。相同角色可保留经源核验的参数，新角色重新绑定和定参。已有口型图和滑轨默认保留，不能只复制动画控制数。示例与输出目标分别指定，示例保持不变。

## 控制对应表

主清单 46 项，补充基础 26 项，总计 72 行。可只启用本角色需要的功能。

| 分组 | 固定功能编号 | 中文功能 | Seven 名称参考 | 启用（是 / 否） | 新角色 Max 精确名称 |
|---|---|---|---|---|---|
| 上眼皮 | `EYE_LID_R` | 右上眼皮 | `SYP_R001` | 是 | 待填 |
| 上眼皮 | `EYE_LID_L` | 左上眼皮 | `SYP_L001` | 是 | 待填 |
| 下眼皮 | `EYE_LOWER_LID_R` | 右下眼皮 | `XYP_R001` | 是 | 待填 |
| 下眼皮 | `EYE_LOWER_LID_L` | 左下眼皮 | `XYP_L001` | 是 | 待填 |
| 六个嘴唇控制 | `LIP_UP_L` | 左上唇 | `Animcraft_Left_up_Lip_Ctrl` | 是 | 待填 |
| 六个嘴唇控制 | `LIP_UP_C` | 中央上唇 | `Animcraft_up_Lip_Ctrl` | 是 | 待填 |
| 六个嘴唇控制 | `LIP_UP_R` | 右上唇 | `Animcraft_Right_up_Lip_Ctrl` | 是 | 待填 |
| 六个嘴唇控制 | `LIP_LOW_R` | 右下唇 | `Animcraft_Right_low_Lip_Ctrl` | 是 | 待填 |
| 六个嘴唇控制 | `LIP_LOW_C` | 中央下唇 | `Animcraft_dn_Lip_Ctrl` | 是 | 待填 |
| 六个嘴唇控制 | `LIP_LOW_L` | 左下唇 | `Animcraft_Left_low_Lip_Ctrl` | 是 | 待填 |
| 左右脸颊 | `CHEEK_R` | 右脸颊 | `Animcraft_Right_Cheek_Ctrl` | 是 | 待填 |
| 左右脸颊 | `CHEEK_L` | 左脸颊 | `Animcraft_Left_Cheek_Ctrl` | 是 | 待填 |
| 鼻子整体 | `NOSE` | 鼻子整体 | `Animcraft_Nose_Ctrl` | 是 | 待填 |
| 左右鼻侧小控制 | `NOSE_SIDE_R` | 右鼻侧 | `Animcraft_Right_Nose_Ctrl` | 是 | 待填 |
| 左右鼻侧小控制 | `NOSE_SIDE_L` | 左鼻侧 | `Animcraft_Left_Nose_Ctrl` | 是 | 待填 |
| 嘴角及嘴部整体 | `MOUTH_L` | 左嘴角 | `Animcraft_Left_Mouth_Ctrl` | 是 | 待填 |
| 嘴角及嘴部整体 | `MOUTH_R` | 右嘴角 | `Animcraft_Right_Mouth_Ctrl` | 是 | 待填 |
| 嘴角及嘴部整体 | `MOUTH` | 嘴部整体 | `Animcraft_Mouth_Ctrl` | 是 | 待填 |
| 左右眼球 | `EYEBALL_L` | 左眼球 | `YanJing_L001` | 是 | 待填 |
| 左右眼球 | `EYEBALL_R` | 右眼球 | `YanJing_R001` | 是 | 待填 |
| 双眼总控 | `EYEBALL_MASTER` | 双眼总控 | `YanJing_Zong001` | 是 | 待填 |
| 下巴整体 | `CHIN` | 下巴整体 | `Line010` | 是 | 待填 |
| 四个整体表情 | `EXPR_HUANGZHANG` | 慌张 | `Circle117` | 是 | 待填 |
| 四个整体表情 | `EXPR_WUYU` | 无语 | `Circle118` | 是 | 待填 |
| 四个整体表情 | `EXPR_SIKAO` | 思考 | `Circle119` | 是 | 待填 |
| 四个整体表情 | `EXPR_GANGA` | 尴尬 | `Circle120` | 是 | 待填 |
| 十二口型 | `PHONEME_A_FV_01` | 口型 01（a_FV_ctrl01） | `a_FV_ctrl01` | 是 | 待填 |
| 十二口型 | `PHONEME_B_FV_002` | 口型 02（b_FV_ctrl002） | `b_FV_ctrl002` | 是 | 待填 |
| 十二口型 | `PHONEME_C_FV_003` | 口型 03（c_FV_ctrl003） | `c_FV_ctrl003` | 是 | 待填 |
| 十二口型 | `PHONEME_A` | 口型 04（A_ctrl） | `A_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_EE` | 口型 05（EE_ctrl） | `EE_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_FV` | 口型 06（FV_ctrl） | `FV_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_GNK` | 口型 07（GNK_ctrl） | `GNK_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_MBP` | 口型 08（MBP_ctrl） | `MBP_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_SH` | 口型 09（SH_ctrl） | `SH_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_W` | 口型 10（W_ctrl） | `W_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_OTHER` | 口型 11（Other_ctrl） | `Other_ctrl` | 是 | 待填 |
| 十二口型 | `PHONEME_A_A_02` | 口型 12（a_A_ctrl02） | `a_A_ctrl02` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_QI_R` | 右眼_气 | `R_mouthUpCircleCtrl01` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_NU_R` | 右眼_怒 | `R_mouthUpCircleCtrl008` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_YOU_R` | 右眼_忧 | `R_mouthUpCircleCtrl03` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_HAPPY_R` | 右眼_笑 | `R_mouthUpCircleCtrl00` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_QI_L` | 左眼_气 | `L_mouthUpCircleCtrl00` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_NU_L` | 左眼_怒 | `L_mouthUpCircleCtrl008` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_YOU_L` | 左眼_忧 | `L_mouthUpCircleCtrl02` | 是 | 待填 |
| 左右眼神：气、怒、忧、笑 | `EYE_EXPR_HAPPY_L` | 左眼_笑 | `L_mouthUpCircleCtrl04` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_L` | 左眉整体 | `Animcraft_Left_Brow_Z_Ctrl` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_R` | 右眉整体 | `Animcraft_Right_Brow_Z_Ctrl` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_L_IN` | 左眉内点 | `zCircle049` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_L_MID` | 左眉中点 | `zCircle050` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_L_OUT` | 左眉外点 | `zCircle048` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_R_IN` | 右眉内点 | `zCircle051` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_R_MID` | 右眉中点 | `zCircle052` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_R_OUT` | 右眉外点 | `zCircle053` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_L_BEND` | 左眉弯曲 | `Animcraft_Left_Brow_Ctrl` | 是 | 待填 |
| 已有眉毛基础控制（补充） | `BROW_R_BEND` | 右眉弯曲 | `Animcraft_Right_Brow_Ctrl` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_CORNER_IN` | 右内眼角 | `zCircle083` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_UP_IN` | 右眼上内 | `zCircle074` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_UP_MID` | 右眼上中 | `zCircle075` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_UP_OUT` | 右眼上外 | `zCircle076` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_CORNER_OUT` | 右外眼角 | `zCircle082` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_DOWN_OUT` | 右眼下外 | `zCircle077` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_DOWN_MID` | 右眼下中 | `zCircle078` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_R_DOWN_IN` | 右眼下内 | `zCircle079` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_CORNER_IN` | 左内眼角 | `zCircle084` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_UP_IN` | 左眼上内 | `zCircle068` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_UP_MID` | 左眼上中 | `zCircle069` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_UP_OUT` | 左眼上外 | `zCircle070` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_CORNER_OUT` | 左外眼角 | `zCircle085` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_DOWN_OUT` | 左眼下外 | `zCircle071` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_DOWN_MID` | 左眼下中 | `zCircle072` | 是 | 待填 |
| 已有眼周点控（补充） | `EYE_L_DOWN_IN` | 左眼下内 | `zCircle073` | 是 | 待填 |

## 交给 Codex 的请求示例

按这张表和 `Tools/FaceMigration/Docs/Workflow/Build.md`，以指定的 UE Rig 为示例，结合 Max 完成目标面部控制适配。保留示例的形状、配色、轨道、参考图和操作方式，核对动作及差异；示例资产保持不变。恢复源/预览输入，分别记录外观操作、数值、正常帧和保存重载结果。最终画面由我检查，不使用 computer-use。

填写后不必再逐个发控制器名字；若资产路径或源场景尚未给出，先补齐角色与资产区。
