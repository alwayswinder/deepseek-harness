# 双眼总控 YanJing_Zong001（2026-11-09）

已接入 `/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation`。新增 `CTRL_EYEBALL_MASTER`，显示名 **双眼总控**；本次总控完成时为 **149 骨、45 控制、1536 节点**，后续新增部位及当前统计见 [Seven 角色记录](../../Characters/Seven/README.md)。数值对照、旧控回归及保存重载通过，画面待用户检查。

## 操作

拖动眼前的橙黄色宽框，会同时移动左右眼球的绿色目标框，并带动两眼朝向。红 X 左右、蓝 Z 上下、绿 Y 改变目标远近；输入 0 为中性，无行程限位。输入 1 对应总目标平移 1 cm。

`CTRL_EYEBALL_L/R` 现在以总控为父级，仍可分别拖动，作为左右眼的独立调整。总控回零后，两侧单眼输入保持各自值。总控的参考位置是 `(-0.000036,35.296104,159.476151)` cm；左右手柄参考世界位置保持原值。

首次构建时的预览输入保存在 `build_report.json`。后续修复了改父级引入的错误初始值；修复时两侧已处于错误默认值，将其恢复为正确的 0，中性手柄已回到眼前。当前选中总控，可直接检查效果。重载脚本现在恢复运行当时的预览值。

## 初始位置修复

用户反馈重置后两个单眼手柄位于脚底。原因是 `set_parent(..., maintain_global_transform=True)` 在维持世界位置时，把两个控制的初始局部值改为约 `(0.000036,-35.296104,-159.476151)`；随后再写入相对总控的参考偏移，未同步清零该补偿值。重置后的手柄高度因此变成约 `-0.49 / -0.60 cm`。

已将两个单眼控制的 Initial 值修为 0，并保留父级、参考偏移和全部求解连接。修复后初始位置恢复为左 `(4.306676,35.296112,158.986832)`、右 `(-4.292577,35.296104,158.875061)` cm。建图脚本同样修正，避免重新构建复现。

旧测试在 `solve()` 内主动清零控制，掩盖了默认值缺陷；现在先检查 Blueprint 与新实例的原始 Initial 值和位置，再执行“重置为初始姿势”并求解，全程不手动清零，最后才进入常规数值测试。保存重载后，原 47 + 20 组源对照、210 组旧控、420 组组合仍通过。修复前后与备份记录见 [initial_position_fix.json](../../Characters/Seven/Evidence/GazeMaster/initial_position_fix.json)。

## Max 与 UE 的对应

Max 的 `YanJing_L001/R001` 是 `YanJing_Zong001` 的子节点。总控不仅通过父子关系移动目标点，也直接参与上下眼皮辅助点、眼角及眼袋的位置 / 旋转表达式。

两类输入必须分别处理：

- 眼球朝向目标：`单眼参考目标 + 单眼世界位移 + 总控世界位移`。
- 眼皮 Euler 表达式：先把单眼与总控分别逆变换到源 Position List 第 2 层输入，再相加对应 Euler 贡献。
- 眼周分段位置：分别对单眼、总控各自取正负分支，再相加；不能先把输入求和后取一次正负，否则反向组合会丢失源表达式贡献。

单眼源输入基的缩放约为 `1.47407`，总控约为 `1.0`。两者相同 UE 位移不代表相同源表达式输入，所以没有简单复用单眼的逆矩阵。总控矩阵及独立分段参数见 [parameters.json](../../Characters/Seven/Evidence/GazeMaster/parameters.json)。

新增 **76 个 `GAZEM_` 节点**，在既有 `GAZE_` 目标点、Euler 及位置项之前合并总控贡献。没有新增骨骼写入；原 Begin 加 51 个 SetTransform 的完整执行链保留。

## 验证结果

源为运行中的 `D:/Download/Seven_Skin_New.max`，0 帧。扫描全 149 骨和 98 个有效 Morpher 通道：总控单轴 27 组、角点 8 组、与左右单眼组合 12 组，共 **47 组**；另有 **20 组**与上下眼皮的组合。Morph 通道均无变化；采样后恢复七个相关控制的原始底层输入，不保存 Max 场景。

| 验证范围 | 最大位置误差 | 最大朝向误差 |
|---|---|---|
| 47 组中的眼球 / 子骨 | `0.00001973 cm` | `0.00005955°` |
| 47 组中的上眼皮 | `0.00008303 cm` | `0.00003209°` |
| 47 组中的其余骨骼 | `0.00008664 cm` | `0.00002427°` |
| 20 组眼皮组合中的眼球 | `0.00002092 cm` | `0.00005302°` |
| 20 组眼皮组合中的下眼皮及其余骨骼 | `0.00015540 cm` | `0.00002126°` |
| 20 组眼皮组合中的上眼皮（继承原近似） | `0.033746 cm` | `0.393217°` |

添加前 **44 个控制、210 组**姿势回归通过，原姿势位置变化小于 `3.62e-10 cm`。各叠加两组总控，**420 组**独立公式组合通过，最大位置 / 朝向误差约 `0.000000273 cm / 0.00001025°`。重复求解、回零、总控超范围输入读取与左右手柄三轴跟随通过，重载后手柄跟随误差约 `0.000000510 cm`。

组合公式复核在临时实例中将已有写入目标骨骼的当前位置临时偏移 `(1,1,1)`，再执行正常求解，确保极小变化超过 UE 缓存写入容差；初始变换与控制输入不变。这样可以检查精确公式，避免把极小眼皮输入被层级缓存跳过造成的误差混入公式结果。缓存机制及上一轮实测残差见 [左右眼球控制](EyeballControls.md)。

本次仍使用静止头部参考空间；头部 / 身体动画空间适配，以及注视目标与枢轴重合或平行 up 方向的退化姿势未验收。原上眼皮近似误差保留，正式 `CR_Seven_MorphSliders` 本次未修改。

## 脚本与证据

证据见 [GazeMaster](../../Characters/Seven/Evidence/GazeMaster/README.md)。

| 脚本 | 用途 |
|---|---|
| `Tools/FaceMigration/Scripts/probe_gaze_master_samples.ms` | Max 总控、单眼及眼皮组合采样，恢复原始输入 |
| `Tools/FaceMigration/Scripts/fit_gaze_master.py` | 普通 Python 中分解总控世界输入基与独立分段位置项，需要 NumPy / SciPy |
| `Tools/FaceMigration/Scripts/build_gaze_master.py` | 首次增量建图、双份备份、旧控采集；拒绝重复添加 |
| `Tools/FaceMigration/Scripts/verify_gaze_master.py` | 源完整变换、旧控、组合公式、手柄跟随、回零验证，不保存资产或改变预览 |
| `Tools/FaceMigration/Scripts/reload_gaze_master.py` | 验证、保存、重载、重复验证，恢复原预览并选中总控 |
| `Tools/FaceMigration/Scripts/fix_gaze_master_initials.py` | 修复旧资产错误初始值，保存重载复核，纠正处于错误默认值的预览并保留其他输入 |

只复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_gaze_master.py`。

拟合读取本机 `Saved/Codex/gaze_master_samples_raw.json`，交接副本为证据目录 `max_samples.json`。源采样依赖 `Saved/Codex/cheek_bone_names.txt` 的 149 骨名单；备份目录见 `build_report.json`。
