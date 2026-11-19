# Niagara MCP 调用参考

本页供已有 MCP 调用能力的开发者查询 UE 5.9 当前构建中的工具入口，覆盖闪电链、冰球和魔法阵。JSON 示例是 JSON-RPC 请求体；通过现有 MCP 客户端发送，HTTP 会话初始化、会话标识和通知由客户端管理。主教程见 [创建指南](README.md)。

## 发现入口

当前服务器使用两层调用：顶层 MCP 工具提供发现和分发，具体功能以 Toolset + Tool 的形式注册。不要将内部 Toolset 名当作顶层 MCP 工具直接调用。

先使用 MCP 的 `tools/list` 方法读取顶层工具，再调用发现工具：

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_toolsets","arguments":{}}}
```

读取指定 Toolset 的工具说明：

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"describe_toolsets","arguments":{"toolset_names":["NiagaraToolsets.NiagaraToolset_System"],"include_schemas":false}}}
```

读取准备调用的工具 Schema：

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"describe_tools","arguments":{"tool_names":["NiagaraToolsets.NiagaraToolset_System.GetSystemSummary","NiagaraToolsets.NiagaraToolset_System.SetStackInputData"]}}}
```

`describe_toolsets` 要求非空的 `toolset_names` 数组；`describe_tools` 要求非空的 `tool_names` 数组。这两个字段不能互换。

## 调用具体工具

例如查询闪电系统摘要：

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "call_tool",
    "arguments": {
      "toolset_name": "NiagaraToolsets.NiagaraToolset_System",
      "tool_name": "GetSystemSummary",
      "arguments": {
        "system": {
          "refPath": "/Game/VFX/ChainLightning/NS_ChainLightning_MCP.NS_ChainLightning_MCP"
        }
      }
    }
  }
}
```

本构建的对象引用通常以 `{"refPath":"..."}` 表示；具体字段以 Schema 为准。`/Game/` 是项目 Content 的虚拟根，不是磁盘路径。

资产引用使用包含对象名的完整对象路径，例如 `/Game/VFX/MagicCircle/M_MC_Runes.M_MC_Runes`。`unreal.load_asset` 可先加载包路径，再把返回的对象交给编辑器内 `call_tool`；不要假定每个工具的 `refPath` 都接受省略 `.对象名` 的路径。关卡 Actor 可通过 `EditorActorSubsystem.get_all_level_actors()` 按标签筛选，得到实际对象后继续操作。

`search_symbols` 使用正则表达式 `pattern` 和数量上限 `max_results`，不接受 `query`、`limit`，也不把 `*Name*` 当作通配符。例如传入 `{"pattern":"Niagara.*[Cc]ompile","max_results":30}`，可在本构建中发现编译相关工具和项目辅助函数。

## Niagara 查询顺序

| 工具 | 查询内容 |
|---|---|
| `GetSystemSummary` | 系统名、User 参数、Emitter 摘要 |
| `GetEmitterTopology` | 模块所属脚本栈、模块名、输入名、Renderer |
| `GetEmitterInputValues` | 各模块实际输入值 |
| `GetEmitterData` | Emitter 属性；`propertyValues` 是需要再次解析的 JSON 字符串 |
| `SetStackInputData` | 修改定位到的模块输入 |
| `GetSystemCompileState` | 编译完成后的错误、警告和过期状态 |

先查拓扑再写输入。把模块名、脚本名、输入名从响应中取出，避免使用界面显示名称去猜内部名称。

### 输入定位与类型

下面是本例设置主干循环时使用的内部工具参数，传给 `NiagaraToolsets.NiagaraToolset_System.SetStackInputData`：

```json
{
  "stackInputRef": {
    "system": {"refPath": "/Game/VFX/ChainLightning/NS_ChainLightning_MCP.NS_ChainLightning_MCP"},
    "emitterName": "Beam",
    "scriptName": "EmitterUpdateScript",
    "moduleName": "EmitterState",
    "inputNameStack": ["Loop Duration"]
  },
  "inputData": {
    "struct": {"refPath": "/Script/Niagara.NiagaraFloat"},
    "value": {"value": 0.12}
  }
}
```

本构建的常见输入表示：

