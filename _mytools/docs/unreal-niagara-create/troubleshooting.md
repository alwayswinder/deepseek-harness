# Niagara 常见问题与 API 注意事项

本页按现象查询创建闪电链时的排查方法。示例环境与完整步骤见 [创建指南](README.md)，参数编码见 [MCP 参考](mcp-reference.md)。

## 场景中看不到闪电

| 检查项 | 判断方法 | 处理 |
|---|---|---|
| 连接点被地面遮住 | 比较组件世界高度、地面高度及目标原点 | 修改 `TargetOffset`，使连接点处于可见位置 |
| 当前处于放电间歇 | 检查 `User.Intensity` 和当前周期相位 | 等待下一次放电，或使用 `UpdateChain(false)` 检查完整预览 |
| Niagara 未生成粒子 | 检查 Emitter 是否启用、Burst 是否发生、Lifetime 是否有效 | 在单个 Emitter 预览中定位生命周期问题 |
| 材质或 Renderer 错误 | 检查 Ribbon Renderer 及其材质绑定 | 使用已验证材质确认形状，再调整外观 |
| 参数没有写入 | 读取组件上的 `User.Length`、`User.Intensity` | 对齐完整 User 参数名与类型 |
| 资产编译失败 | 读取 Niagara 编译状态和蓝图错误节点 | 先修复错误，再保存并重试 |

截图应结合播放观察。单帧处于发射间隙，不足以证明特效没有工作；编译成功也不足以证明它在场景中可见。

## 闪电偏转、偏移或端点漂移

本例 Niagara 在局部空间工作，蓝图将 Niagara Component 放到起点，并让局部 X 轴朝向终点。不要同时把世界坐标写进局部粒子位置，否则会叠加组件变换。

如果中间粒子持续偏离，检查 Particle Update 的顺序：先从当前 Beam Start/End 重新计算基准位置，再添加抖动。如果端点也抖动，检查抖动是否带有两端为零的包络，以及用于包络的进度是否确实归一化。

本例每个目标使用统一的世界空间偏移。这个偏移不会随目标旋转；若希望偏移跟随模型局部方向，应另行将局部偏移变换到世界空间。

## 闪电没有沿 Actor 顺序推进

先检查三份 Actor 引用及两个组件的绑定顺序，再检查 `HopDelay`、`TravelTime`、`FlashDuration` 和 `PulsePeriod` 的实际类型及值。第二段开始前，第一段的显示窗口需要覆盖足够时间，才能观察到连锁关系。

本例使用关卡的 Game Time 计算相位，所有实例默认共享时间来源。若需要每次调用都从第一段开始的单次技能，需要另外保存触发时间，以 `Now - TriggerTime` 计算相位，并增加激活、结束和再次触发的状态；当前资产没有实现这个接口。

## Actor 移动后没有立即跟随

在播放或模拟中，确认 Event Tick 调用了 `UpdateChain(true)`，Actor Tick 启用，且每帧都重新读取目标位置。第一段应更新距离和旋转，第二段还应更新起点位置。

在编辑器静态场景中，单独移动其他 Actor 不会保证触发控制蓝图的 Construction Script。重新触发控制蓝图构造或显式调用预览函数后再观察；编辑器预览更新与运行时跟随是两项不同验证。

## 目标为空时报错

读取 Actor 位置之前先执行有效性判断。无效时隐藏当前段，避免继续计算位置，同时让执行流进入下一段处理；不要让第一段的无效分支中断整条控制函数。

本例清空中间引用会同时隐藏两段，因为两段分别以它为终点和起点。其他目标的失效只影响与该目标有关的段。

## 蓝图与 Python API

### 浮点类型被意外创建成整数

本构建中，`BlueprintEditorLibrary.get_basic_type_by_name('float')` 不会创建预期的浮点类型，而是警告后退回整数。创建数值变量使用：

```python
number_type = unreal.BlueprintEditorLibrary.get_basic_type_by_name('real')
```

