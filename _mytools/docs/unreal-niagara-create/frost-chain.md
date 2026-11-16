# 创建无限弹跳冰球

本教程制作带冰裂纹球核、旋转冰屑、寒雾拖尾和命中冰霜的冰球，并让它在三个 Actor 之间持续弹跳。先完成 [环境准备](README.md#准备环境)，再创建外观和弹跳控制；本文的冰球为 Niagara Sprite 表现。

## 目录

- [资产与使用参数](#资产与使用参数)
- [创建冰霜材质](#创建冰霜材质)
- [创建飞行系统](#创建飞行系统)
- [创建命中系统](#创建命中系统)
- [创建弹跳控制蓝图](#创建弹跳控制蓝图)
- [编译与验证](#编译与验证)
- [适用范围](#适用范围)

## 资产与使用参数

所有冰球资产位于 `/Game/VFX/FrostChain/`。当前关卡实例为 `FrostChain_MCP`。

| 资产 | 用途 |
|---|---|
| `BP_FrostChain` | 发射、追踪、命中、随机换目标和停止 |
| `NS_FrostOrb` | 球核、光晕、旋转冰屑和世界空间拖尾 |
| `NS_FrostImpact` | 扩散光环和碎冰 |
| `M_IceCore` | 蓝色冰球和冰裂纹 |
| `M_FrostHalo / M_FrostMist` | 光晕和寒雾 |
| `M_IceShard / M_FrostRing` | 冰屑和命中光环 |

| 蓝图变量 | 当前值 | 用途 |
|---|---|---|
| `Target1 / Target2 / Target3` | Cube / Cube2 / Cube3 | 三个不同的弹跳目标 |
| `AutoTriggerOnBeginPlay` | true | 开始运行时发射一颗冰球 |
| `ProjectileSpeed` | 650 cm/s | 恒速追踪，计算时至少 1 cm/s |
| `BouncePause` | 0.08 秒 | 命中后暂停，计算时不小于 0 |
| `TargetOffset` | (0,0,75) cm | 目标原点的世界空间命中偏移 |

调用 `TriggerFrostChain` 发射；再次调用会重置计数并从发射位置重新开始。调用 `StopFrostChain` 立即停止全部组件。关闭自动触发后，可由技能、按键或交互事件调用触发函数。

## 创建冰霜材质

创建五份 Unlit、双面、支持 Niagara Sprites 的材质。`M_IceCore` 使用 Translucent，其余使用 Additive。将 Particle Color 的 RGBA 乘进最终输出，使 Niagara 能控制透明度。

球核以 UV 映射的圆形轮廓和伪球面法线形成体积感，用细胞距离差表现裂纹，用较亮的边缘和高光区表现冰面；时间输入让纹理缓慢变化。光晕和寒雾使用径向衰减，碎冰使用细长菱形，命中光环使用窄环与径向尖刺。

本例用 Material Custom 节点输出 Float4，再用 Component Mask 将 RGB 接到 Emissive Color、A 接到 Opacity。Custom 节点支持完整 HLSL 代码和 `return`；Niagara 栈的 HLSL 输入只接受单个表达式，二者写法不同。

## 创建飞行系统

创建 `NS_FrostOrb` 并加入四个 CPU Emitter。先查询模板和实际模块栈；本构建可用的模板位于 `/Niagara/DefaultAssets/Templates/Emitters/`。

| Emitter | 模板 | Local Space | 主要配置 |
|---|---|---|---|
| `IceCore` | `SingleLoopingParticle` | true | 只生成 1 个粒子，不按寿命杀死；Sprite 约 72 cm |
| `FrostHalo` | `SingleLoopingParticle` | true | 只生成 1 个粒子，不按寿命杀死；Sprite 约 160 cm |
| `OrbitingIce` | `Minimal` | true | SpawnRate 48/s，Lifetime 0.7 秒，Sprite 5×16 cm |
| `ColdTrail` | `Minimal` | false | SpawnRate 110/s，Lifetime 0.46 秒，Sprite 逐渐变大并淡出 |

`DefaultSystem` 在本构建中自带 Fountain Emitter。使用它创建新 System 后，先移除 Fountain，避免额外喷泉混入效果；其他模板也要先检查实际内容。

### 1. 保留球核与光晕

将两层 Burst 的 `Spawn Count` 设为 1，开启 `UseLoopCountLimit` 并设 `Loop Count Limit = 1`。在 Particle State 中关闭 `Kill Particles When Lifetime Has Elapsed`。这使每层保持一个粒子；蓝图负责结束时隐藏并停用整个组件。

两层粒子的位置保持局部原点，Sprite Size 用正弦做少量呼吸变化。球核材质与外围光晕分层，避免单独增加发光强度掩盖冰裂纹。

### 2. 让冰屑围绕球体旋转

在 Minimal 模板的 Emitter Update 添加 SpawnRate，并在 InitializeParticle 中设置寿命。Particle Spawn 设置初始颜色和尺寸；Particle Update 在 ParticleState 后用 Set Parameters 更新位置、旋转和透明度。

本例使用以下位置表达式，粒子在半径约 43 cm 的局部轨道上运动，Z 方向摆动约 22 cm：

```hlsl
float3(cos(Emitter.Age*5.5+Particles.UniqueID*2.39996)*43, sin(Emitter.Age*5.5+Particles.UniqueID*2.39996)*43, sin((Emitter.Age*5.5+Particles.UniqueID*2.39996)*1.7)*22)
```

颜色的 RGB 保持白色，由材质决定冰蓝色；透明度随寿命减少：

```hlsl
float4(1,1,1,pow(saturate(1-Particles.NormalizedAge),1.6))
```

### 3. 留下寒雾拖尾

ColdTrail 必须使用世界空间。新粒子从组件当时的世界位置产生，旧粒子留在路径上；不要在 Update 中把所有粒子的位置重设为当前球体位置。

将 `InitializeParticle.Lifetime` 设为 0.46 秒，让初始化得到的寿命派生值与实际寿命一致。使用同样的淡出表达式，并将尺寸设为 `(20 + NormalizedAge * 45)`。在当前 650 cm/s 的速度下，路径上的雾迹会及时消散。

## 创建命中系统

创建 `NS_FrostImpact`，使用两个 `SimpleSpriteBurst` 模板 Emitter，并保持世界空间。Emitter 生命周期为单次播放，完成后不再发射；每次命中由蓝图重新初始化。

| Emitter | 数量 | 寿命 | 表现 |
|---|---|---|---|
| `ImpactRing` | 1 | 0.40 秒 | 使用环形材质，尺寸从 45 增长到约 245 cm，并淡出 |
| `IceBurst` | 32 | 0.50 秒 | 使用冰屑材质，初速度向外散开约 210 cm/s，旋转并淡出 |

IceBurst 在 Spawn 中设置分散速度，Update 使用 SolveForcesAndVelocity 移动，再设置最终颜色和旋转。每次命中复用同一个 ImpactFX 组件；当飞行时间很短或目标距离很近时，后一次命中会重置尚未播完的上一轮命中外观。

## 创建弹跳控制蓝图

创建 `BP_FrostChain`，使用独立的 Scene Root，添加两个 Movable Niagara Component：`IceOrb` 绑定飞行系统，`ImpactFX` 绑定命中系统，二者关闭自动激活。移动 IceOrb 时保持 Actor 根位置不变，以便再次触发仍从发射位置出发。

### 1. 管理运行状态

增加运行变量 `IsBouncing`、`CurrentPosition`、`TargetIndex`、`LastHitIndex`、`HitCount` 和 `NextMoveTime`。目标索引使用 0、1、2；尚未命中时 `LastHitIndex = -1`。

`StopFrostChain` 清除运行状态，隐藏并停用两个 Niagara 组件，关闭 Actor Tick。Construction Script 调用停止函数；BeginPlay 先停止，再按自动触发开关决定是否发射。

### 2. 从特效位置发射

`TriggerFrostChain` 先停止旧播放，将 Actor 世界位置写入 `CurrentPosition`，将 `TargetIndex`、`HitCount` 和 `NextMoveTime` 设为 0，将 `LastHitIndex` 设为 -1，再显示并重置 IceOrb，启用运行状态和 Tick。首次目的地固定为 Target1。

### 3. 每帧追踪当前目标

Tick 调用 `UpdateFrostChain(DeltaSeconds)`。先确认正在播放和三个 Actor 引用都有效；失效时调用停止函数并跳过位置读取。到达 `NextMoveTime` 后，用当前目标世界位置加偏移作为终点。

```text
Destination = Target[TargetIndex].WorldLocation + TargetOffset
CurrentPosition = VInterpTo_Constant(
    CurrentPosition, Destination, DeltaSeconds, max(ProjectileSpeed, 1))
IceOrb.WorldLocation = CurrentPosition

if distance(CurrentPosition, Destination) <= 3 cm:
    OnFrostHit()
```

当前实现用三个 Actor 变量和选择节点取得终点；伪代码中的 `Target[index]` 表达选择关系。每帧重新读取目标位置，因此目标移动时冰球会追踪新的终点。命中按与终点的距离判断，不依赖物理碰撞。

### 4. 命中后选择下一个目标

`OnFrostHit` 将当前目标写入 `LastHitIndex`，增加 `HitCount`，把 ImpactFX 放到命中位置并显示、重置、激活。然后选择下一个索引：

```text
TargetIndex = (TargetIndex + RandomIntegerInRange(1, 2)) % 3
NextMoveTime = GameTimeSeconds + max(BouncePause, 0)
```

候选目标是另外两个索引，所以不会连续命中同一个绑定目标；之前命中过的目标仍可再次命中。`HitCount` 用于观察播放，不参与结束判断。使用三个不同的 Actor 引用，才能保证不同索引也对应不同目标。

## 编译与验证

1. 编译材质，确认 Sprite Renderer 使用对应材质。
2. 编译两个 System，等待 UpToDate，并检查无错误、无警告。需要强制重新编译时，使用 [本项目的辅助接口](mcp-reference.md#强制编译与运行数据核对)。
3. 编译 Blueprint，保存全部资产及关卡，给实例绑定三个目标。
4. 模拟运行并触发；检查首跳、持续弹跳、移动目标、重新触发、主动停止和目标失效。
5. 使用 Sim Cache 核对长时间播放后的粒子数量与年龄，确认球核不增加、旧拖尾会死亡。

本例连续 14 次命中后仍在播放，只有两个 Niagara 组件。采样得到球核 1、光晕 1、冰屑 34、拖尾 51；最老拖尾粒子约 0.458 秒。移动目标命中误差为 0 cm。原始记录见 [运行验证](evidence/frost-chain.json) 和 [最终编译与保存状态](evidence/frost-final-status.json)。

## 适用范围

当前版本固定三个绑定目标，无次数、持续时间和距离上限；任一绑定目标失效时整颗冰球停止。它没有伤害、减速、敌我筛选、障碍物检测或多人同步。有限轮次的验证只能确认这些轮次内持续播放和粒子回收，不能代替无限时长压力测试。
