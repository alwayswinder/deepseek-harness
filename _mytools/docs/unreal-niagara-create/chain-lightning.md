# 创建触发式闪电链

本教程创建一条从特效 Actor 出发、依次穿过三个目标、最后自动结束的闪电链。先完成 [环境准备](README.md#准备环境)，再按下面的顺序创建单段闪电和控制蓝图。

## 目录

- [资产与播放入口](#资产与播放入口)
- [制作闪电的 Niagara 系统](#制作闪电的-niagara-系统)
- [创建控制蓝图](#创建控制蓝图)
- [验证播放](#验证播放)

## 资产与播放入口

| 资产 | 路径或名称 |
|---|---|
| 控制蓝图 | `/Game/VFX/ChainLightning/BP_ChainLightning` |
| 单段闪电 | `/Game/VFX/ChainLightning/NS_ChainLightning_MCP` |
| 闪电材质 | `/Game/VFX/Lightning/M_Lightning_MCP` |
| 关卡实例 | `ChainLightning_MCP` |
| 触发 / 取消 | `TriggerChain` / `StopChain` |

一次触发的顺序为“控制 Actor 位置 → SourceActor → MiddleActor → EndActor”。当前三个引用对应 Cube、Cube2、Cube3。再次触发会立即重启；任一目标无效时整条链停止。

## 制作闪电的 Niagara 系统


### 1. 选择可验证的起点

在当前项目中，复制 `/Game/VFX/Lightning/NS_Lightning_MCP` 到自己的特效目录，可以得到已经配置好的 Ribbon 闪电。示例的 `NS_ChainLightning_MCP` 就使用这种方式创建。

从其他模板或空系统开始时，先在该编辑器中发现可用的 Beam / Ribbon 资产与模块，再配置下面的计算关系。模板名称和默认模块栈因引擎构建而异，不能把现有资产路径当作所有 UE 安装都具备的入口。

### 2. 确认材质能参与 Niagara 渲染

本例复用已有材质。自制材质时，需要将发光输出接到 `Emissive Color`，将粒子颜色和透明度接入实际输出，并确认材质支持 Niagara Ribbon。Unlit 与 Additive 可作为发光闪电的制作选择；材质更改后需要编译，确认 Renderer 使用的确实是这份材质。

先使用容易辨认的颜色和宽度检查形状，再调整发光和光晕。过高的亮度会掩盖闪电的弯折与分支。

### 3. 建立主干模块栈

下面是本例主干的配置关系。模块之间存在输入依赖，修改时应同时检查拓扑和输入值。

| 阶段 | 模块或属性 | 作用 |
|---|---|---|
| Emitter 属性 | `Local Space = true` | 闪电形状在组件局部坐标中计算 |
| Emitter Update | `EmitterState` | 循环与发射器生命周期 |
| Emitter Update | `BeamEmitterSetup` | 计算起点、终点 |
| Emitter Update | `SpawnBurst_Instantaneous` | 每轮生成主干粒子；本例主干为 49 个 |
| Particle Spawn | `InitializeParticle` | 粒子寿命和初始属性 |
| Particle Spawn | `SpawnBeam` | 建立沿束排列的 Ribbon 粒子顺序 |
| Particle Spawn | `BeamWidth` | 新粒子生成时读取宽度 |
| Particle Update | `ParticleState` | 更新粒子年龄并处理寿命结束 |
| Particle Update | `Color` | 亮度和透明度 |
| Particle Update | Set Parameters：`Particles.Position` | 每帧恢复到当前束上的基准位置 |
| Particle Update | `JitterPosition` | 在基准位置上增加闪电抖动 |
| Renderer | Ribbon Renderer | 使用闪电材质绘制主干 |

用于位置插值的 `t` 必须覆盖 0～1，并且与 Ribbon 的连接顺序一致。本例现有模板提供可用于该计算的 `Particles.RibbonLinkOrder`；另建模板时要确认这一点，必要时另外计算归一化进度。

### 4. 暴露参数并计算局部形状

Niagara User Parameters 中创建或确认这些 Float 参数：`User.Length`、`User.Width`、`User.Jitter`、`User.Intensity`。变量名必须与外部设置时的名字完全一致。

本例主干起点是局部原点，终点沿局部 X 轴：

```hlsl
// Beam End 的单一表达式
float3(User.Length, 0, 0)
```

在 Particle Update 中，先按起终点重新计算每个粒子的基准位置：

```hlsl
// Particles.Position 的单一表达式
Emitter.BeamStart + (Emitter.BeamEnd - Emitter.BeamStart) * Particles.RibbonLinkOrder
```

抖动只改变局部 Y/Z，并用 `sin(pi * t)` 在两端衰减。下面是本例的主干抖动表达式，可以填入 `Jitter Offset`：

```hlsl
sin(3.14159265 * Particles.RibbonLinkOrder) * User.Jitter * float3(0.0, 0.6 * sin(31.0 * Particles.RibbonLinkOrder + floor(System.Age * 14.0) * 1.7) + 0.4 * sin(91.0 * Particles.RibbonLinkOrder + floor(System.Age * 14.0) * 2.3), 0.65 * sin(43.0 * Particles.RibbonLinkOrder + floor(System.Age * 14.0) * 2.1) + 0.35 * sin(127.0 * Particles.RibbonLinkOrder - floor(System.Age * 14.0) * 1.3))
```

先重算基准位置，再叠加抖动，避免偏移逐帧累积。两端衰减保证主干端点仍落在目标连接点；宽度和颜色缩放分别读取 `User.Width` 与 `User.Intensity`。

### 5. 协调粒子循环与链路时序

Niagara 内部负责持续刷新可见的闪电形状，蓝图通过 TriggerChain 和 StopChain 控制一次放电何时开始和结束。本例各 Emitter 的 Loop Duration 为 `0.12 s`，InitializeParticle Lifetime 为 `0.115 s`；它们与蓝图每跳的飞行时间是两组不同参数。

这一配置在本场景已通过视觉验证，但不表示任意帧率下都没有短暂空隙。调整寿命、循环或 Burst 后，需要检查间歇消失和多批粒子同时连接的问题；不要直接提高寿命而忽略 Ribbon 分组。

### 6. 增加细分支

主干验证后，再添加较细、较短的分支。分支起点取主干某个进度处的位置，并使用与主干相同的时间和偏移计算，保持连接；分支末端可使用独立方向和衰减宽度。

本例包含 `Beam`、`Branch_A`、`Branch_B`、`Branch_C`、`Branch_D` 五个 Emitter。分支仍属于同一段闪电，其长度和抖动会随组件参数更新。


## 创建控制蓝图

单段闪电在局部 X 轴上生长，蓝图负责将三段组件放到各跳的当前位置，并控制短电弧的头尾进度。

### 1. 添加组件和变量

创建 Actor 蓝图，保留独立的 Scene Root，加入 `Link_01`、`Link_02`、`Link_03` 三个 Movable Niagara Component，均使用单段闪电 System。控制函数统一激活、隐藏和停止组件；不要将移动的特效组件作为控制 Actor 的根。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `SourceActor / MiddleActor / EndActor` | 在关卡指定 | 第一、第二、第三个目标 |
| `AutoTriggerOnBeginPlay` | 类默认 true | BeginPlay 是否触发一次；当前关卡实例为 false |
| `TravelTime` | 0.22 秒 | 每跳头部到达目标的时间，计算时至少 0.02 秒 |
| `HopDelay` | 0.06 秒 | 头部到达后，下一跳开始前的间隔，计算时不小于 0 |
| `FlashDuration` | 0.12 秒 | 头部到达后的亮度衰减时间，计算时至少 0.02 秒 |
| `BoltFraction` | 0.45 | 短电弧相对本跳距离的长度比例，计算范围 0.05～1 |
| `Width / Jitter / Intensity` | 5 / 28 / 1 | 宽度、抖动幅度、亮度缩放 |
| `TargetOffset` | (0,0,70) cm | 加在各目标世界位置上的偏移 |

另存运行状态 `ChainActive`、`TriggerTime` 和 `LaunchLocation`。`PulsePeriod` 不参与当前触发播放；旧 `UpdateChain` 图没有接入当前事件入口。

### 2. 建立触发与停止函数

`TriggerChain` 先调用 `StopChain`，记录当前 Actor 世界位置为 `LaunchLocation`，记录 Game Time 为 `TriggerTime`，设置激活状态，清零三段长度并重置 Niagara，启用 Tick，然后更新一次。发射位置只在触发时捕获；目标位置在播放中持续读取。

`StopChain` 清除激活状态，隐藏三段组件，将亮度设为 0，停用 Niagara 并关闭 Actor Tick。Construction Script 调用停止函数；BeginPlay 先停止，再根据 `AutoTriggerOnBeginPlay` 决定是否触发。

### 3. 每帧计算三跳

Tick 调用 `UpdateTriggeredChain`。先检查状态和全部目标有效性；任一目标无效时停止，并跳过位置读取。三个跳段使用下面的起终点，`HopIndex` 从 0 开始。

| 组件 | 起点 | 终点 |
|---|---|---|
| `Link_01` | `LaunchLocation` | SourceActor 位置 + 偏移 |
| `Link_02` | SourceActor 位置 + 偏移 | MiddleActor 位置 + 偏移 |
| `Link_03` | MiddleActor 位置 + 偏移 | EndActor 位置 + 偏移 |

创建 `RenderTriggeredHop(StartPoint, EndPoint, HopIndex, Effect)`，为每跳计算下列量。此处为计算伪代码，参数先按表中范围限制。

```text
Age = Now - TriggerTime
LocalAge = Age - HopIndex * (TravelTime + HopDelay)
Head = clamp(LocalAge / TravelTime, 0, 1)
Tail = clamp((LocalAge - TravelTime * BoltFraction) / TravelTime, 0, 1)
Fade = 1 - clamp((LocalAge - TravelTime) / FlashDuration, 0, 1)

Component.WorldLocation = lerp(StartPoint, EndPoint, Tail)
Component.WorldRotation = FindLookAtRotation(StartPoint, EndPoint)
User.Length = distance(StartPoint, EndPoint) * (Head - Tail)
User.Intensity = Intensity * Fade
Visible = LocalAge 位于 [0, TravelTime + FlashDuration]
```

隐藏时将亮度设为 0。默认三跳启动时间为 0、0.28、0.56 秒；约 0.90 秒后调用 `StopChain`。短电弧尾部还可能在衰减时移动，因此相邻跳的尾光可以短暂重叠；最终长度归零后仅剩不可见状态。

## 验证播放

1. 将蓝图放入关卡，指定三个不同的目标 Actor，设置适合模型原点的连接偏移。
2. 在 Play 或 Simulate 的实例上调用 `TriggerChain`，确认首跳从控制 Actor 发出，而不是从第一个 Cube 发出。
3. 确认三跳依次出现，最后停止，并在等待后保持隐藏。
4. 再次触发确认从头播放；主动停止和清空任一目标时确认全部隐藏。
5. 停止模拟，编译并保存 System、Blueprint 和关卡。

本例记录的三跳首次可见时间约为 0.0167、0.2878、0.5711 秒，已验证结束不循环和重启、取消行为，见 [原始验证数据](evidence/triggered-lightning.json)。遇到隐藏、偏移或 API 问题时查阅 [排查参考](troubleshooting.md)。
