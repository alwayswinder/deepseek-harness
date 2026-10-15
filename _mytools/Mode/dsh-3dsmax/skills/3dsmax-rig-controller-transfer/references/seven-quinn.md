# Seven → Quinn 身体控制器迁移案例

## 产物与范围

- 原型场景：`E:/AI/3dMax/Save/Quinn_SevenNative_Body_Prototype_20261015.max`
- 操作与验证：`E:/AI/3dMax/Save/Quinn_SevenNative_Body_Prototype_README.md`
- 左臂起点：`E:/AI/3dMax/Save/Quinn_SevenNative_LeftArm_Prototype_20261015.max`

场景保留整个 Seven Rig 作为隐藏驱动层，Quinn 网格和身体控制器可见。头部、表情未迁移。原型共 996 个节点，静止姿势保存后重新打开并复测。

## 控制器与链

| 部位 | IK 链 / 关节 | 主控制器 | 极向点与随动形状 |
| --- | --- | --- | --- |
| 左臂 | `IK Chain006` / `Point031–033` | `Circle018` 肩、`Circle019` 手 | `Point158` 极向；`Circle020` 肘环、`Circle023/024` 辅助 |
| 右臂 | `IK Chain005` / `Point044–046` | `Circle015` 肩、`Circle016` 手 | `Point159` 极向；`Circle017` 肘环、`Circle021/022` 辅助 |
| 左腿 | `IK Chain007` / `Point025–027` | `Circle011` 髋、`Circle012` 脚、`Circle110` 脚掌 | `Point038` 极向；`Circle014` 膝环 |
| 右腿 | `IK Chain001` / `Point022–024` | `Circle009` 髋、`Circle010` 脚、`Circle109` 脚掌 | `Point039` 极向；`Circle013` 膝环 |

右腿链用 `IKHISolver`，其余三条为 `IKLimb`。段长保存在各中间/末端 `Point` 的 `IKControl` FK 子控制器中；伸缩参数线在该场景的嵌套位置为 `transform.controller[4].controller[1].controller[2].controller[1].controller[1].controller`。先检查实际轨道和表达式，再改阈值。标定极向点后，用肩/手或髋/脚中点的 Root 空间偏移驱动一个跟随父点，极向点本身仍可编辑。

骨盆/脊柱控制器为 `Circle005`、`Circle008`、`Circle002`、`Circle007`。Quinn 脊柱映射：`Q_spine_01 ← spine_01`；`Q_spine_02 ← 50% spine_01 + 50% spine_02`；`Q_spine_03 ← spine_02`；`Q_spine_04 ← 50% spine_02 + 50% spine_03`；`Q_spine_05 ← spine_03`。这些权重是本原型的起点，并非通用比例。

双手 30 节指骨对应 Seven 同名指骨：左手 `Circle090–104`、右手 `Circle075–089`。Quinn 多出的掌骨保留原生手部层级。双脚 `ball` 骨由 Seven 脚掌骨驱动。`Q_ik_hand_gun`、左右手和左右脚 IK 标记骨由相应 Quinn 末端骨带动。

## 场景显示与复测结果

`控制器` 是 `不导出` 的子图层；父图层必须可见。内部 `辅助` 在 `NUB` 下，两者可隐藏，控制器形状仍显示。Quinn 网格与 `Quinn_Global_CTRL` 在 `0` 层；Seven 网格、`FBX`、`bip`、面部层隐藏。

右臂静止关节误差约 0.0083 场景单位，左腿约 0.0046，右腿约 0.00023。手目标、脚目标、躯干、手指、脚掌及整体控制圈的平移或旋转均做过可恢复测试；保存并重新打开后代表性控制器仍可驱动目标。着色视口检查过右手上移并旋转 60°、左脚抬高 12 单位。完整动画范围及极端扭转蒙皮仍未验证。

## 实现脚本

`E:/AI/3dMax/Tmp/seven_native_rightarm_extend.ms`、`seven_native_legs_extend.ms`、`seven_native_torso_extend.ms`、`seven_native_fingers_extend.ms`、`seven_native_ikmarkers_extend.ms` 记录了本场景的构建顺序。它们会创建具名驱动辅助点和更改约束，**不是幂等脚本**；不能对成品场景或其他场景直接再次运行。
