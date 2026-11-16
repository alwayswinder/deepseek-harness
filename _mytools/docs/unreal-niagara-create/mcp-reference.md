# Niagara MCP 调用参考

本页供已有 MCP 调用能力的开发者查询 UE 5.9 当前构建中的工具入口。JSON 示例是 JSON-RPC 请求体；通过现有 MCP 客户端发送，HTTP 会话初始化、会话标识和通知由客户端管理。主教程见 [创建指南](README.md)。

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

## 截图与结果内容

`SceneCaptureToolset.SceneCaptureToolset.CaptureEditorViewport` 可捕获当前编辑器关卡视口。该工具响应包含文本元数据和 `type = image` 的图片内容块；本例将图片内容块的 Base64 数据解码为 PNG。

文本中的 `urn:toolresult:...` 标识不是已确认可直接读取的文件路径。本例通过 `resources/read` 读取该标识得到 HTTP 400；保存图片时应读取实际的图片内容块，不能只处理文本响应。

## 本例调用依据

工具调用与 Python 执行入口来自本机已连接的编辑器，使用的插件源码位于引擎的 `Engine/Plugins/Experimental/Toolsets/`。移植到其他版本时，重新执行发现步骤；不要把源码存在、插件可加载和当前工具已注册视为同一件事。
