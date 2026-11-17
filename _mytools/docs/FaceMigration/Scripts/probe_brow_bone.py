
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
ref = unreal.new_object(unreal.RigHierarchy)
ref.get_controller(True).import_bones_from_skeletal_mesh(sm, 'None', True, True, False, False, False)

for n in ('meibu_L', 'meibu_R', 'head', 'etou_L', 'etou_R', 'yankuang_L'):
    k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)
    if ref.contains(k):
        loc = ref.get_local_transform(k)
        glob = ref.get_global_transform(k)
        parent = ref.get_first_parent(k)
        print("%s parent=%s local_t=%s local_r=%s local_s=%s" % (
            n, parent.name if parent else None, loc.translation, loc.rotation, loc.scale3d))
        print("   global_t=%s" % (glob.translation,))

rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()
for n in ('CTRL_1_happy', 'CTRL_1_jing', 'RAIL_1_happy', 'MorphBoard'):
    k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL if n.startswith(('CTRL', 'RAIL')) else unreal.RigElementType.NULL, name=n)
    if h.contains(k):
        off = h.get_control_offset_transform(k)
        print("offset %s: t=%s s=%s" % (n, off.translation, off.scale3d))