| 输入 | `struct.refPath` | `value` 示例 |
|---|---|---|
| Float | `/Script/Niagara.NiagaraFloat` | `{"value":0.12}` |
| Int | `/Script/Niagara.NiagaraInt32` | `{"value":49}` |
| Bool | `/Script/Niagara.NiagaraBool` | `{"value":-1}` 为真，`{"value":0}` 为假 |
| HLSL 表达式 | `/Script/NiagaraEditor.NiagaraExt_StackInputData_HlslExpression` | `{"hlslExpression":"float3(User.Length,0,0)"}` |

HLSL 输入应为单个求值表达式。把类型对应的字段放在 `value` 对象中；不要省略外层 `struct` 和 `value`。

### 编译结果

调用 `GetSystemCompileState`，参数仍是 `system` 对象引用。本例成功结果包括 `aggregateStatus = UpToDate`、`bIsCompiling = false`、`bIsStale = false`、`bHasErrors = false` 和 `bHasWarnings = false`。

如果结果仍在编译或已过期，等待编译完成后再判断。检查各脚本的编译事件，可以定位具体 Emitter 和阶段；保存操作也不能代替编译检查。

## 在编辑器中执行 Python

本例工具集名为 `editor_toolset.toolsets.python_scripting.PythonScriptingTools`。使用前调用 `read_me`，按其说明通过 `search_symbols` 和 `get_symbol` 确认 API，再调用 `execute_python`。

以下为 `execute_python` 的内部参数示例，只读取已有资产名称：

```json
{
  "script": {
    "language": "Python",
    "content": "import unreal\nasset = unreal.EditorAssetLibrary.load_asset('/Game/VFX/ChainLightning/NS_ChainLightning_MCP')\nasset.get_name()"
  }
}
```

当前执行器的行为：

- 最后一个表达式作为返回值；`print()` 写入 Unreal 的 `LogPython`，不会自动成为工具返回值。
- Python 脚本可在顶层 `await`；长操作之间使用 `await asyncio.sleep(0)` 让编辑器处理事件。
- 脚本中调用其他已注册工具时使用已提供的 `await call_tool(...)`，避免直接调用底层异步注册入口却不等待结果。
- 不能在导入语句以外随意嵌套 `import`，也不能使用说明中禁止的阻塞网络、进程或睡眠调用。

例如在编辑器脚本中读取摘要：

```python
import unreal

system = unreal.EditorAssetLibrary.load_asset(
    '/Game/VFX/ChainLightning/NS_ChainLightning_MCP'
)
summary = await call_tool(
    'NiagaraToolsets.NiagaraToolset_System.GetSystemSummary',
    system=system,
)
summary
```

通过脚本组合工具时，应按已发现的输出字段访问结果。本执行器对不存在的字段会报错，不能依赖 `.get()` 来猜字段。

## 蓝图生成能力

当前会话发现并使用了 `BlueprintEditorLibrary`、`BlueprintGraphEditor` 和 `BlueprintGraphPin`。当前会话没有发现可用的 `BlueprintToolset` 或 `BlueprintDslToolset`，因此本例使用节点与引脚 API 生成蓝图。

| 操作 | 本构建使用的 API |
|---|---|
| 创建 Actor 蓝图 | `BlueprintEditorLibrary.create_blueprint_asset_with_parent` |
| 添加 Niagara Component | `ActorToolset.add_component`，Owner 可为 Blueprint |
| 创建函数图 | `BlueprintGraphEditor.create_and_edit_function_graph` |
| 创建函数调用节点 | `BlueprintGraphEditor.add_call_function_node` |
| 查找输入与输出 | `K2Node.find_input_pin`、`find_output_pin` |
| 连接引脚 | `BlueprintGraphPin.try_create_connection` |
| 编译 | `BlueprintEditorLibrary.compile_blueprint` |

