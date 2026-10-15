---
name: 3dsmax-live-mcp
description: Inspect, create, and edit content in the currently running Autodesk 3ds Max scene through the configured 3dsmax-mcp server. Use for live scene, object, material, modifier, animation, viewport, rendering, or 3ds Max plugin tasks; do not use for repository-only code changes that do not touch a running Max session.
---

# 3ds Max Live MCP

Operate the active 3ds Max session through the `3dsmax-mcp` server. Preserve the user's open scene and make the smallest set of tool calls that satisfies the request.

## Tool routing

- With the full or core profile, call operational tools such as `query_scene`, `create_object`, and `transform_object` directly.
- If the server exposes only `list_toolsets`, `describe_toolset`, and `call_tool`, it is using the progressive profile. Discover the relevant toolset, load its schemas, and invoke operational tools through `call_tool`.
- Prefer a dedicated MCP tool over `execute_maxscript` or `execute_python`. Use a scripting fallback only when no dedicated tool covers the operation.
- For advanced tool choice, guarded-edit tokens, plugin workflows, or MAXScript details, read `resource://3dsmax-mcp/skill` or the repository guide at `../../../skills/3dsmax-mcp-dev/SKILL.md` only when needed.

## Live-scene workflow

1. Inspect only the state required for the request. Use `query_scene` for overview, selection, class, property, filter, or delta reads; use the dedicated inspection tool for meshes, curves, controllers, materials, lights, or plugins.
2. Resolve ambiguous targets before editing. Prefer stable handles or canonical paths returned by `resolve_node_refs`; refresh them after loading or resetting a scene.
3. Apply edits sequentially. Never run concurrent writes against one Max instance because writes share the UI thread and undo transaction state.
4. Respect dry-run and expected-token fields when a tool provides them. If a stale-token error occurs, inspect again instead of bypassing the guard.
5. Verify every meaningful edit with `query_scene(action="delta")`, a focused re-inspection, or `capture_viewport` when visual confirmation matters.

Do not call `get_bridge_status` or `get_session_context` as a routine preamble. Use `get_bridge_status` only after a connection or transport failure, or when the user explicitly asks for diagnostics.

## Common choices

- Scene and hierarchy: `query_scene`, `get_hierarchy`, `resolve_node_refs`, `scene_qa`.
- Objects and transforms: `create_object`, `clone_objects`, `transform_object`, `scene_patch`.
- Modeling: inspect first, then use `create_mesh`, `mesh_edit`, `curve_model`, `edit_curve`, `boolean_operation`, or modifier tools.
- Materials and textures: `get_materials`, `assign_material`, `create_material_from_textures`, and material property tools.
- Animation: inspect tracks or controllers before using keyframe and controller tools.
- Viewport: `set_viewport` and `capture_viewport`. Do not start a render unless the user asks.
- Installed plugins: discover or inspect the live plugin surface before assuming class names, parameters, or enum values.

## Scene safety

- Do not reset, load, save over, merge into, delete from, or render the scene unless the user's request authorizes that operation.
- Preserve the current selection, active viewport, timeline position, and layer state unless changing them is part of the task or required temporarily; restore temporary interaction state when practical.
- A call blocked by a modal dialog is still running. Inspect the dialog and respond once; never repeat the original call while it is blocked.
- Keep `safe_mode=true` unless the user explicitly asks for a workflow that requires disabling it and accepts the consequences.

## Connection recovery

The configured server entry is `3dsmax-mcp`. After a normal 3ds Max restart, the installed native bridge should provide the named-pipe transport automatically. If the native plugin is not loaded in the current session, the TCP fallback can be started without changing the scene:

1. Run `maxscript/mcp_server.ms` in 3ds Max.
2. Execute `MCP_Server.start()` in the MAXScript Listener.

Treat `pong=true`, `connected=true`, and a successful read-only `query_scene` call as the connection test. Stop after reporting the actual transport; do not modify the scene merely to prove connectivity.
