# Niagara 常见问题与 API 注意事项

本页供闪电链、冰球和魔法阵创建过程中的故障查询。完整操作见 [闪电链教程](chain-lightning.md)、[冰球教程](frost-chain.md) 与 [魔法阵教程](magic-circle.md)，参数编码见 [MCP 参考](mcp-reference.md)。

## 场景中看不到特效

先确认当前播放状态，再检查组件、粒子和材质。触发式特效在静止编辑器中隐藏属于正常表现。

| 检查项 | 判断与处理 |
|---|---|
| 没有触发 | 在运行实例上调用相应 Trigger 函数，或开启自动触发后开始 Play/Simulate |
| 关卡关闭了闪电自动演示 | 当前 `ChainLightning_MCP.AutoTriggerOnBeginPlay = false`；独立演示时开启，并关闭冰球自动触发 |
| 连接点在地面内 | 对比目标原点和地面高度，调整 `TargetOffset` 或发射 Actor 位置 |
| 目标引用失效 | 任一绑定目标失效时，两种控制蓝图都会停止；重新指定后再触发 |
| Niagara 没有粒子 | 检查 Emitter 启用状态、生成模块、寿命和 Sim Cache 的粒子数量 |
| 组件有粒子却不可见 | 检查 Visibility、材质、粒子颜色透明度，以及 Renderer 使用的材质 |
| 资产未正确编译 | 同时核对栈输入、编译状态和运行粒子数据；必要时停止模拟后强制编译 |

单帧隐藏不等于创建失败；闪电会自行结束，截图也可能处于发射前或结束后。

## 闪电起点或飞行顺序不对

当前顺序是特效 Actor 位置 → SourceActor → MiddleActor → EndActor，由三个组件负责三跳。首跳不是从 SourceActor 出发。检查 `TriggerChain` 是否捕获当前发射位置和时间，以及 Tick 是否接入 `UpdateTriggeredChain`。