创建节点后读取实际引脚名，验证引脚有效性，并检查每次连接的返回值。关于数值类型、实例编辑权限和组件重复创建，见 [API 注意事项](troubleshooting.md#蓝图与-python-api)。

## 创建与配置冰球 System

创建和修改前，读取这些工具的 Schema。下表描述本例实际使用的参数入口；嵌套类型以编辑器返回值为准。

| 工具 | 参数入口 | 本例用途 |
|---|---|---|
| `CreateNiagaraSystem` | `assetName`、`assetPath`、`templateSystem` | 使用 `/Niagara/DefaultAssets/DefaultSystem` 创建系统 |
| `AddEmitter` | `system`、`templateEmitter`、`emitterName` | 添加 SingleLoopingParticle、Minimal 或 SimpleSpriteBurst 模板 |
| `RemoveEmitter` | `emitterRef` | 移除模板自带的 Fountain |
| `AddModule` | `moduleLocationRef`、`moduleAsset` | 给 Minimal 添加 SpawnRate |
| `AddSetParametersModule` | `moduleLocationRef`、`parameters` | 写入粒子颜色、尺寸、局部轨道或初速度 |
| `SetEmitterData` | `emitterRef`、`emitterData.propertyValues` | 设置局部或世界空间 |
| `SetRendererData` | `rendererRef`、`rendererData.propertyValues` | 设置材质和透明排序 |

属性 Schema 使用的名称与值数据的名称可能不同。读取 `GetEmitterSchema / GetRendererSchema` 及对应 Data 后，再构造 `propertyValues` JSON 字符串；本例写入 `bLocalSpace`、`Material`、`SortOrderHint` 和 `bCastShadows`。

### Set Parameters 的参数类型

每个 `parameters` 条目用 `variable.name` 指定完整参数名，用 `variable.type.classStructOrEnum.refPath` 指定类型。添加后从返回的 `moduleName` 取得真实名称，再用 `SetStackInputData` 设置表达式，不要硬编码生成的 GUID 名。

| 粒子参数 | 类型路径 |
|---|---|
| `Particles.Lifetime / Particles.SpriteRotation` | `/Script/Niagara.NiagaraFloat` |
| `Particles.Color` | `/Script/CoreUObject.LinearColor` |
| `Particles.SpriteSize` | `/Script/CoreUObject.Vector2f` |
| `Particles.Velocity` | `/Script/CoreUObject.Vector3f` |
| `Particles.Position` | `/Script/Niagara.NiagaraPosition` |
| `Particles.SpriteFacing / Particles.SpriteAlignment / Particles.Scale` | `/Script/CoreUObject.Vector3f` |
| `Particles.MeshOrientation` | `/Script/CoreUObject.Quat4f` |

下面是添加一个颜色赋值模块的内部工具参数，调用 `AddSetParametersModule` 后再设置其颜色输入：

```json
{
  "moduleLocationRef": {
    "system": {"refPath":"/Game/VFX/FrostChain/NS_FrostOrb.NS_FrostOrb"},
    "emitterName":"ColdTrail",
    "scriptName":"ParticleUpdateScript"
  },
  "parameters":[{
    "variable":{
      "name":"Particles.Color",
      "type":{"classStructOrEnum":{"refPath":"/Script/CoreUObject.LinearColor"}}
    }
  }]
}
```

已有系统重跑创建步骤时，先检查组件、Emitter 和模块是否存在。只更新自己创建的对象；不要用删除全部 Set Parameters 模块的方式修改含有其他作者逻辑的系统。

### 属性依赖与 Mesh Renderer

部分属性受 EditCondition 控制。先在一次调用中启用条件，再在下一次调用中设置依赖属性；不能依赖同一个 JSON 对象中字段的排列顺序。工具报失败时，部分其他字段可能已经写入，重试前重新读取 Data。

| 首次设置 | 后续设置 |
|---|---|
| Mesh Renderer 的 `bOverrideMaterials = true` | `OverrideMaterials` 中的 `ExplicitMat` |
| System 的 `bFixedBounds = true` | `FixedBounds` |
| System 的 `WarmupTime > 0` | `WarmupTickDelta` 等预热属性 |

Mesh Renderer 的创建入口为 `AddRenderer`，类型引用可用 `{"refPath":"/Script/Niagara.NiagaraMeshRendererProperties"}`。本构建注册了该 Renderer，但没有暴露 `unreal.NiagaraMeshRendererProperties` Python 类；不要把类常量不存在理解为 Renderer 不可用。

`SetRendererData.rendererData.propertyValues` 仍是 JSON 字符串。下列两个属性对象需分别序列化并按顺序提交：

```json
{"bOverrideMaterials": true}
```

```json
{"OverrideMaterials": [{"ExplicitMat": {"refPath": "/Game/VFX/MagicCircle/M_MC_Helix.M_MC_Helix"}}]}
```

网格导入返回值中的路径才是后续 `Meshes[].Mesh` 的依据。导入器可能增加 `StaticMeshes` 子目录；具体例子见 [生成与导入素材](magic-circle.md#2-生成与导入素材)。

## 强制编译与运行数据核对

本项目暴露 `unreal.MyProject5_9Demo.recompile_system(system)`，其 C++ 实现调用 `RequestCompile(true)` 并标记资产待保存。它是当前项目的辅助接口，其他项目必须重新发现可用编译入口。

在此构建中，修改寿命后曾出现栈输入已更新、编译状态 UpToDate，但运行粒子的寿命和颜色不符合输入的情况。强制编译后重新开始模拟，运行值恢复一致。因此对这类问题要同时核对输入、编译状态和实际粒子数据。

停止模拟后可执行以下编译检查；片段使用当前编辑器的顶层 `await call_tool`：

```python
import unreal

system = unreal.EditorAssetLibrary.load_asset('/Game/VFX/FrostChain/NS_FrostOrb')
assert unreal.MyProject5_9Demo.recompile_system(system)
state = await call_tool(
    'NiagaraToolsets.NiagaraToolset_System.GetSystemCompileState', system=system)
assert not state['bHasErrors'] and not state['bHasWarnings']
assert unreal.EditorAssetLibrary.save_loaded_asset(system)
```

### 采样运行粒子

本构建可用 Niagara Sim Cache 读取粒子数量、年龄、颜色和寿命。下面片段在模拟已经开始且冰球已运行数帧后采样，不修改系统资产：

```python
import unreal

world = unreal.EditorLevelLibrary.get_game_world()
chain = next(a for a in unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor)
             if a.get_class().get_name() == 'BP_FrostChain_C')
orb = next(c for c in chain.get_components_by_class(unreal.NiagaraComponent)
           if c.get_name() == 'IceOrb')
cache = unreal.NiagaraSimCacheFunctionLibrary.create_niagara_sim_cache(world)
params = unreal.NiagaraSimCacheCreateParameters()
params.set_editor_property('attribute_capture_mode', unreal.NiagaraSimCacheAttributeCaptureMode.ALL)
cache = unreal.NiagaraSimCacheFunctionLibrary.capture_niagara_sim_cache_immediate(
    cache, params, orb)
counts = {str(name): len(cache.read_position_attribute('Position', name))
          for name in cache.get_emitter_names()}
ages = list(cache.read_float_attribute('Age', 'ColdTrail'))
{'counts': counts, 'oldestTrailAge': max(ages) if ages else None}
```

目标是让持续播放保持有限粒子数量，而非只检查 Niagara Component 是否处于 Active。当前粒子数量的实测值见 [冰球验证数据](evidence/frost-chain.json)。

## 截图与结果内容

`SceneCaptureToolset.SceneCaptureToolset.CaptureEditorViewport` 可捕获当前编辑器关卡视口。该工具响应包含文本元数据和 `type = image` 的图片内容块；本例将图片内容块的 Base64 数据解码为 PNG。

视口窗口在后台、隐藏或最小化时，该工具可能拒绝捕获。需要场景画面且不依赖编辑器界面时，可以使用 `Capture(world, camera, mode, options)` 离屏渲染；它不含编辑器覆盖层、视口的时间历史或相机独有的后处理，不能将结果称为编辑器截图。

`Capture` 使用 `mode = Lit`，`options` 中设置 `width`、`height` 和 `screenPercentage`，`camera` 提供世界坐标 `location`、角度 `rotation` 与 `fOV`。本例传入实际模拟世界 `/Game/_MyTest/UEDPIE_0_M_Test.M_Test`；模拟重启后需重新取得世界引用。

编辑器世界是否显示 Niagara 取决于实例是否在该世界中模拟与绘制。魔法阵持续实例已在 `/Game/_MyTest/M_Test.M_Test` 的离屏 Capture 中显示；由 BeginPlay 触发的效果仍需进入 PIE。先确认当前世界和播放状态，不要把某个编辑器帧没有粒子推广为“编辑器世界不支持 Niagara”。

本目录冰球 GIF 由 42 张运行世界离屏帧合成。每帧先让游戏时间前进约 0.10 秒，再暂停并捕获；结束后取消暂停并停止模拟。预览的游戏时间与截图调用耗时分别计算，不能用截图速度评估游戏性能。

文本中的 `urn:toolresult:...` 标识不是已确认可直接读取的文件路径。本例通过 `resources/read` 读取该标识得到 HTTP 400；保存图片时应读取实际的图片内容块，不能只处理文本响应。

## 本例调用依据

工具调用与 Python 执行入口来自本机已连接的编辑器，使用的插件源码位于引擎的 `Engine/Plugins/Experimental/Toolsets/`。移植到其他版本时，重新执行发现步骤；不要把源码存在、插件可加载和当前工具已注册视为同一件事。
