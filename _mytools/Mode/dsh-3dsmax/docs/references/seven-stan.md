> ⚠ **历史留档（2026-10-15 原技能内容，2026-10-16 迁入本包）**：本文是个案记录 / 当时的配方，其中算法与结论可能已被 2026-10-16 的复现修正覆盖。
> **现行做法以 [../quick-runbook.md](../quick-runbook.md) 与两份指南为准**；本文只用于追溯"当时为什么这么定"。
> 来源：`E:\AI\3dMax\3dsmax-mcp-master\.agents\skills\3dsmax-rig-controller-transfer\references\`（原技能的 `scripts/04`、`05` 描述的是已作废的 `S7_*` 驱动点架构，**未迁入**）。
# Seven → Stan：肘膝控制与 IK 故障复盘

## 场景与范围

- 最终身体场景：`E:/AI/3dMax/Save/Stan01_SevenBodyRig_20261015.max`
- 场景说明：`E:/AI/3dMax/Save/Stan01_SevenBodyRig_20261015_README.md`
- 修复前备份：`E:/AI/3dMax/Save/Stan01_SevenBodyRig_beforeIKFix_20261015.max`
- 只迁身体，未迁头颈与面部。四肢主骨骼使用适配控制链；末端控制器上旧的“IK/FK”属性目前**不会**切换它们。

本案例的节点名和表达式是排错线索，不是其他角色的通用配置，也不能套到 [Quinn 原型](seven-quinn.md) 上。

| 肢体 | 起点环 | 肘/膝环 | 末端环 | 目标关节 |
| --- | --- | --- | --- | --- |
| 左臂 | `Circle018` | `Circle020` | `Circle019` | `lowerarm_l` |
| 右臂 | `Circle015` | `Circle017` | `Circle016` | `lowerarm_r` |
| 左腿 | `Circle011` | `Circle014` | `Circle012` | `calf_l` |
| 右腿 | `Circle009` | `Circle013` | `Circle010` | `calf_r` |

## 实际故障及修正依据

1. **肘膝环只动了 pole。** 初版圆环改变 IK 极向点或辅助点，却未直接控制下臂/小腿关节位置。静止画面接近，但单独移动圆环时关节不随环走。此 Stan 适配链改为关节位置受对应圆环控制；手脚目标移动时，圆环上级隐藏的 `RCTS_*_Follow` 跟随辅助链 `RCTIK_*_Mid`，圆环保留可手调局部偏移。
2. **循环依赖。** pole 是肘膝环子节点时，再让环跟随 IK 中点会形成“环 → pole → IK 解 → 环”。四个 pole 改挂 `BIPRoot` 并保留世界变换，使其独立可编辑。改父级后检查 pole 世界位置，以及手动移动环时 pole 是否保持不动。
3. **旋转数值看似正确，蒙皮却坏掉。** 曾把 `angleaxis` 值直接当 quat 相乘，且采用错误的转向。左臂实测所需关系是 `restRotation * inverse(turn)`，其中 `turn` 从静止段向量与当前段向量求得并显式转成 quat；`restRotation * turn` 会反向扭曲袖子。这个式子仅是该场景的验证结果，不能省略其他肢体的形态检查。`E:/AI/3dMax/Tmp/convert_stan_joint_aim_to_quat.ms` 是错误脚本，只能用于事故分析，不能直接运行。
4. **末端移动时 IK 失真。** 让肘环只跟随肩与手目标的中点，或让膝环保持固定，不能复现 IK 中间关节随末端目标运动。修正后 follow 使用相应 `RCTIK_*_Mid`；骨骼关节的位置约束仍指向圆环，而非直接指向 pole 或辅助 IK 中点。
5. **右脚旧偏移。** 改线前备份中，`RCTIK_leg_r_Chain` 的 goal 相对 `Circle010` 已有约 7.125 场景单位的 Z 偏移。先核对 goal 与脚环的世界位置，修正目标后，右脚在可达范围内的小腿长度才恢复正常。不要把既存偏移归因于新的 follow 修改。
6. **越界时不伸展。** 辅助 IK 链默认到最大长度就停住，而 Seven 实测会把超过 `L1 + L2` 的距离平均分给上下段。此场景的 follow 在越界时取 `start + normalize(goal-start) * (L1 + (distance(start,goal)-L1-L2)/2)`；可达时取辅助 IK 中点，并保留原有局部 offset。右手越界和左脚下降做过对照；换身材或 IK 设置时须重新量长度及源场景伸展行为。

## 复测门槛与脚本线索

逐一移动四个末端环至可达区和越界区、逐一移动四个肘膝环、逐一移动 pole。检查关节与环的位置、两段长度、弯曲方向、手脚连接与着色蒙皮；恢复姿势，保存并重开复测。只检查静止位置、单条肢体或隐藏状态，不足以判定 IK 正常。

试验脚本：`E:/AI/3dMax/Tmp/try_left_arm_seven_behavior.ms`（旋转方向）、`try_stan_left_ik_follow.ms`（左臂）、`finish_stan_ik_follow_test.ms`（其余三肢）、`stan_ik_stretch_like_seven_test.ms`（越界伸展）。它们依赖特定节点与前置状态，不保证幂等；先检查目标场景，勿直接重放。
