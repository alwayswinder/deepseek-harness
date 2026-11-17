# 3ds Max 面部控制器名称表

整理日期：2026-11-09。以本次 Seven 迁移中实际使用的名称为参考。

**主清单 46 项**包含你在本段会话指定的控制及成对补全项；**补充清单 26 项**来自已有眉毛、眼周基础实现，单独列出，不将其描述为你本段会话逐项提供的名字。合计 **72 个动画控制**，对应 [当前交付 Rig 及旧版参考](../../Characters/Seven/README.md)；参考图 Visual Cue 不计入 Max 控制器。

后续换角色时，填写[新角色名称表](../Templates/CharacterFaceControllers.md)，或填写[JSON 模板](../Templates/CharacterFaceControllers.json)，交给我并按[搭建流程](../Workflow/Build.md)执行。已有 [Seven 完整映射](../../Characters/Seven/face-controls.json)可作范例。

表中 Max 名称保留大小写和编号。角色的骨骼、Morph、控制层、轴向、范围、增益和枢轴从新场景重新核对。下列操作范围和配方数值均为 **Seven 参考值**。

## 主清单：46 个

### 上眼皮（2 个）

蓝轴 Z −10～0；枢轴闭合及附加旋转；已有近似残差，见诊断。 [实现文档](../Troubleshooting/UpperEyelid.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 右上眼皮 | `SYP_R001` | `CTRL_EYE_LID_R` |
| 左上眼皮 | `SYP_L001` | `CTRL_EYE_LID_L` |

### 下眼皮（2 个）

蓝轴 Z 0～10；保留虚拟枢轴运动和眼皮组合。 [实现文档](../Recipes/XYP_LowerLids.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 右下眼皮 | `XYP_R001` | `CTRL_EYE_LOWER_LID_R` |
| 左下眼皮 | `XYP_L001` | `CTRL_EYE_LOWER_LID_L` |

### 六个嘴唇控制（6 个）

上唇 Z 0～10，下唇 Z −10～0；保留中央 / 侧唇联动。 [实现文档](../Recipes/LipControls.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 左上唇 | `Animcraft_Left_up_Lip_Ctrl` | `CTRL_LIP_UP_L` |
| 中央上唇 | `Animcraft_up_Lip_Ctrl` | `CTRL_LIP_UP_C` |
| 右上唇 | `Animcraft_Right_up_Lip_Ctrl` | `CTRL_LIP_UP_R` |
| 右下唇 | `Animcraft_Right_low_Lip_Ctrl` | `CTRL_LIP_LOW_R` |
| 中央下唇 | `Animcraft_dn_Lip_Ctrl` | `CTRL_LIP_LOW_C` |
| 左下唇 | `Animcraft_Left_low_Lip_Ctrl` | `CTRL_LIP_LOW_L` |

### 左右脸颊（2 个）

局部 X/Z ±10；蓝轴已反向，读取 Z 时补偿负号；正负分段采样。 [实现文档](../Recipes/CheekControls.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 右脸颊 | `Animcraft_Right_Cheek_Ctrl` | `CTRL_CHEEK_R` |
| 左脸颊 | `Animcraft_Left_Cheek_Ctrl` | `CTRL_CHEEK_L` |

### 鼻子整体（1 个）

X/Z ±10、Y 0～10；鼻尖三轴平移。 [实现文档](../Recipes/NoseControl.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 鼻子整体 | `Animcraft_Nose_Ctrl` | `CTRL_NOSE` |

### 左右鼻侧小控制（2 个）

蓝轴 Z ±10；第 3 层 Y 输入，两侧相反方向合成鼻尖旋转；放整体控制下方。 [实现文档](../Recipes/NoseSideControls.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 右鼻侧 | `Animcraft_Right_Nose_Ctrl` | `CTRL_NOSE_SIDE_R` |
| 左鼻侧 | `Animcraft_Left_Nose_Ctrl` | `CTRL_NOSE_SIDE_L` |

### 嘴角及嘴部整体（3 个）

嘴角用 X/Z，绿色 Y 无形变；总嘴控三轴；正负行程分别拟合。 [实现文档](../Recipes/MouthControls.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 左嘴角 | `Animcraft_Left_Mouth_Ctrl` | `CTRL_MOUTH_L` |
| 右嘴角 | `Animcraft_Right_Mouth_Ctrl` | `CTRL_MOUTH_R` |
| 嘴部整体 | `Animcraft_Mouth_Ctrl` | `CTRL_MOUTH` |

### 左右眼球（2 个）

眼前目标框，位置驱动眼球朝向及眼皮 / 眼袋联动；保留初始位置。 [实现文档](../Recipes/EyeballControls.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 左眼球 | `YanJing_L001` | `CTRL_EYEBALL_L` |
| 右眼球 | `YanJing_R001` | `CTRL_EYEBALL_R` |

### 双眼总控（1 个）

同时移动两个目标并保留单眼独立输入及源眼周联动。 [实现文档](../Recipes/GazeMasterControl.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 双眼总控 | `YanJing_Zong001` | `CTRL_EYEBALL_MASTER` |

### 下巴整体（1 个）

行程缩为初版 1/3：X ±3.333、Y 0～16.667、Z −20～0；保持完整动作幅度。 [实现文档](../Recipes/ChinControl.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 下巴整体 | `Line010` | `CTRL_CHIN` |

### 四个整体表情（4 个）

玩家视角右侧；四行；水平从左向右 0～8；可能同时驱动头部及瞳孔 Morph。 [实现文档](../Recipes/ExpressionSliders.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 慌张 | `Circle117` | `CTRL_EXPR_HUANGZHANG` |
| 无语 | `Circle118` | `CTRL_EXPR_WUYU` |
| 思考 | `Circle119` | `CTRL_EXPR_SIKAO` |
| 尴尬 | `Circle120` | `CTRL_EXPR_GANGA` |

### 十二口型（12 个）

玩家视角右侧、整体表情旁；按本表顺序上下排列；从左向右 0～8。 [实现文档](../Recipes/PhonemeSliders.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 口型 01（a_FV_ctrl01） | `a_FV_ctrl01` | `CTRL_PHONEME_A_FV_01` |
| 口型 02（b_FV_ctrl002） | `b_FV_ctrl002` | `CTRL_PHONEME_B_FV_002` |
| 口型 03（c_FV_ctrl003） | `c_FV_ctrl003` | `CTRL_PHONEME_C_FV_003` |
| 口型 04（A_ctrl） | `A_ctrl` | `CTRL_PHONEME_A` |
| 口型 05（EE_ctrl） | `EE_ctrl` | `CTRL_PHONEME_EE` |
| 口型 06（FV_ctrl） | `FV_ctrl` | `CTRL_PHONEME_FV` |
| 口型 07（GNK_ctrl） | `GNK_ctrl` | `CTRL_PHONEME_GNK` |
| 口型 08（MBP_ctrl） | `MBP_ctrl` | `CTRL_PHONEME_MBP` |
| 口型 09（SH_ctrl） | `SH_ctrl` | `CTRL_PHONEME_SH` |
| 口型 10（W_ctrl） | `W_ctrl` | `CTRL_PHONEME_W` |
| 口型 11（Other_ctrl） | `Other_ctrl` | `CTRL_PHONEME_OTHER` |
| 口型 12（a_A_ctrl02） | `a_A_ctrl02` | `CTRL_PHONEME_A_A_02` |

### 左右眼神：气、怒、忧、笑（8 个）

玩家视角画面左侧、靠近角色；右眼蓝色、左眼绿色两列；水平 0～8。 [实现文档](../Recipes/EyeExpressionSliders.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 右眼_气 | `R_mouthUpCircleCtrl01` | `CTRL_EYE_EXPR_QI_R` |
| 右眼_怒 | `R_mouthUpCircleCtrl008` | `CTRL_EYE_EXPR_NU_R` |
| 右眼_忧 | `R_mouthUpCircleCtrl03` | `CTRL_EYE_EXPR_YOU_R` |
| 右眼_笑 | `R_mouthUpCircleCtrl00` | `CTRL_EYE_EXPR_HAPPY_R` |
| 左眼_气 | `L_mouthUpCircleCtrl00` | `CTRL_EYE_EXPR_QI_L` |
| 左眼_怒 | `L_mouthUpCircleCtrl008` | `CTRL_EYE_EXPR_NU_L` |
| 左眼_忧 | `L_mouthUpCircleCtrl02` | `CTRL_EYE_EXPR_YOU_L` |
| 左眼_笑 | `L_mouthUpCircleCtrl04` | `CTRL_EYE_EXPR_HAPPY_L` |

## 补充清单：已有 26 个基础控制

这部分用于需要完整复制当前 72 控制配置的新角色；缺少的角色功能可以在模板中明确停用。历史验证范围见对应配方，名称存在不等于功能已完整验收。

### 已有眉毛基础控制（补充）（10 个）

整体 X/Z、三点平移、弯曲 Z；按现有配方重新对照完整姿态。 [实现文档](../Recipes/SevenBrowsAndEyes.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 左眉整体 | `Animcraft_Left_Brow_Z_Ctrl` | `CTRL_BROW_L` |
| 右眉整体 | `Animcraft_Right_Brow_Z_Ctrl` | `CTRL_BROW_R` |
| 左眉内点 | `zCircle049` | `CTRL_BROW_L_IN` |
| 左眉中点 | `zCircle050` | `CTRL_BROW_L_MID` |
| 左眉外点 | `zCircle048` | `CTRL_BROW_L_OUT` |
| 右眉内点 | `zCircle051` | `CTRL_BROW_R_IN` |
| 右眉中点 | `zCircle052` | `CTRL_BROW_R_MID` |
| 右眉外点 | `zCircle053` | `CTRL_BROW_R_OUT` |
| 左眉弯曲 | `Animcraft_Left_Brow_Ctrl` | `CTRL_BROW_L_BEND` |
| 右眉弯曲 | `Animcraft_Right_Brow_Ctrl` | `CTRL_BROW_R_BEND` |

### 已有眼周点控（补充）（16 个）

每侧八点；与眼皮、眼球目标及眉毛等控制保留叠加。 [实现文档](../Recipes/SevenBrowsAndEyes.md)

| 功能 | 3ds Max 控制器精确名称 | UE 控制 / 固定功能编号 |
|---|---|---|
| 右内眼角 | `zCircle083` | `CTRL_EYE_R_CORNER_IN` |
| 右眼上内 | `zCircle074` | `CTRL_EYE_R_UP_IN` |
| 右眼上中 | `zCircle075` | `CTRL_EYE_R_UP_MID` |
| 右眼上外 | `zCircle076` | `CTRL_EYE_R_UP_OUT` |
| 右外眼角 | `zCircle082` | `CTRL_EYE_R_CORNER_OUT` |
| 右眼下外 | `zCircle077` | `CTRL_EYE_R_DOWN_OUT` |
| 右眼下中 | `zCircle078` | `CTRL_EYE_R_DOWN_MID` |
| 右眼下内 | `zCircle079` | `CTRL_EYE_R_DOWN_IN` |
| 左内眼角 | `zCircle084` | `CTRL_EYE_L_CORNER_IN` |
| 左眼上内 | `zCircle068` | `CTRL_EYE_L_UP_IN` |
| 左眼上中 | `zCircle069` | `CTRL_EYE_L_UP_MID` |
| 左眼上外 | `zCircle070` | `CTRL_EYE_L_UP_OUT` |
| 左外眼角 | `zCircle085` | `CTRL_EYE_L_CORNER_OUT` |
| 左眼下外 | `zCircle071` | `CTRL_EYE_L_DOWN_OUT` |
| 左眼下中 | `zCircle072` | `CTRL_EYE_L_DOWN_MID` |
| 左眼下内 | `zCircle073` | `CTRL_EYE_L_DOWN_IN` |

## 已确认的名称特殊项

- 原六唇清单中重复的 `Animcraft_up_Lip_Ctrl`，第二项已按你确认改为 `Animcraft_Right_up_Lip_Ctrl`，六项保留独立记录。
- `a_FV_ctrl01`、`b_FV_ctrl002`、`c_FV_ctrl003`、`a_A_ctrl02` 的前缀和数字位数保持原样；两个 FV 名称对应不同功能。
- 右眼气 / 怒 / 忧 / 笑分别是 `R_mouthUpCircleCtrl01/008/03/00`，左眼分别是 `L_mouthUpCircleCtrl00/008/02/04`。按实际映射配对，不能直接替换 R/L 或编号。
- Seven 的右眼神 Max 控制连到 `_l_es` Morph，左侧连到 `_r_es`；新角色要重新读取连线。
- 左右鼻侧使用 Position List **第 3 层** Y，鼻子整体使用第 2 层。名称表不能代替活动层和 Wire 检查。
- `YanJing_Zong001` 是双眼总控；`Line010` 是下巴整体；`Circle117`～`120` 是独立整体表情。
- `KPoint`、`ZPoint`、Sphere / Dummy、Link Constraint 等辅助链不作为本表的用户手柄行；迁移时仍需沿驱动链探测枢轴和约束。

## 名称核对范围

[名称核对证据](../../Characters/Seven/Evidence/ControllerCatalog/README.md)仅检查名称及 UE 控制覆盖。效果和数值验证仍以各功能文档为准，保留上眼皮近似残差、历史眉毛 / 眼周验证范围和固定参考空间等边界。
