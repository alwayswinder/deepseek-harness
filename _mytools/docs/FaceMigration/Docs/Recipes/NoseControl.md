# 鼻子控制（2026-11-06）

已将 `Animcraft_Nose_Ctrl` 接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，新增 **`CTRL_NOSE`（鼻子）**。本批次完成时为 **149 骨、39 控制、657 节点**；本页报告保留鼻子批次快照，当前统计见[Seven 角色记录](../../Characters/Seven/README.md)。2026-11-09 已在此手柄下方添加[左右鼻侧小控制](NoseSideControls.md)，合成鼻尖旋转，原整体三轴平移保持。数值、旧控回归和保存重载通过；画面由用户检查，尚未记录本组效果验收。

## 操作与源轴映射

手柄为浅绿色 `Box_Thick`，位于 Max 鼻子控制的对应位置，父级为 `Root`。采用与当前参考姿势世界轴一致的方向，蓝色 Z 为上下方向。可拖动手柄或修改 Current Value，0 回到中性。

| UE 输入 | 范围 | Max 第 2 层输入 | 效果 |
|---|---|---|---|
| X（红） | −10～10 | `−Max Z × 10` | 左右移动鼻尖 |
| Y（绿） | 0～10 | `Max X × 10` | 鼻尖向前伸，0 回原位 |
| Z（蓝） | −10～10 | `Max Y × 10` | 鼻尖上下移动 |

这里的公式表示 UE 值与 Max 值的对应关系：`UE = (-Max.Z, Max.X, Max.Y) * 10`。骨骼实际位移为 `UE value * 0.1`，因此控制值 10 对应鼻尖移动约 1 cm。Y 单侧范围来自 Max 的 X 限位 `[0,1]`；源 Y/Z 为 `[-1,1]`。

Max 手柄本身带约 1° 的轴向倾斜及约 0.314 的形状缩放，而最终鼻尖骨的位移轴与世界轴基本一致。UE 用世界轴操作，并把形状缩放放到 shape transform，避免把源手柄缩放误当成骨骼增益。

## 驱动与验证

源链为 `Animcraft_Nose_Ctrl.position_list[2] → KPoint028.Position_Wire → zCircle028 → Link_Constraint → bijian`。KPoint 的父级依次为 Sphere028、ZPoint028、bizi。本组三轴位置输入只驱动 **鼻尖骨 `bijian`**，不驱动整个 `bizi` 骨。Wire 记录见 [max_wires.txt](../../Characters/Seven/Evidence/Nose/max_wires.txt)。

UE 新增 7 个 `NOSE_` 节点：GetControlVector、VectorClamp、VectorScale、GetInitialTransform、VectorAdd、MakeTransform 和 SetTransform。位置为鼻尖初始全局位置加平移量，保持旋转和有符号缩放，关闭子级传播。SetTransform 追加到原执行链末尾。

- Max 扫描全部 **149 骨**的位置、朝向、缩放，只有 `bijian` 位置改变；其余 148 骨位置不变，全体骨骼均无旋转/缩放增量。检查 98 个有效 Morpher 通道，均未随鼻子输入变化。
- 三轴各 9 档，加 8 组角点和 6 组混合/回零/小输入，共 **41 组**。线性映射最大拟合残差约 `0.00000703 cm`。
- UE 完整变换对照最大位置误差 **0.0002615 cm（0.002615 mm）**，最大朝向误差 **0.000224°**，最大缩放误差小于 `8.83e-7`；包含已有导出参考姿势残差。
- 原有 38 个控制 **123 组**回归，全部 149 骨的位置和缩放不变；再搭配两组鼻子输入，共 **246 组**混合检查通过。最大混合位置误差小于 `1.82e-8 cm`。
- XYZ 越界夹紧、手柄三轴方向、连续重复求解、回零通过，非目标骨不受影响。
- 原执行连接保留，Begin 加 47 个 SetTransform 全链可达。编译 `BS_UP_TO_DATE`；保存后关闭资产编辑器、重新加载包并再次验证通过。旧预览输入已恢复，并选中 `CTRL_NOSE`。

本次迁移当前活动位置层，不添加源控制的任意旋转/缩放操作。头部动画空间适配仍沿用诊断 Rig 的已知边界，画面效果由用户后续检查。早期眉眼基线 Rig `CR_Seven_MorphSliders` 未在本次修改。

## 脚本与证据

数据见 [Nose 证据](../../Characters/Seven/Evidence/Nose/README.md)。采样临时归零鼻子、嘴唇和脸颊，再恢复其原始输入。鼻子 X 的 Float Limit 下层存在负值，但有效值被夹为 0；脚本保存并恢复的是限位下面的原始 Bezier 值，避免把用户的原始输入改成 0。正常和异常路径均恢复，不保存 Max 场景。

重新采样和拟合（不会自动更新现有 UE 图）：

```powershell
python Tools/FaceMigration/Scripts/fit_cheek_controls.py --prepare
pwsh -NoProfile -File Tools/FaceMigration/Scripts/max_run.ps1 -ScriptFile Tools/FaceMigration/Scripts/probe_nose_samples.ms | Out-File -LiteralPath Saved/Codex/nose_probe_output.txt -Encoding utf8
python Tools/FaceMigration/Scripts/fit_nose_controls.py
```

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/build_nose_controls.py` | 首次增量添加，备份、旧姿势采集、建图、验证和保存；已有 `NOSE_` 节点时拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_nose_controls.py` | 用独立临时实例复核全部数值，写报告，不改变预览输入 |
| `Tools/FaceMigration/Scripts/reload_nose_target.py` | 验证、保存、包重载、再次复核，恢复预览并选中鼻子 |

只复核现有资产：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_nose_controls.py`。

本机修改前备份目录记录在 [build_report.json](../../Characters/Seven/Evidence/Nose/build_report.json)，包含原磁盘包和保存当时内存状态后的包。`Saved/` 被 Git 忽略，采样、参数及报告已另存到 Tools/FaceMigration/Docs/Evidence。
