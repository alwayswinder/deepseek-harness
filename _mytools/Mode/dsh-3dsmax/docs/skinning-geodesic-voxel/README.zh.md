---
description: "用 3ds Max Geodesic Voxel 生成角色 Skin 初始权重，检查权重与动作变形，并参考 Chistatic 实测结果安排局部修整。"
---

# 3ds Max Geodesic Voxel 蒙皮指南

[English](README.md) | 中文

## 摘要

本指南用 Max 自带 Skin 的 Geodesic Voxel 求解器，为已有合格静止骨架的角色生成初始权重，随后检查动作变形并局部修权重。顶点全部赋权且归一化正确，只代表数值检查通过，不能证明动画变形质量。

实测案例为 3ds Max 2026 中的 Chistatic，使用兼容 Seven 命名的 Dummy 骨架。骨数、段端点、求解参数、耗时与残差均为案例数据；换角色时重新测量。

## 目录

- [1. 准备输入](#preparation)
- [2. 设置 Dummy 的 Skin 段](#segments)
- [3. 计算并比较权重](#solve)
- [4. 验证权重、动作与保存结果](#validation)
- [5. 修整重点部位](#refinement)
- [6. Chistatic 实测结果](#evidence)
- [7. 衔接 Biped 与控制器](#handoff)

<a id="preparation"></a>

## 1. 准备输入

写入前确认目标 Max PID 与完整文件路径。参考场景用于取证，求解器只在另存的目标副本中运行。保留 `preSkin` 快照、外部静止矩阵表，以及原网格和材质数据。

| 检查项 | 必须记录 |
|---|---|
| 几何 | 网格名、顶点/面数、基础顶点、面索引、UV、材质 ID、节点矩阵及材质分配 |
| 骨架 | 精确骨名与父级、世界静止矩阵、单位、参考帧及动画/控制器状态 |
| Skin | 已有修改器、影响骨名与已有权重；重算前保留已有蒙皮版本 |

为目标网格添加 Skin，只加入绑定设计要求的变形节点。本例保留全部 55 个骨架节点，Skin 使用其中 54 个：`Root` 保留层级职责，不直接分配顶点权重。这是本例的绑定选择，不是所有角色都应删除根骨影响。

删除 Skin 骨骼前，先按精确骨名解析当前索引。索引取决于当前修改器。本地试验脚本删除索引 55 是一次性准备步骤，重复执行可能删掉其他影响骨。

<a id="segments"></a>

## 2. 设置 Dummy 的 Skin 段

Dummy 的显示盒尺寸不能代替符合身体结构的 Skin 段。本例初始 Skin 端点只有约 ±1.25 cm。体素求解前应先设置段的起止点，让求解器使用实际肢段范围。

| 部位 | 本例使用的端点规则 |
|---|---|
| 骨盆、脊柱、颈 | 起点为节点轴心，终点为下一解剖关节 |
| 四肢 | 锁骨 → 上臂 → 前臂 → 手；大腿 → 小腿 → 脚 → 脚掌 |
| 手掌 | 终点取食指、中指、无名指第一节位置的平均值 |
| 手指 | 终点为下一节；末节沿上一段方向外推 |
| 前臂 twist | 本次试验以手腕为终点 |
| 头与脚掌末端 | 按模型测量末段延伸；本例头部沿世界 Z 延伸 27 cm，脚掌沿局部 X 延伸 6.5 cm |

Skin 端点使用骨骼局部坐标。本次执行时将世界空间终点乘以骨骼逆矩阵；不能把世界关节坐标直接写成局部端点。以下片段要求已在参考姿势中解析 `sk`、`boneIndex`、`boneNode` 和 `tipWorld`。

```maxscript
local tipLocal = tipWorld * inverse boneNode.transform
skinOps.SetStartPoint sk boneIndex [0,0,0]
skinOps.SetEndPoint sk boneIndex tipLocal
```

写入后读回端点，并在视口检查覆盖范围。通过修改 Skin 段数据调整范围，保持骨架绑定姿势。末段延伸量及手掌、twist 的规则写入当前角色记录。

<a id="solve"></a>

## 3. 计算并比较权重

求解前保存段设置完成的场景。先计算较低分辨率试验并检查动作，再从同一准备状态计算较高分辨率候选。两个文件都保留；提高分辨率不能证明变形更好。

以下调用已通过 MAXScript 实测。`mode=0` 为体素权重，`mode=1` 为热力图权重。本次其余标志按下表使用，没有对比其他取值。

| 参数/属性 | 本例取值 |
|---|---|
| `Skin.ref_frame` | `0` |
| `Skin.bone_Limit` | `4` |
| `falloff` | `0.2` |
| `max_influence` | `4` |
| `max_res` | 先 `256`，再 `512` |
| `winding` | `false` |
| `envelope_off` | `true` |

将 `chiya` 替换为已核对的网格名。仅在准备好的工作副本中执行：重新求解会替换当前自动权重，也可能丢失后续人工修权重的成果。四个影响是本例预算，不是 UE 的通用限制。

```maxscript
(
    local sk = $chiya.modifiers[#Skin]
    sk.ref_frame = 0
    sk.bone_Limit = 4
    skinOps.voxelWeighting sk 0 0.2 4 512 false true
    completeRedraw()
)
```

参数顺序与 Skin API 见 [Autodesk Skin 修改器 MAXScript 参考](https://help.autodesk.com/view/MAXDEV/2026/ENU/?guid=GUID-0820AA26-920F-434D-A6BC-E8B6B57F54AC)。复用调用前确认安装的 Max 版本。

<a id="validation"></a>

## 4. 验证权重、动作与保存结果

分三类检查。数值检查或数据保留检查失败时，记录问题并恢复上一里程碑，再进入后续阶段。

### 权重数值检查

逐顶点检查有效正权重、负权重、归一化误差、影响数量及影响骨名。列表中可能保留零权重条目，不能只靠条目数量判断顶点已赋权。以下只读片段已在结果的 27,135 顶点 Skin 上执行，未赋权、权重和异常及负权重条目均为零。

```maxscript
(
    local sk = $chiya.modifiers[#Skin]
    local unweighted = 0, badSums = 0, negativeEntries = 0
    local maxEntries = 0, maxError = 0.0
    local count = skinOps.GetNumberVertices sk
    for v = 1 to count do (
        local entries = skinOps.GetVertexWeightCount sk v
        local total = 0.0, positive = 0
        maxEntries = amax maxEntries entries
        for j = 1 to entries do (
            local w = skinOps.GetVertexWeight sk v j
            total += w
            if w > 0 do positive += 1
            if w < 0 do negativeEntries += 1
        )
        if positive == 0 do unweighted += 1
        local err = abs (total - 1.0)
        maxError = amax maxError err
        if err > 1e-4 do badSums += 1
    )
    local result = stringStream ""
    format "vertices:% unweighted:% bad_sums:% negative_entries:% max_entries:% max_sum_error:%" count unweighted badSums negativeEntries maxEntries maxError to:result
    result as string
)
```

### 动作与复位检查

每项试动前按引用快照受影响节点，并记录求值网格。关闭动画记录进行试动，调用 `completeRedraw()` 强制求值，同时观察表面与骨架。试动后直接复位并测残差；重载文件只用于隔离下一项测试，不能当作直接复位通过的证据。

| 测试 | 重点观察 |
|---|---|
| 抬肩、抬臂、屈肘 | 腋下连接、肘部体积、宽袖塌陷、袖口与手分离 |
| 抬腿、屈膝 | 裆部、膝部、被大腿带动的衣摆、左右腿串权重 |
| 单指弯曲、转腕 | 关节体积、邻指、拇指、手腕及前臂 twist 分配 |
| 头颈旋转 | 头发、耳饰、围巾及胸部/锁骨的异常影响 |

除末端跟随外，还要检查弯曲平面：膝盖应朝预期前方屈曲，肘部应按身体结构朝预期方向折叠。在角色根坐标系中对照参考，分别测试 Biped 与控制环输入。接近伸直的关节位置可能产生朝外的平面；静止位置一致不能证明平面正确。先修正驱动几何与绑定偏移，再判断 Skin 权重。

初始体素试验测试了左手四指，未测试拇指。后续 Biped/控制环测试能证明驱动链路工作，不能代替逐指近景检查，也不能证明蒙皮已达到交付质量。

### 保存与重开检查

恢复参考姿势和原材质后另存新文件。重开前落盘骨名、父级与矩阵、Skin 影响骨名及逐顶点 ID/权重对、求值/基础几何、面索引、UV 和材质 ID。记录材质身份与分配；只有材质名称一致，不能证明所有材质参数都一致。

重开后重新解析节点与修改器，旧节点包装引用已经失效。比较全部权重及几何，不能只抽样顶点。分别报告精确差异和容差。添加 Skin 前后偏差、保存重开偏差和动作复位偏差是三种不同测量。

<a id="refinement"></a>

## 5. 修整重点部位

以下为后续修整建议，本次原始体素结果未执行这些人工编辑。修整前保留原始结果，每次局部修改后复测相同动作。

| 已观察或待核查的问题 | 建议评估的下一步 |
|---|---|
| 宽袖在肘部/袖口折叠、塌陷 | 按服装区域修整上臂、前臂、手腕的过渡，检查整段袖子，不只处理肘部一圈顶点 |
| 长衣摆随抬腿拉伸 | 按区域区分衣摆与裤腿/腿部权重；需要独立运动时，评估衣摆骨骼或 UE 布料模拟 |
| 头发/头部混入颈或躯干影响 | 分头发与头部区域查看影响骨名单，清理非预期影响，同时保留所需的颈部/围巾过渡 |
| 邻指一起移动 | 逐指查看影响名单并清理串权重，复测单指弯曲及拇指对掌 |

提高体素分辨率不会增加服装缺少的运动自由度。应根据动作需求选择修权重、增加骨骼或模拟；不能因为所有顶点通过数值检查，就接受明显异常的服装变形。

<a id="evidence"></a>

## 6. Chistatic 实测结果

以下为 2026-10-20 Chistatic 在厘米单位下的试验数据。耗时只描述这台机器和这个网格，不是性能保证。

| 项目 | 实测结果 |
|---|---|
| 几何 | 27,135 顶点 / 53,062 三角面 |
| 骨架 / Skin 影响 | 55 节点 / 54 影响骨 |
| 分辨率 256 / 512 求解耗时 | 1,139 ms / 4,211 ms |
| 两个分辨率：覆盖 / 归一化 | 未赋权 0 / 超出 1e-4 的权重和异常 0；每顶点最多 4 条影响记录 |
| 最大权重和误差 | 1.78814e-7 |
| 512：相对蒙皮前网格偏差 | 最大约 0.0000465 cm |
| 512：保存重开比较 | 权重对、骨名/矩阵、基础/求值几何、面索引、UV、材质 ID 均无差异；材质名称一致 |

选用文件为 `chistatic_GeodesicVoxel_512_raw.max`，同时保留 256 候选和 `chistatic_before_skin.max`。本机证据位于 `D:\AI\work\Chistatic_VoxelSkin_20261020_114542/`，包括试验说明和动作截图。阅读本指南不依赖本机工作目录。

下列截图使用临时灰色材质，保存的试验文件保留原材质。抬臂图展示袖子弯曲，抬腿图展示衣摆随腿运动。

![体素蒙皮后的抬臂与宽袖检查](../images/skinning-geodesic-voxel-arm.png)

![体素蒙皮后的抬腿与衣摆检查](../images/skinning-geodesic-voxel-leg.png)

<a id="handoff"></a>

## 7. 衔接 Biped 与控制器

检查合格的 Skin 可以保留，同时为现有骨架拟合 Biped 和控制器。以原影响节点、骨名、层级和静止矩阵作为绑定依据，让新驱动层适配它们。改变驱动层不需要重新计算体素权重。

后续按 [Biped 重建指南](../biped-rebuild-guide.md)和[控制器迁移指南](../controller-migration-guide.md)选择对应分支。衔接后再次核对权重及几何，并通过实际 Biped 和控制环操作测试网格变形。控制器能工作不代表宽袖和衣摆问题已经解决；烘焙、FBX 与 UE 导出仍需单独验证。

## 开发备注

无。
