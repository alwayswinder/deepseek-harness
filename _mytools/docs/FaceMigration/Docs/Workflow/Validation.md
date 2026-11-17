# Control Rig 验证规范

适用范围：本项目 UE 5.8.3 的角色面部控制器迁移；以下代码中的 Seven 是示例，执行前替换目标和测试元素。本文集中维护验证要求，迁移指南和配方引用本文。

## 1. 先确认在测试什么

分别记录示例 Rig、Max 场景、目标 Rig、时间、控制值、预览网格、骨架版本和控制映射。示例提供控制设计，Max 提供动作依据；目标不能作为自己的正确性基准。原始控制单位、归一化参数、UI 行程和形状尺寸分开记录。

交付还须核对[目录与命名规范](Build.md#角色产出目录与命名2026-11-17-起)：根目录为 `<角色名>ECR`，主 CR 为根目录下的 `CR_<角色名>_Expression`，其余新生成或复制的角色专用依赖全部在 `ToolsPanel/`，沿用示例依赖功能名。保存重载后实际读取 CR → 形状库 → 网格/材质 → 贴图等引用，确认目标引用本角色依赖，列出既有网格、骨架、动画和引擎/插件共享资源等外部输入；不能只凭目录里存在同名文件宣称通过。新产出不得残留 `_UI` 或旧 `PhonemeReference` 依赖目录；历史任务不批量搬动。

验证状态分为：

| 状态 | 需要的证据 |
|---|---|
| 结构核对 | 资产、目标骨骼/控制、节点连接、执行链存在 |
| 数值验证 | 有效实例、基准姿势、多个输入样本的完整变换对照 |
| 外观与操作对照 | 与示例比较控制类型、形状、颜色、轨道、参考图、行程、轴向、拾取及重置 |
| 画面验收 | Previewing Rig 下查看中间过程、两侧和组合姿势 |
| 持久化验证 | 保存并重新加载后，结构、编译、数值仍一致 |

历史报告只对当时的场景与样本有效。`BS_UP_TO_DATE`、`execute()` 返回 true、节点数量一致，都不能替代这些验证。

### 1.1 示例、Max 和目标分开对照

- 同角色先核对示例与目标的控制设置、形状库、初始/当前 shape transform 和 offset、颜色、轴掩码、上下界、输入增益、父级及默认姿势；已有动画接口保持兼容。
- 将滑轨、端点、绘制指令、Visual Cue、口型图、材质和透明边界纳入依赖与显示检查。它们不计动画控制数，但不能因未参与求解而漏迁。
- 正面同姿势、相近相机比例、相同选择状态和调试显示下作对照。检查无选择、选中单控、拖动中间值/极限及重置，不仅比一张中性图。截图需注明显示状态，不能只靠骨骼/曲线的数值推断可拾取和手感。
- 框线密集时分别排查 shape 尺寸、offset/scale、`draw_limits`、选中高亮和辅助绘制。保持必要输入限位，不要将限位显示当作正式滑轨，也不要只关掉显示掩盖错误行程。
- 新角色按解剖和头部尺度适配后比较功能及设计；不能强求与 Seven 的绝对位置一致。保留示例合理 UI 行程，不用统一归一化范围或缩小采样范围代替完整适配。
- Max 核验与示例迁移对照各给结论。与示例一致不代表源动作无误；Max 动作正确也不代表控制器外观和操作合格。

先完成代表性小组的外观/操作对照，再扩大数值测试。用户未确认写“待用户验收”；已收到明显差异反馈则写“视觉验收未通过”，修正前不能写整体交付通过。2026-11-10 从零重建虽有数千组数值通过记录，仍因控制器设计偏离示例被用户指出问题，该事实须保留。

### 1.2 先分清基线属于哪个资产谱系

同一份 `Characters/<角色>/Evidence/*.json` 可能混着不同批次的基线，执行前要判定适用范围：

| 基线 | 适用场景 | 不适用场景 |
|---|---|---|
| `max_samples.json`（源动作） | 任何目标：比较 Max 动作和完整变换 | 源本身未覆盖的行程 |
| `source_validation.json`（本轮新采） | 本任务本次采集 | 其他任务、其他角色 |
| `previous_controls.json`（旧控回归） | 在既有求解上做增量、需要证明旧控行为未变 | 空目标新建、从示例派生、求解被替换 |

2026-11-10 实测：`verify_runtime_face_controls.py` 的旧控回归段因基线属于已废弃的采样求解资产而误报（`bones` 为空时脚本回落到“全部骨保持中性”）。读基线前先检查关键字段是否为空、曲线名是否存在于当前层级；不满足就跳过该段并在报告里写原因，不能把 `passed=false` 直接当资产缺陷，也不能临时造一份同谱系基线把它刷绿。

## 2. 测试实例必须有真实层级

2026-11-06 会话中出现过 `create_control_rig()` 返回的实例层级为空的情况（视调用时机而定）；读取不存在的骨骼会返回零/单位变换，而求解仍可返回 true，导致自检假通过。实测在 `request_init()` 之后层级通常已有内容，但仍应显式断言，不要依赖时序。

测试 POSITION 骨骼控制时，可使用以下初始化片段（仅修改新建临时实例）：

```python
import unreal

rig = unreal.load_asset('/Game/_MyTest/Mouth/SevenECR/CR_Seven_Expression')
assert rig is not None
source = rig.get_hierarchy()
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()
if not rh.get_all_keys():
    rh.copy_hierarchy(source)
    inst.request_init()

def key(name, kind):
    return unreal.RigElementKey(type=kind, name=name)

control = key('CTRL_EYE_LID_R', unreal.RigElementType.CONTROL)
bone = key('Bone028', unreal.RigElementType.BONE)
assert rh.contains(control) and rh.contains(bone), '实例缺少测试元素'

# 本例适用于本资产的 POSITION 控制；明确清零所有输入，避免预览值混入测试。
for k in rh.get_all_keys():
    if k.type != unreal.RigElementType.CONTROL:
        continue
    settings = rh.get_control_settings(k)
    if settings.animation_type == unreal.RigControlAnimationType.VISUAL_CUE:
        continue
    assert settings.control_type == unreal.RigControlType.POSITION, '其他类型需使用匹配的基准赋值'
    rh.set_control_value(k, rh.make_control_value_from_vector(unreal.Vector(0, 0, 0)))

def sample(z):
    rh.set_control_value(
        control, rh.make_control_value_from_vector(unreal.Vector(0, 0, z)))
    assert inst.execute('Forwards Solve')
    assert rh.contains(bone), '求解后层级失效'
    return rh.get_global_transform(bone)

baseline = sample(0.0)
closed = sample(-10.0)
assert (closed.translation - baseline.translation).length() > 0.01, '目标骨骼没有有效响应'
```

这是“实例能否有效测试”的检查，不是“眼睑已经正确”的判据。多个控制参与时，先把相关控制设为明确基准值，再依次求解；不要沿用编辑器中未记录的预览值。测试实例复制层级后只证明测试实例有效，不能据此宣称正式运行实例已正确初始化。

## 3. 对照完整变换

- 位移比较 `p(s)`，旋转比较完整 `q(s)` 或旋转矩阵，必要时比较缩放。
- 不能只比较位移差、欧拉某一轴、总旋转角，或只看端点。眼睑诊断中 Bone028 端点位置误差约 0.005 mm，但朝向误差约 42°。
- 至少覆盖中性、正负有效范围、中间值、限位与回到中性。单侧控制的无效方向应被夹住。
- 四元数 `q` 与 `-q` 表示相同旋转。对单位四元数可用 `2*acos(clamp(abs(dot(q_test,q_ref)),0,1))` 计算朝向误差，输出时注明弧度或度。
- Max 与 UE 的矩阵/四元数约定及骨骼局部基不同，先验证静止姿态映射，再比较动画增量；点坐标换算不能直接当成旋转轴换算。

项目的骨骼 `GlobalSpace` 是 Rig/组件空间，不是关卡的绝对世界空间。还要测试角色整体移动、转身和头部旋转；静止头部通过不代表能跟随动画。

## 4. 空间与组合顺序

按 UE 四元数约定：

```text
世界/组件空间增量：q_new = q_delta_global * q_initial
骨骼局部空间增量：q_new = q_initial * q_delta_local
```

这里“世界”只指上述 Rig 全局空间。选择乘法顺序前，先确定增量实际属于哪个空间，并通过 `RotateVector` 或矩阵验证方向。把局部轴拿去左乘仍然会错；`-dEuler` 不是所有控制器通用的符号规则。

纯平移偏移可以按向量求和。旋转、父级枢轴和表达式修正必须按源 Rig 的变换顺序合成，不能要求所有控制的最终位移都线性相加。

### 4.1 动画头部空间与控制器跟随的独立验收

实现选择见[主流程两项必查](Build.md#动画头部空间与控制器跟随两项必查)。分别记录“动画头部空间”和“控制器头部跟随”结论，不能互相替代。`verify_runtime_face_controls.py` 现会在保存前与重载后检查独立实例：任务的 `validation.head_bone` 指定实际锚点，`validation.animation` 指定本角色身体动画，报告为 `SevenRuntime/<阶段>/animated_space_validation.json`。纯验证配置使用 `validation`，不要在任务初始化后追加属于归属标记的 `layout`。

成员变量的类型、默认值和 public/private 纳入门禁；元数据差异另列 `variable_metadata_differences`。UE 5.8.4 的 RuntimeAsset 转换函数无条件设置 `CPF_Interp`，因此示例的 `expose_to_cinematics=false` 会读回 true，分类 Default 也可能成为空。缓存仍须保持 private=true、public=false，不能将元数据差异隐藏为完全一致；当前不修改引擎源码。

| 验收项 | 必测内容与判据 |
|---|---|
| 动画头部空间 | 参考姿势、非零头部平移、不同方向旋转，以及实际身体动画多个时刻；中性、单控及组合下，输入的身体/头部变换保持，面部输出符合已声明的参考覆盖或输入姿态增量语义，旋转、位移和缩放均按完整变换比较 |
| 控制器头部跟随 | 在同一批姿势中检查所有控制及形状、实体滑轨、参考图的头部相对位置/朝向；局部控制值、默认值、行程、操作轴和嵌套父级保留，不埋入模型、不因重复求解累加；固定 Rig 空间的调试绘制须另验 |
| 持久化与实际宿主 | 保存前与重载后各自重测两项；正常帧读实际 host、最终网格骨骼及形状，核对时钟推进。Sequencer 内播放/拖动并启停面部轨道，检查此前出错姿势；未在 Sequencer 测试就明确写未测，用户画面/拾取确认另列 |

同角色增量修改需用修改前的独立基准证明面部行为未变；新角色用本角色源数据及独立预期验证。若使用参考空间覆盖求解，中性检查要分别比较身体/头部的保留和面部的覆盖结果；不能把“控制默认值为零”推导为“最终面部等于输入动画”。名为无表情的动画也需实际读取面部骨骼数值。

施加采样骨骼姿势时，按真实 AnimNode 的输入方式更新层级，传播非骨骼子级；逐骨 `set_global_transform(..., bAffectChildren=False)` 会保持子级世界变换并改写 Null 局部值，不是同样的动画输入。保留/恢复 Initial、Current 控制值、预览姿势与帧；重复求解及回零后读回，防止补偿重复或漂移。

操作时记录视口 World/Local 模式。World 下箭头不随头倾斜不代表层级失败；先切 Local 判断。更改控制 offset 朝向时须配套输入空间转换，并对原关键帧行为做回归；Shape Transform 只改变显示形状，不能修复输入坐标轴。改父级还需检查 UE 自动清理显示名标点的副作用。

报告注明目标、头部骨、源/目标摘要、测试动画及时间点、输入、独立预期、最大误差、重复求解、保存重载、正常帧与 Sequencer 范围。当前示例历史证据见[Seven 状态](../../Characters/Seven/README.md)，仅证明该次 Blueprint 修复，不能替代新角色或 RuntimeAsset 的本轮验证。

## 5. 交叉、执行流、画面与保存

1. 单控测试：目标动，其他独立部位保持基准。
2. 两侧测试：左右分别求解，验证符号与限位。
3. 组合测试：整体 + 点控 + 弯曲；眼睑 + 眼周点控；头部动画 + 面部控制。比较组合结果与 Max。
4. 重建后遍历 Execute 连接，确保眉毛和眼周 SetTransform 都从入口可达。不要假定对同一个 Execute 输出连续 `add_link` 就能保留两个分支。
5. 编辑器切到 `Previewing Rig`，选择目标控制，观察开合全过程，由用户确认网格效果。不使用 computer-use。`Previewing Reference Pose` 画面不能验收 Rig 驱动。
6. 恢复记录下来的预览值；保存并重开资产，再测。读取资产列表或编译成功不等于持久化功能验证。

2026-11-09 新式资产测试发现：预览输入已写入，但 Rig 时间停在 0.4 秒、Rig 和最终动画曲线均不更新。`request_run_once_event()` 与组件的 `update_animation_in_editor=True` 不能证明预览世界实际在 Tick；重新打开目标编辑器后恢复。必须记录预览实例的时间推进，并在正常帧读回最终曲线及网格骨骼。编辑器关闭后旧 PreviewWorld 可能尚未回收，不能只按网格、类名或控制数量挑实例；应核对目标 VM 的所属资产和本轮确认的组件路径。失败、恢复及 75 组逐控预览证据见 [SevenRuntime](../../Characters/Seven/Evidence/SevenRuntime/README.md)。

2026-11-10 在新构建的 `NewControlRigRuntimeAsset1` 上复现同一现象：Rig 绝对时间停在 0.4 s、28 条 Morph 全 0、`half_error=0.50014`，连续两次 `refresh_runtime_face_preview.py` 都未恢复。因此 `verify_runtime_face_preview.py` 的前置断言阻止了 76 组逐控预览。判定与后续步骤见[预览停滞排障](../Troubleshooting/PreviewStall.md)；这条不能写成“数值通过即等价”，`delivery_check.json` 要保留 `normal_frame_preview.passed=false`。

2026-11-10 第二轮在重建的 `NewControlRigRuntimeAsset` 上完全复现（时钟 0.4 s、`half_error=0.50014`、两次 refresh 无效），并补到一段更细的判定：在**同一个 live preview host** 上手动 `host.execute('Forwards Solve')` 后 Rig 层级曲线变成正确的 `0.50014`，而网格的动画曲线仍为 0。随后进一步确认：`host.set_absolute_time(1.0)` 能改时间，但 4 秒后仍为 1.0，激活编辑器窗口也无效——**组件根本没有被 tick**。所以可以确认的只有“预览 tick 不推进”这一层；“曲线没传给网格”目前无法单独证明（动画实例同样没被 tick）。`request_run_once_event('Forwards Solve')` 对该预览 host 无效，`request_evaluate()` 在 `ControlRig` 上不存在。记录时应写成“预览世界不 tick”，不要写成曲线绑定或求解错误。该判定已并入 `probe_runtime_face_morph_preview.py`：`half_error` 超阈值时自动写 `stall_diagnosis.verdict`（`solver_runs_but_mesh_curves_stale` / `solver_did_not_run` / `curves_transfer_partial`）。

**改用 ticking 宿主后一次通过（2026-11-10）**：不要继续重开资产编辑器刷状态。在关卡里放网格并挂含 ControlRig Layer 的 AnimBlueprint（或 ControlRig Actor 的 mapped mesh），进 PIE 后设控制、逐条比较网格曲线与 Rig 曲线。实测 `L_SevenLipSync` + `NewAnimBlueprint` + PIE：Rig 时钟从 0 推进到 105 s，5 个控制驱动后网格曲线与 Rig 曲线逐条误差 0（`Seven_Head_huangzhang`/`Seven_Pupil_huangzhang` = `0.50014`），骨骼输出与独立实例一致。证据 `pie_preview_check.json`。交付里两段分开写：`normal_frame_preview`（资产编辑器，仍不通过）与 `normal_frame_preview_pie`（PIE 宿主，通过）。

Max 抽检要按骨分别报数。2026-11-10 第二轮实测同一控制（`CTRL_EYE_LID_R`）下，主驱动骨 `Bone028` 误差 0.00344 cm / 0.0808°（约等于 6 位小数四元数量化下限），而 Link_Constraint 的次级骨 `Bone027` 在中间行程有 0.0208 cm / 0.4076° 的差异，两端趋零。只报整体 worst 会把这类差异藏起来；容差要按驱动关系区分并写明量化下限。轴向换算（本轮实测）：Max → UE 位置 `(x, -y, z)`、四元数 `(x, -y, z, w)`。

## 6. 证据保存

2026-11-06 左右眼球组合复核发现，`FRigComputedTransform::Equals` 默认以 `0.0001` 比较变换各分量；微小输入可能不触发层级写入。应另测连续切换与独立实例，记录缓存残差，并明确检查其符合引擎容差。独立实例的公式对照仍保持严格精度，不能直接放宽全部测试。实测及代码入口见 [眼球控制](../Recipes/EyeballControls.md)。

每份报告写明日期、源资产、输入、预期值、实际值、误差与未测范围。本次报告和必要图片写到目标项目 `Saved/FaceMigration/Jobs/<任务>/Current/Evidence/`。原始采样、回归快照和图导出写 `Saved/FaceMigration/Characters/<角色>/`，不写回工具包；包内只保留 `parameters.json`、`bone_names.txt` 和小报告。正式采纳的新参数归入 `Characters/<角色>/Evidence/` 的 `parameters.json`；Seven 历史证据受摘要保护，已移出的批次记录在 `preservation.manifest.json` 的 `moved_out`。临时调试写 Current/Temp，不自动复制整套输入或新增一套运行文档。

当前眼睑的逐样本证据见 [Evidence/SYP_R001](../../Characters/Seven/Evidence/SYP_R001/README.md)，功能结论见 [SYP_R001Diagnosis.md](../Troubleshooting/UpperEyelid.md)。

2026-11-06 12:24 对早期眉眼基线 Rig 的临时实例复核见 [复核快照](../../Characters/Seven/Evidence/control_rig_recheck_2026-11-06.json)；同目录 [采集脚本](../../Characters/Seven/Evidence/recheck_control_rig.py) 可从项目根目录用 `python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Characters/Seven/Evidence/recheck_control_rig.py` 执行。脚本仅查询内存资产和求解临时实例，重跑会覆盖该复核 JSON；不保存、重载或修改 Rig 资产，不属于画面/持久化验收。
