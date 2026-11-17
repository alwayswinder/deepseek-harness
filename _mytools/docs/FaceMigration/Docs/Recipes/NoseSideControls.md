# 左右鼻侧小控制（2026-11-09）

已将 `Animcraft_Right_Nose_Ctrl`、`Animcraft_Left_Nose_Ctrl` 接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，新增 `CTRL_NOSE_SIDE_R/L`。本组完成时为 **149 骨、72 个动画控制 + 1 个参考图 Visual Cue、1926 节点、28 条 Morph 曲线**；最新记录统一见 [Seven 角色记录](../../Characters/Seven/README.md)。源姿态、旧控制与组合、限位和保存重载已验证，画面由用户检查。

## 操作与摆放

两个直径约 0.8 cm 的球形小手柄放在鼻子整体 `CTRL_NOSE` 下方 1.8 cm，左右距其中线各 1.25 cm，Y 同为 11.400017 cm；参考 Z=156.814014 cm。右鼻侧为青色、X≈−1.25；左鼻侧为绿色、X≈+1.25。手柄以 Root 为父级，参考朝向与 Rig 全局轴一致。

仅拖动 **蓝色 Z 轴**，范围 −10～10，X/Y 锁 0，Initial 为 0。UE Z 对应 Max 第 3 层局部 Y × 10。两个控制对鼻尖产生相反方向的扭转，单控完整行程约 11.459°；等量同向输入会抵消，反向输入会叠加，0 回到中性。与鼻子整体三轴平移可叠加。

## 源驱动与 UE 实现

Max 场景 `D:/Download/Seven_Skin_New.max`，0 帧。两项当前活动 Position List 是 **第 3 层**，其中三轴 Float Limit 均为 −1～1；只有 Y 接到下游 Wire。第 2 层保留零位置，未用于本次动作输入。

`KPoint028.rotation_list[2].X` 连接右侧第 3 层 Y，表达式为 `Y * -0.2`；`rotation_list[3].X` 连接左侧 Y，表达式为 `Y * 0.2`。两者最终通过 `zCircle028` 和 Link Constraint 改变鼻尖骨 `bijian` 的旋转。采样覆盖全部 149 骨和 98 个有效 Morpher 通道，只有 `bijian` 的旋转有明显变化；其位置在源求值中有约 `2.21e-5 cm` 的微小残差，Morph 通道保持。

在当前 Rig 全局空间中，旋转增量等效于绕 +Y 轴：

```text
AngleRadians = 0.02 * (CTRL_NOSE_SIDE_R.Z - CTRL_NOSE_SIDE_L.Z)
Rotation = Quaternion(Axis=(0,1,0), AngleRadians) * 已有鼻尖旋转
```

该公式由转换后的完整四元数拟合并对照全部源样本确认。Max Rotation Wire 的表达式符号不能直接作为 UE 全局旋转的符号。

新增八个 `NOSESIDE_` 纯计算节点：两次 GetControlVector、两次 Clamp、差值、弧度增益、轴角四元数、旋转乘法。仅替换 `NOSE_MAKE_bijian.Rotation` 的输入，保留其原始旋转作为合成基础；鼻尖 Translation / Scale、原 SetTransform 与完整执行链保持。未新增曲线或重复骨骼写入。

## 验证

- Max **103 组**：两侧三轴各九档，共 54 组；25 组左右 Y 组合；鼻子整体与两侧的 24 组组合。采样临时设置三项底层 XYZ，正常及异常路径均恢复并读回原始值，不保存 Max 场景。
- 源公式拟合最大位置残差约 `0.0000221 cm`，朝向约 `0.0000342°`，非目标骨保持，98 个 Morph 通道保持。
- UE 103 组源绝对姿态：鼻尖最大位置误差约 `0.0002633 cm`，朝向约 `0.0002393°`，缩放约 `9.96e-7`，包含已有导出参考姿势残差。
- 添加前 71 个层级控制元素（70 个动画控制 + 1 个参考图 Visual Cue）的旧姿势快照共 **124 组**，覆盖已有骨骼控制、四整体表情、十二口型、八眼神及当时预览输入；新控制为 0 时原输出保持。每组再配两组鼻侧输入，共 **248 组**组合，全骨骼及原 28 条曲线符合预期。
- 初始值、上下限及无效 X/Y、手柄方向与起点、重复求解、回零、等量抵消均通过。组合位置保持，最大旋转数值差约 `4.83e-6°`。
- 保存、关闭编辑器、包重载后再次复核；恢复用户原预览输入并选中右鼻侧。当前仍使用诊断 Rig 的固定参考空间，视觉效果由用户检查。

## 脚本及证据

证据见 [NoseSides](../../Characters/Seven/Evidence/NoseSides/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_nose_side_samples.ms` | Max 103 组采样及原始输入恢复 |
| `Tools/FaceMigration/Scripts/fit_nose_side_controls.py` | 全姿态拟合、非目标骨及 Morph 检查，生成参数 |
| `Tools/FaceMigration/Scripts/build_nose_side_controls.py` | 双份备份、旧控快照、新手柄与八节点、旋转合成 |
| `Tools/FaceMigration/Scripts/verify_nose_side_controls.py` | 源、旧控和组合、限位、初始、重复、抵消及回零 |
| `Tools/FaceMigration/Scripts/reload_nose_side_controls.py` | 保存重载、复验、恢复用户输入 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_nose_side_controls.py`。
