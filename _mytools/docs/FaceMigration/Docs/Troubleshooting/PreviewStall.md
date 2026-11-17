# 正常帧预览停滞（Rig 时间不推进）

**现象**：预览输入已写入，层级里控制值和骨骼输出都会变，但 `ControlRig.get_absolute_time()` 停在某个值（观察到 `0.4 s`）；动画组件的 28 条 Morph 曲线全为 0，网格不动。

**判定**（三条同时成立才算停滞）：

1. 预览实例确实属于目标资产：`RigVMHost.get_vm().get_outer() == target`，且组件路径是本轮记录的组件，不是旧 PreviewWorld。
2. 输入已写入并读回一致，但 `live.get_absolute_time()` 在多次 Slate tick 后不变。
3. 同一资产用独立实例（`create_rig_vm_host()` + `execute('Forwards Solve')`）能得到正确输出。

第 3 条成立而第 2 条不成立时，问题在预览求值，不在求解公式；不要改图或增益去“修”。

## 排查顺序

1. 确认组件 `update_animation_in_editor=True`，并调用一次 `request_run_once_event('Forwards Solve')`。
2. 记录 `preview_component`、`preview_host`、`get_absolute_time()`、期望与实际曲线，写入 `preview_morph_check.json`（`pending=false` 后再判断）。
3. 运行 `python Tools/FaceMigration/migrate.py run refresh_runtime_face_preview.py --job <任务>`：保存输入 → 关闭目标资产编辑器 → 重开 → 恢复 73 个输入。历史记录显示重开后恢复。
4. 重开后再跑 `probe_runtime_face_morph_preview.py`，等 JSON 的 `pending=false` 且 `passed=true` 才继续 `verify_runtime_face_preview.py`。
5. 若两次 refresh 后仍停滞，停止重试，按“未通过”记录；不要连续重建预览世界制造更多旧实例。

## 2026-11-10 记录

