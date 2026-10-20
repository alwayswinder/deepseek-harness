---
name: unreal-editor-mcp
description: Inspect and edit the currently running Unreal Engine 5.8 editor (levels, actors, blueprints, materials, assets, logs, PIE) through its built-in MCP server. Use for live editor/scene/asset work in a UE project; do not use it for source-code-only changes that need no running editor.
---

# Unreal Engine Editor MCP

Operate the running UE 5.8 editor through the `ModelContextProtocol` plugin's MCP server
(`mcp__unreal__*`). Keep the user's open level and unsaved work intact; prefer reads before writes.

## Call shape

The default profile is **progressive**: the editor exposes only three meta tools, so every
operational call is a discovery step plus a dispatch step.

| Tool | Purpose |
|---|---|
| `mcp__unreal__list_toolsets` | every toolset name + one-line description |
| `mcp__unreal__describe_toolset` | that toolset's tools with full `inputSchema` |
| `mcp__unreal__call_tool` | dispatch one toolset tool |

Rules that cost real calls when missed:

- `toolset_name` must be copied **verbatim** from `list_toolsets` — the casing is inconsistent
  (`EditorToolset.LogsToolset` next to `editor_toolset.toolsets.actor.ActorTools`).
- `tool_name` is the **short** name: `GetLogEntries`, `find_actors`, `get_current_level`.
  `describe_toolset` prints fully qualified names (`EditorToolset.LogsToolset.GetLogEntries`);
  passing one of those returns `Unknown tool`. Take everything after the last dot.
- `arguments` is always an object; pass `{}` for a tool whose schema has no properties.
- Omit `toolset_name` to call a top-level tool instead.

## Three schema traps that look like tool bugs

- **Object references are objects, not strings.** Actors, classes, and assets are
  `{"refPath": "<path>"}`. A bare string fails validation.
  - level actor: `/Game/_MyTest/PCG/M_PCG_Test.M_PCG_Test:PersistentLevel.Brush_0`
  - engine class: `/Script/Engine.PointLight`
  - blueprint class: `/Game/FirstPerson/Blueprints/BP_X.BP_X_C`
  - asset: `/Game/Path/Asset.Asset`
- **Some "optional-looking" filters are required.** `SceneTools.find_actors` lists
  `name`, `tag`, `collision_channels` as required; pass `""`, `""`, `[]` to mean "no filter".
- **A default can name something that does not exist.** `LogsToolset.GetLogEntries` defaults
  `category` to `"LogsToolset"`, which is not a real category, so the call fails until you pass
  `"category": ""` (all categories) or a real one from `GetLogCategories`.

## Toolset map (representative tools, not exhaustive)

| Toolset | Use it for |
|---|---|
| `EditorToolset.LogsToolset` | `GetLogEntries`, `GetLogCategories`, `SetVerbosity` — first stop for any failure |
| `editor_toolset.toolsets.scene.SceneTools` | `get_current_level`, `find_actors`, `add_to_scene_from_asset`, `load_level`, `get_folders` |
| `editor_toolset.toolsets.actor.ActorTools` | transforms, labels, tags, components, `look_at` |
| `editor_toolset.toolsets.asset.AssetTools` | `find_assets`, `exists`, `load_asset`, `save_assets`, `duplicate`, `get_referencers`, `delete` |
| `editor_toolset.toolsets.object.ObjectTools` | `get_properties`, `set_properties`, `search_subclasses`, `list_properties` |
| `editor_toolset.toolsets.blueprint.BlueprintTools` | graph DSL read/write, variables, events, `compile_blueprint` |
| `editor_toolset.toolsets.material.MaterialTools` | material + function expression graphs |
| `editor_toolset.toolsets.material_instance.MaterialInstanceTools` | parameter overrides on MICs |
| `editor_toolset.toolsets.static_mesh.StaticMeshTools` / `skeletal_mesh.SkeletalMeshTools` | mesh inspection, materials, bones, sockets |
| `editor_toolset.toolsets.texture.TextureTools` | texture import/settings |
| `editor_toolset.toolsets.data_table.DataTableTools` / `curve_table` / `string_table` | table assets |
| `EditorToolset.EditorAppToolset` | `IsPIERunning`, `StartPIE`, `StopPIE`, `CaptureViewport`, `CaptureEditorImage`, `GetSelectedActors`, `SearchCVars`, content browser |
| `editor_toolset.toolsets.programmatic.ProgrammaticToolset` | `execute_tool_script`: sandboxed Python that chains **other toolset tools** |

Project plugin toolsets (`PCGToolset`, `MetaHumanToolset`, `AIAssistantToolset`, …) appear only
when their plugin is loaded — the list grows during editor startup, so re-list instead of assuming.

## Workflow

1. **Read cheap state first.** `SceneTools.get_current_level`, `ActorTools.get_label`, `GetVisibleActors`,
   `IsPIERunning`, and `LogsToolset.GetLogEntries` answer most "what is going on" questions without
   touching the scene.
2. **Discover schemas lazily.** One `describe_toolset` per toolset per session is enough; reuse the
   tool names you learned instead of re-describing.
3. **Write one step at a time, then verify.** After a transform or property write, re-read it
   (`get_actor_transform`, `ObjectTools.get_properties`) or check the log — the editor reports
   failures as log lines, not exceptions.
4. **Use `ProgrammaticToolset.execute_tool_script`** when a task needs more than ~3 dependent calls
   (e.g. "find every light in the folder, halve intensity, save"). Its script orchestrates toolsets;
   it is not general Python — no file or network access.
5. **Show visual results** with `CaptureViewport` / `CaptureEditorImage` when the change is visual;
   these return images that land in the conversation as attachments.

## Safety

- Do not `load_level`, `delete` assets, `save_assets`, place/remove actors, or start/stop PIE unless
  the request authorizes it — each changes what the user has open.
- Do not reset or rebuild assets that user work depends on. Prefer creating new assets or editing
  copies when the intent is exploratory.
- After `BlueprintTools` graph writes, run `compile_blueprint` and read the log; leave the blueprint
  compiling cleanly or report the exact error instead of leaving it broken.
- Substrate/Lumen project settings are load-bearing in this project; treat material and rendering
  changes as verified only after a capture or a level check.

## Connection recovery

- The server is HTTP at `http://127.0.0.1:8000/mcp` by default (project settings →
  Model Context Protocol → `ServerPortNumber` / `ServerUrlPath`). Override with `DSH_UNREAL_MCP_URL`.
- The editor must be running; the mode still mounts without it (`failOnStartupError: false`) but
  exposes no tools. After starting the editor, restart DSH if the tools never appear.
- Zero-token fallback, when you want one call without MCP registration in the prompt:

  ```powershell
  _mytools\Mode\dsh-unreal\tools\ue-mcp.ps1 -Toolsets
  _mytools\Mode\dsh-unreal\tools\ue-mcp.ps1 -Toolset EditorToolset.LogsToolset -Tool GetLogEntries `
      -Arguments '{"category":"","pattern":"Error","maxEntries":20}'
  ```
