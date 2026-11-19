
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
path = unreal.RigUnit_GetControlVector2D.static_struct().get_path_name()
g = ctrl.add_unit_node_from_struct_path(path, "Execute", unreal.Vector2D(0, 3000), "ZZ_get", False)
gn = g.get_name()
mp = unreal.RigVMFunction_MathFloatMul.static_struct().get_path_name()
m = ctrl.add_unit_node_from_struct_path(mp, "Execute", unreal.Vector2D(300, 3000), "ZZ_mul", False)
mn = m.get_name()
for src in (gn + ".Vector.X", gn + ".Vector.Y", gn + ".Vector"):
    ok = False
    try:
        ok = ctrl.add_link(src, mn + ".A", False)
    except Exception as exc:
        print("EXC", src, repr(exc)); continue
    print("link", src, "->", ok)
print("pins after:", [p.get_name() if hasattr(p,"get_name") else str(p) for p in g.get_pins()])
for n in (g, m):
    ctrl.remove_node(n, False)
