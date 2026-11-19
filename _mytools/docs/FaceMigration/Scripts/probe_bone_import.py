
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')

sm = _fm_load_asset(MESH)
rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()
hc = rig.get_hierarchy_controller()

try:
    print("preview_mesh:", rig.get_preview_mesh())
except Exception as exc:
    print("preview_mesh err:", repr(exc))
print("bones_before:", [str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE])

# 只导入 head 子树，试出 API 行为
try:
    res = hc.import_bones_from_skeletal_mesh(sm, 'head', True, False, False, False, False)
    print("import(head, all=False) ->", res)
except Exception as exc:
    print("import head failed:", repr(exc))

print("bones_after:", [str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE])

for n in ('meibu_L', 'meibu_R', 'head'):
    k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)
    if h.contains(k):
        t = h.get_local_transform(k)
        print(n, "local:", t.translation, t.rotation, t.scale)
