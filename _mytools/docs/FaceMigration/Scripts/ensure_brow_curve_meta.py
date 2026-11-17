
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
sm = _fm_load_asset(MESH)
skel = sm.get_editor_property('skeleton')

names = [str(n) for n in skel.get_curve_meta_data_names()]
print("existing curve names (count=%d): %s" % (len(names), names[:40]))

for name in ('browInnerUp', 'browDownLeft', 'browDownRight'):
    n = unreal.Name(name)
    if name not in names:
        try:
            skel.add_curve_meta_data(n, True)
            print("added", name)
        except Exception as exc:
            print("add failed", name, repr(exc))
    try:
        skel.set_curve_meta_data_morph_target(n, True)
        print("%s morph_target=%s" % (name, skel.get_curve_meta_data_morph_target(n)))
    except Exception as exc:
        print("set failed", name, repr(exc))

_fm_save_asset(skel, False)
print("saved skeleton")
