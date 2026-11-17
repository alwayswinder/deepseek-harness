# 六个嘴唇控制（2026-11-06）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，完成该批次时为 **149 骨、36 控制、506 节点**。本页采样、计数和报告为该部位完成时的批次快照；当前完整资产见 [Seven 角色记录](../../Characters/Seven/README.md)。新增六个控制，保留原有眉眼控制。数值验证、保存和包重载通过；画面效果由用户检查，尚未记录本组效果验收。

## 操作与映射

手柄为橙色 `Box_Thick`，放在对应的唇部控制位置，父级为 `Root`。在层级中按下表控制名选择，拖动 Z，或修改 Current Value 的 Z；X/Y 锁为 0。0 为中性。

| 显示名 | UE 控制 | Max 来源 | UE Z 范围 |
|---|---|---|---|
| 左上唇 | `CTRL_LIP_UP_L` | `Animcraft_Left_up_Lip_Ctrl` | 0–10，向上 |
| 中央上唇 | `CTRL_LIP_UP_C` | `Animcraft_up_Lip_Ctrl` | 0–10，向上 |
| 右上唇 | `CTRL_LIP_UP_R` | `Animcraft_Right_up_Lip_Ctrl` | 0–10，向上 |
| 右下唇 | `CTRL_LIP_LOW_R` | `Animcraft_Right_low_Lip_Ctrl` | −10–0，向下 |
| 中央下唇 | `CTRL_LIP_LOW_C` | `Animcraft_dn_Lip_Ctrl` | −10–0，向下 |
| 左下唇 | `CTRL_LIP_LOW_L` | `Animcraft_Left_low_Lip_Ctrl` | −10–0，向下 |

Max 输入为 `position_list[2].Y`，上唇范围 `[0,1]`，下唇 `[-1,0]`。对应关系是 **Max Y = UE Z / 10**。归一化幅度 `s` 上唇取 `UE Z/10`，下唇取 `-UE Z/10`。10 是 UE 控制行程，不是骨骼移动 10 cm。

## 联动与实现

| Max 控制 | 受影响骨骼 |
|---|---|
| Left_up | `Bone017`、`Bone019`、`shangzuichun`、`renzhong_L` |
| up | `Bone017`、`Bone019`、`Bone020`、`Bone023`、`shangzuichun`、`renzhong_L/R` |
| Right_up | `Bone020`、`Bone023`、`shangzuichun`、`renzhong_R` |
| Right_low | `Bone021`、`Bone022`、`xiazuichun` |
| dn | `Bone016`、`Bone018`、`Bone021`、`Bone022`、`xiazuichun` |
| Left_low | `Bone016`、`Bone018`、`xiazuichun` |

源驱动链为 `唇控 → KPoint 位置表达式 → zCircle → Link_Constraint → 导出骨`。本组六控贡献为线性平移，保留中央唇控影响两侧、侧唇控影响中央和人中的联动；Dummy 导出的人中与上下唇骨也包含在内。扫描场景中 98 个有效 Morpher 通道，60 组样本均未发现通道值改变。

图中新增 `LIP_` 前缀节点：读取局部 Z、夹紧范围、归一化、乘以各目标骨的满行程位移，再按骨骼求和。最终位置为初始全局位置加所有输入贡献；旋转和缩放来自初始变换。12 个 SetTransform 追加在原执行链末尾，关闭向子级传播，避免重复应用位移。

后续脸颊迁移在 `LIP_MAKE_renzhong_L/R` 的 Translation 前接入 `CHEEK_` 位移相加；原嘴唇贡献保留，共用原来的两个 SetTransform。脸颊任务另做了 107 组旧控回归和 214 组混合验证。

坐标换算沿用本资产实测的 `(x,-y,z)`。`renzhong_L` 的源矩阵行列式为负；Max 的 `scalePart` 只给出正幅值，因此采样按行列式记录有符号缩放，并核对 UE 中保留的负缩放。没有把它改成正缩放。

## 验证结果

- 六个控制各 9 档，共 54 组；另采 6 组组合，包含三上唇、三下唇、全部满行程、两组非对称输入和回零。每组对照 12 骨的完整位置、朝向和缩放。
- 最大位置误差 **0.0002523 cm（0.002523 mm）**，最大朝向误差 **0.000809°**，最大缩放误差约 `1.26e-6`。包含源场景和 UE 参考姿势之间的小量导出残差。
- 非目标骨位置与缩放不变；限位 12 组通过，X/Y 锁定正确，回零无位置残留。
- 原有 30 个控制的 89 组回归，全部 149 骨的位置与缩放不变，朝向差小于 `0.000005°`。同样的 89 组与六唇控半行程混合输入通过。
- 从 Begin 可达的执行链含 36 个 SetTransform；原连接保留，新增 12 个目标均可达。编译 `BS_UP_TO_DATE`。
- 保存后关闭资产编辑器、重新加载包，再次执行全部数值验证通过，随后重新打开资产。

本次验证针对当前 Seven 网格、参考头部姿势和这六个输入。嘴角、总嘴控、脸颊、下巴及头部动画空间适配不在本组六控实现范围；上眼皮既有误差仍见原诊断。画面验收以用户后续反馈为准。

## 脚本和证据

证据见 [LipControls](../../Characters/Seven/Evidence/LipControls/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_lip_samples.ms` | 时间 0 临时采样六控，正常和异常路径恢复原输入，不保存 Max 场景 |
| `Tools/FaceMigration/Scripts/fit_lip_controls.py` | 普通 Python 从采样输出生成数据与位移参数，并检查线性叠加 |
| `Tools/FaceMigration/Scripts/build_lip_controls.py` | 首次增量构建，备份、记录旧控制姿势、编译、验证后保存；检测到 `LIP_` 节点时拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_lip_controls.py` | 独立临时实例执行完整验证，写报告，不改变编辑器预览输入 |
| `Tools/FaceMigration/Scripts/reload_lip_target.py` | 验证并保存，关闭/重载包，再验证并重新打开 |

只需复核现有资产时运行：

```powershell
python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_lip_controls.py
```

重新采集源数据时运行以下命令；参数变化后需重新设计/更新图，拟合脚本不会自动修改现有 Rig：

```powershell
pwsh -NoProfile -File Tools/FaceMigration/Scripts/max_run.ps1 -ScriptFile Tools/FaceMigration/Scripts/probe_lip_samples.ms | Out-File -LiteralPath Saved/Codex/lip_probe_output.txt -Encoding utf8
python Tools/FaceMigration/Scripts/fit_lip_controls.py
```

首次构建前的本机备份目录记录在 [build_report.json](../../Characters/Seven/Evidence/LipControls/build_report.json)；包含原磁盘文件 `disk_before.uasset` 和保存当时内存状态后的 `memory_before.uasset`。`Saved/` 被 Git 忽略。早期眉眼基线 Rig `CR_Seven_MorphSliders` 未在本次修改。