目标 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset1`（1926 节点，构建后立即保存重载）：

| 项目 | 值 |
|---|---|
| `preview_component` | `/Engine/Transient.World_9:` 与 `World_11:` 的 `AnimationEditorPreviewActor_0.ControlRigSkeletalMeshComponent_0` |
| `rig_absolute_time` | `0.4`（两次 refresh 后不变） |
| `half_error` | `0.50014`（期望 0.5，实际 0） |
| `restored_curve_error` | `0.0` |
| `restored_input_error` | `0.0` |
| 结论 | 未通过；`verify_runtime_face_preview.py` 被前置断言阻断 |

同一目标的独立实例求解正常：1175 组迁移对照 worst 全 0，上眼皮 Max 抽检 0.00344 cm / 0.00059°。因此本轮把“数值/结构通过”和“正常帧预览未通过”分开记录，`delivery_check.json` 不写整体通过。

## 2026-11-10 第二轮：重建目标复现，并细分出两层原因

目标 `/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset`（空壳重建，1926 节点，保存重载通过后立即测）：

| 项目 | 值 |
|---|---|
| `preview_component` | `World_23` / `World_25` / `World_27` 的 `AnimationEditorPreviewActor_0.ControlRigSkeletalMeshComponent_0` |
| `rig_absolute_time` | `0.4`（两次 refresh、三次新组件均不变） |
| `half_error` | `0.50014`；`rig_half` 与 `actual_half` 全 0 |
| `restored_curve_error` / `restored_input_error` | `0.0` / `0.0`（输入恢复没问题） |
| 组件状态 | `anim_instance=ControlRigLayerInstance`、`update_animation_in_editor=True`、`bPauseAnims=False`、`anim_mode=ANIMATION_CUSTOM_MODE` |

**新判定（关键）**：在同一个 live preview host 上按顺序执行——

| 步骤 | Rig 层级曲线 | 网格动画曲线 | 时间 |
|---|---|---|---|
| 写输入 `CTRL_EXPR_HUANGZHANG=(4,0,0)` | 0 | 0 | 0.4 |
| `request_run_once_event('Forwards Solve')` | 0 | 0 | 0.4 |
| `host.execute('Forwards Solve')` | **0.50014** | 0 | 0.4 |
| `set_update_animation_in_editor(True)` | 0.50014 | 0 | 0.4 |

即停滞有两层：(1) 预览 tick 不推进/不重算；(2) 即使手动算出 Rig 曲线，`ControlRigLayerInstance` → 网格动画曲线这一段也不更新。`ControlRig.request_evaluate()` 不存在（`AttributeError`）。判定时分开写这两层，不要用“改图/改增益”去修。

**2026-11-10 补充（修正上一条）**：第 (2) 层目前**无法单独证明**——网格曲线为 0 也可能只是因为动画实例同样没有被 tick。能确认的只有第 (1) 层：

| 操作 | 结果 |
|---|---|
| `host.set_absolute_time(1.0)` / `set_delta_time(1.0)` | 调用成功，`get_absolute_time()` 立即变 1.0 |
| 等 4 秒后再读 | 仍是 1.0 → 组件**完全没有被 tick**，不是慢 |
| 激活 UE 主窗口（`AppActivate`）后重读 | 仍是 1.0 |
| `ObjectIterator` 枚举 | 只有 1 个属于目标 VM 的 host，不是选错实例 |
| 组件属性 | 存在 `visibility_based_anim_tick_option`（按可见性决定是否 tick 动画） |

因此现阶段结论是“预览世界没有 tick 这个组件”，最可能是资产编辑器视口的**实时/可见性状态**（`VisibilityBasedAnimTickOption` 门控），而不是 Rig 内容或曲线绑定。确认方法：在编辑器里打开目标资产、确保视口实时开启（`Ctrl+R` 切换）并点一下视口，看时间是否推进；或在关卡放一个临时 ControlRig actor 用 PIE 验证曲线能否到网格。

## 2026-11-10 可用宿主：关卡网格 + AnimBlueprint + PIE（已验证通过）

按上面的建议换成 ticking 宿主后，同一份资产一次通过：

| 项目 | 值 |
|---|---|
| 关卡 | `L_SevenLipSync` |
| 网格 | `SkeletalMeshActor_1`（label `NewControlRigRuntimeAsset`），网格 `Seven` |
| 动画蓝图 | `/Game/_MyTest/Mouth/TMp/NewAnimBlueprint`，内含 ControlRig Layer → `NewControlRigRuntimeAsset` |
| 宿主 | PIE（`UEDPIE_0_L_SevenLipSync`） |

| 观察 | 结果 |
|---|---|
| PIE 中 ControlRig 时钟 | 持续推进（0 → 105 s） |
| 编辑器世界的同一组件 | 仍停在 0（确认问题在宿主，不在资产） |
| 设 5 个控制后（表情 / 口型 / 右上眼皮 / 左眉 / 左嘴角） | 网格曲线 = Rig 曲线，`Seven_Head_huangzhang` `Seven_Pupil_huangzhang` 均 `0.50014`，逐条误差 0 |
| 骨骼输出 | `Bone028` = `[-4.346073, 8.112865, 158.336031]`，与独立实例采样一致 |
| 证据 | `Saved/FaceMigration/Jobs/<任务>/Current/Evidence/pie_preview_check.json` |

**结论**：资产、求解、曲线到网格的链路都正常；`ControlRigRuntimeAsset` 的“正常帧”应在 ticking 宿主（PIE / 含 ControlRig Layer 的 AnimBlueprint）上验证，不要拿资产编辑器的非 tick 预览世界当门禁。`assemble_delivery.py` 会把这两段分开记：`normal_frame_preview`（资产编辑器）与 `normal_frame_preview_pie`（PIE 宿主）。

## 相关环境事实

- 当前关卡 `L_SevenLipSync` 里没有 ControlRig actor，只有两个 SkeletalMeshActor，预览只能依赖资产编辑器的临时世界。
- 预览世界中可枚举到 74 个 `ControlRigShapeActor`，口型参考图 actor 存在且未隐藏；手柄是否可见可先用它做结构证据，但它不能代替正常帧曲线和网格验证。
- 编辑器关闭后旧 PreviewWorld 不会立刻回收；`ObjectIterator` 可能同时看到多个实例，必须按本轮记录的组件路径筛选。
