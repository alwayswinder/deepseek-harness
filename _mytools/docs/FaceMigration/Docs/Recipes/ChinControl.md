# 下巴整体 Line010（2026-11-09）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`，控制为 `CTRL_CHIN`，显示名 **下巴整体**。本组完成时诊断 Rig 为 **149 骨、46 控制、1790 节点**，后续新增部位与当前统计见 [Seven 角色记录](../../Characters/Seven/README.md)。数值、旧控回归和保存重载通过，画面由用户检查。

## 操作

选择下巴处的橙色方框，在移动模式下拖动。控制采用三轴位置输入，0 为中性。按用户要求，三轴拖动行程已缩为首次实现的 **1/3**，输入增益同步改为原来的三倍，下巴最大动作幅度保持不变。

| UE 轴 | UE 行程 | 对应 Max 输入 |
|---|---|---|
| 红 X | 约 −3.333～3.333 | `source_z = -0.3 × X`，范围 −1～1 |
| 绿 Y | 0～约 16.667 | `source_x = 0.3 × Y`，范围 0～5 |
| 蓝 Z | −20～0 | `source_y = 0.3 × Z`，范围 −6～0 |

向下拖蓝轴可张开下颌；其余轴可分别检查前移和横向调整。UE 输入与 Max 输入的比例是 `10/3`，不是骨骼位移倍率。控制参考位置约为 `(0.000008,12.324395,149.297516)` cm，父级为 `Root`，Initial 值为 0，方框尺寸保持原值。

缩短行程时，当前预览中的下巴输入也除以 3，以保留原来的下巴姿势。旧数值输入或动画若需沿用相同表情，其 `CTRL_CHIN` 三轴值同样需要除以 3；其他控制不受影响。调整证据见 [travel_adjustment.json](../../Characters/Seven/Evidence/Chin/travel_adjustment.json)。

## 联动实现

源控制同时驱动辅助枢轴的平移、旋转与多根骨骼的分段表达式。对 30 根响应骨骼，先合并原有嘴唇、嘴角、脸颊控制和下巴表达式，再按源辅助体枢轴旋转，最后叠加加权平移。位置权重与旋转权重分别保留：

| 源辅助体 | 位置 / 旋转权重 | 主要骨骼 |
|---|---|---|
| `100` | 1 / 1 | `xiazuichun`、`Bone018`、`Bone021` |
| `Point490` | 1 / 1 | `xiaya`、`xiahegu`，使用各自源枢轴 |
| `80` | 0.85 / 0.9 | `xiabake_L/R` |
| `70` | 0.7 / 0.8 | `Bone016`、`Bone022` |
| `50` | 0.2 / 0.4 | `Bone014/015`、`lianjia_L/R`、`lianjiazong_L/R` |
| `30` | 0.1 / 0.2 | `Bone017`、`Bone023` |
| `20` | 0.05 / 0.03 | `renzhong_L/R` |

其余 12 根骨保留分段平移项，包括少量眼周和脸颊响应；下眼皮位置贡献在原眼皮 / 眼球旋转之前合并。源样本未发现 Morpher 通道变化。

新增 254 个 `CHIN_` 节点，复用已有骨骼写入，并在原执行链尾追加 6 个 SetTransform。完整执行链为 Begin 加 57 个骨骼写入，没有重复写入目标。正式 `CR_Seven_MorphSliders` 本次未修改。

## 验证结果

源为运行中的 `D:/Download/Seven_Skin_New.max`，0 帧。采集 55 组下巴样本（单轴、中间值、角点及三轴组合）和 20 组与嘴部、鼻子、脸颊、眼球及眼皮的源组合，逐组读取全部 149 骨与 98 个有效 Morph 通道。临时设定 `jaw_move` 的 Y 为 0；采样完成后恢复它和 20 个相关控制的底层原始值，不保存 Max 场景。

| 验证范围 | 最大位置误差 | 最大朝向误差 |
|---|---|---|
| 55 组下巴源对照，149 骨 | `0.00004090 cm` | `0.00004293°` |
| 20 组源组合，除原上眼皮近似外 | `0.00010335 cm` | `0.00004361°` |
| 20 组源组合，上眼皮既有近似 | `0.033799 cm` | `0.393379°` |
| 添加前 45 控制，238 组回归 | `<0.000000001 cm` | `0.00000513°` |
| 旧控叠加下巴，476 组独立公式复核 | `0.000000270 cm` | `0.00000871°` |

另通过控制限位、Blueprint / 新实例初始值、眼球控制 Initial 零值、重复求解、重置和手柄轴向检查。保存后重新加载资产，完整执行链、节点 / 控制数量和上述数值复验通过，恢复原预览输入并选中 `CTRL_CHIN`。

精确公式复核使用临时实例，并让骨骼当前变换超过 UE 层级缓存写入容差，方法与 [双眼总控](GazeMasterControl.md) 一致。上眼皮残差来自既有近似，不能把本次通过理解为消除了它。当前验证使用静止头部参考空间；头部 / 身体动画空间和最终网格画面尚未验收。

## 脚本与证据

证据见 [Chin](../../Characters/Seven/Evidence/Chin/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_chin_samples.ms` | Max 149 骨及源组合采样，恢复原输入 |
| `Tools/FaceMigration/Scripts/fit_chin_control.py` | 用 NumPy / SciPy 分解旋转基、枢轴权重与分段位置项 |
| `Tools/FaceMigration/Scripts/build_chin_control.py` | 首次增量建图、双份备份、旧控快照；拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_chin_control.py` | 完整变换、源组合、旧控与独立公式、限位和初始 / 重置验证 |
| `Tools/FaceMigration/Scripts/reload_chin_control.py` | 保存、包重载、复验、恢复预览并选中下巴 |
| `Tools/FaceMigration/Scripts/resize_chin_travel.py` | 将首次实现的行程缩为 1/3、补偿输入增益，验证相同动作并保存重载；拒绝重复缩放 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_chin_control.py`。拟合原始输入为 `Saved/Codex/chin_samples_raw.json`，交接副本为证据目录的 `max_samples.json`。Max 采样依赖 `Saved/Codex/cheek_bone_names.txt` 的 149 骨名单。
