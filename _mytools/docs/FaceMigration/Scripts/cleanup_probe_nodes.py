
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal
rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'))
ctrl = rig.get_controller(rig.get_default_model())
removed = []
with unreal.ScopedEditorTransaction("Remove probe nodes"):
    for n in list(rig.get_default_model().get_nodes()):
        if n.get_name().startswith("ZZ_"):
            ctrl.remove_node(n, False)
            removed.append(n.get_name())
    rig.recompile_vm()
print("removed", removed)
print("status", rig.get_editor_property("status"))
names = [n.get_name() for n in rig.get_default_model().get_nodes()]
print("left", len(names), [n for n in names if not (n.startswith("BROW_") or n.startswith("Get_") or n.startswith("Set_") or n == _fm_node('Begin'))])
_fm_save_asset(rig, False)
print("saved")