默认跳段启动时间为 0、0.28、0.56 秒。`HopDelay` 是头部到达后的等待时间；`TravelTime` 是本跳飞行时间。`PulsePeriod` 与旧 `UpdateChain` 不参与当前触发播放。时间计算见 [三跳计算](chain-lightning.md#3-每帧计算三跳)。

## 闪电偏移或端点漂移

闪电粒子在组件局部空间计算；蓝图设置组件世界位置，并令局部 X 轴朝向终点。把世界坐标写进局部粒子位置会叠加组件变换。

Particle Update 先恢复束上基准位置，再叠加抖动。抖动在两端衰减为零，用于计算衰减的 Ribbon 进度必须覆盖 0～1。当前 `TargetOffset` 是世界空间偏移，不跟随目标旋转；连接骨骼插槽需要另读 Socket Transform。

## 冰球不弹跳或连续命中同一个物体

检查三个目标引用是否有效且互不相同，`IsBouncing` 和 Actor Tick 是否启用。命中后索引按 `(CurrentIndex + RandomIntegerInRange(1,2)) % 3` 更新；两个不同索引如果引用同一个 Actor，仍会表现为重复命中同一物体。

冰球每帧读取当前目标位置，用恒速插值接近目标；进入 3 cm 范围后命中。它没有碰撞检测，因此不会被障碍物阻挡。目标移动速度超过冰球时，无法保证追上。

## 冰球越播越多或拖尾粘在球上

球核与光晕各只发射一个粒子，Burst 开启循环次数限制，并关闭按寿命杀死。不要在每次 Tick 重新激活组件或生成新的 Actor。

旋转冰屑使用局部空间，拖尾使用世界空间。拖尾只在新粒子出生时读取组件位置，已有粒子留在路径上。InitializeParticle 中配置实际 Lifetime，再用归一化年龄淡出；本例拖尾为 0.46 秒，冰屑为 0.7 秒。

只修改后续赋值模块的 `Particles.Lifetime` 可能使初始化得到的派生值与寿命不一致；需要同步 InitializeParticle。栈配置正确但运行数据异常时，按 [强制编译与采样](mcp-reference.md#强制编译与运行数据核对) 核对，而不是仅延长寿命。

## 命中冰霜被下一次命中重置

当前 ImpactFX 是固定复用组件。下一次命中会重新初始化它；目标距离较近或提高速度时，上一次尚未结束的光环和碎冰会被重置。需要多个命中外观同时存在时，应增加有界组件池和独立回收逻辑。

## Actor 移动后没有跟随

在 Play/Simulate 中确认 Tick 启用，更新函数每帧重新读取运行世界的目标。控制 Actor 保留独立 Scene Root，运动组件不会拖动发射位置。

静止编辑器中，移动另一个 Actor 不保证触发控制蓝图的 Construction Script。两种示例的构造函数都会停止特效；运行时追踪应在模拟中检查。

## 贴地法阵随相机旋转

固定法线只保证贴地，还需要固定平面内方向。使用 `CustomFacingVector` 与 `CustomAlignment`，并实际写入 `Particles.SpriteFacing` 和 `Particles.SpriteAlignment`。如果贴图自身带时间旋转，还要单独移除该旋转。完整设置见 [固定底盘朝向](magic-circle.md#3-固定底盘朝向)。

## 法阵呼吸不明显或边角出现重复图案

呼吸需在目标曝光和背景下观察完整周期；高亮发光接近饱和时，小幅正弦变化可能被色调映射压缩。曲线和当前倍率见 [配置发光与呼吸](magic-circle.md#4-配置发光与呼吸)。UV 变换后的重复边角先检查 Texture2D 的 Address X/Y，本例使用 Clamp；调整寻址不会固定 Sprite 朝向。

## 螺旋光带乱连

检查出生位置是否有序，以及 Ribbon ID 和连接顺序。随机圆柱位置加旋转速度不能保证得到参考图那样的连续螺旋。本例采用预制螺旋网格和 Mesh Renderer，结构见 [组合螺旋与漂浮层](magic-circle.md#5-组合螺旋与漂浮层)。

## 蓝图与 Python API

本构建部分 Python 反射接口与常见版本不同。先使用 `get_symbol / search_symbols` 查询实际 API，再创建节点与变量。

| 现象 | 本构建的处理 |
|---|---|
| `get_basic_type_by_name('float')` 退回整数 | 使用 `'real'`，得到 Double 数值引脚；连接 Niagara Float 时允许类型转换 |
| Vector 类型查找失败 | 使用 `get_struct_type(unreal.Vector.static_struct())` |
| 数学节点不能设置小数 | 先连接确定类型的数值引脚，再设置常量默认值 |
| 改变量类型后旧节点报错 | 重建相关 Getter、转换与连线，再编译 |
| 设置实例可编辑后仍不能赋值 | 编译蓝图，重新获取生成类、CDO 和受重实例化影响的引用；内部变量不直接写关卡实例 |
| `call_method` 参数类型错误 | 无参函数传空 tuple，例如 `actor.call_method('TriggerChain', ())` |
| `can_ever_tick` 属性不存在 | 当前未暴露该字段；接入 Tick 事件，运行中检查 `is_actor_tick_enabled()` |
| 重跑脚本重复添加组件 | 用实际组件或子对象查询接口核对，不能只凭成员变量名称列表判断 |
| `CustomInput(input_name=...)` 报参数错误 | 创建 `unreal.CustomInput()`，再用 `set_editor_property('input_name', ...)` 赋值 |

默认值与关卡实例覆盖值分别存储。例如闪电类默认开启自动触发，但本关卡实例关闭；检查实际实例，不能只读 CDO。

## MCP 连接或调用失败

`ConnectionRefused` 时检查编辑器、运行日志中的 MCP 端口和当前项目。本机服务地址为 8001；其他环境使用实际监听地址。

HTTP 400 或参数校验失败时，先确认顶层 MCP 发现入口与 `call_tool` 的两层调用方式，再读取目标 Schema。常见差异包括发现工具的数组参数、对象的 `refPath`、输入的 `struct/value` 包装，以及符号查询字段 `pattern/max_results`。

## 模拟中资产工具失败或找不到运行 Actor

资产加载、编辑和保存放在停止模拟之后执行。模拟期间优先使用已有引用、明确的资产路径或遍历运行世界 Actor，不用编辑器 Actor 验证运行时状态。

启动模拟后，轮询实际运行 Actor 是否创建，避免只等待固定时间就取数组第一个元素。采样中以 Game Time 判断已经过去的播放时长；本构建用 `await asyncio.sleep(0.03)` 让编辑器前进，再读取实际游戏时间，不能按循环次数推算秒数。

## 截图失败或画面与视口不同

CaptureEditorViewport 要求目标视口可见，后台、隐藏或最小化可能使它拒绝捕获。离屏 Capture 可以用于验证运行世界，但不会复现编辑器覆盖层和视口的时间历史。读取响应中的图片内容块；`urn:toolresult:...` 文本不等于可读的文件路径。

## 保存后重开丢失设置

编译并分别保存材质、Niagara、Blueprint 和关卡，检查返回值。目标引用、实例参数与摆放保存在关卡；模拟中的修改不会自动成为编辑器场景内容。

迁移时连同资产依赖一起迁移，并在目标关卡重新指定三个 Actor。当前验证不包含跨项目迁移、打包和多人运行。