这会得到本构建的 Double 数值引脚。Niagara 的 Float 参数仍然保持 Float，蓝图连线需要允许数值转换。把 `0.16` 的跳转延迟保存成整数，会破坏延迟效果。

### Vector 类型查找失败

本构建中 `pin_type_from_text('vector')` 没有找到目标类型。使用已有结构体来创建引脚类型：

```python
vector_type = unreal.BlueprintEditorLibrary.get_struct_type(
    unreal.Vector.static_struct()
)
```

### 改变量类型后旧节点报错

修改变量类型后，旧 Getter 或已有转换节点可能仍然保留原类型。重新生成相关 Getter、转换与连线，再编译；不要只更改变量声明后继续设置实例默认值。必要时只重建受影响的自建函数图，保留其他逻辑。

### 设置实例可编辑后仍不能赋值

调用 `set_blueprint_variable_instance_editable` 后需要编译 Blueprint，使生成类更新。随后重新获取生成类、CDO 和受重实例化影响的对象引用，再设置实例值；变量定义、CDO 默认值和关卡实例覆盖值需要分别确认。

### 调用自建蓝图函数时参数报错

本会话调用示例函数时使用以下形式：

```python
chain_actor.call_method('UpdateChain', (False,))
```

把布尔值直接作为第二个参数会得到要求 `tuple` 的类型错误。Python 反射方法的摘要签名可能不够精确，应以当前构建的实际调用结果核对。

### 无法设置 can_ever_tick

本构建的 `ActorTickFunction` 可编辑字段包含 `start_with_tick_enabled`，没有暴露 `can_ever_tick`。不要强行调用不存在的编辑器属性；接入 Tick 事件后，在运行时用 `is_actor_tick_enabled()` 检查实际状态。本例该状态为真。

### 重复执行脚本产生重复组件

`list_member_variable_names()` 的输出不能作为蓝图组件是否存在的唯一判断依据。本会话的输出没有列出实际存在的 `Link_01` 和 `Link_02`。重跑脚本前，应通过当前可用的组件或子对象查询接口确认对象；不要仅凭变量列表再次添加组件。

### 未发现蓝图 DSL 工具

先通过工具发现和符号查询确认能力。当前会话没有可用的 `BlueprintToolset` 或 `BlueprintDslToolset`，已有的节点与引脚编辑 API 可以完成本例。其他会话发现这些工具后，可以按其实际文档使用；不能假设磁盘上的工具源码已经注册到当前编辑器。

## MCP 无法连接

`ConnectionRefused` 需要先核对编辑器是否启动、服务器日志中的端口以及当前项目。本机的旧客户端地址是 8000，当前运行服务是 8001，改为实际端口后连接成功。不要仅根据配置文件推断运行中的监听地址。

如果连接成功但参数校验失败，重新读取目标工具 Schema。尤其注意发现工具的数组参数、对象引用的 `refPath`，以及 Niagara 输入的 `struct` / `value` 包装。

## 模拟模式下资产工具报错

本会话在模拟期间调用 `EditorAssetLibrary.load_blueprint_class`，得到编辑器正处于播放模式的错误。资产编辑、复制和保存应在停止模拟后执行；模拟中使用已持有的运行时类型或遍历运行世界 Actor。

本例测试通过 `get_game_world()` 取得运行世界，并在其中找到闪电链实例。不要用编辑器世界的 Actor 来验证运行时 Tick、位置或引用清空效果。

## 保存后重开丢失设置

检查资产和关卡是否都已保存。Niagara System、材质和 Blueprint 是独立资产；目标 Actor 引用、实例参数和摆放保存在关卡中。编译之后再保存，记录各次操作的实际返回值。

迁移到另一个项目时，需要同时迁移 Niagara、蓝图及其材质等依赖；三个关卡 Actor 引用需要在目标关卡重新指定。本例不包含跨项目迁移或打包验证。
