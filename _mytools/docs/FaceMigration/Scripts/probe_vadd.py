
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal
for n in ("RigVMFunction_MathVectorAdd", "RigVMFunction_MathVectorMake", "RigUnit_GetBoneTransform",
          "RigUnit_SetTranslation", "RigUnit_SetRelativeTranslation", "RigUnit_SetTransform"):
    print(("HAS " if getattr(unreal, n, None) else "NO  ") + n)
rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'))
ctrl = rig.get_controller(rig.get_default_model())
cls = getattr(unreal, "RigUnit_GetBoneTransform", None)
if cls:
    node = ctrl.add_unit_node_from_struct_path(cls.static_struct().get_path_name(), "Execute",
                                               unreal.Vector2D(0, 3000), "ZZ_bt", False)
    print([ (p.get_name() if hasattr(p,"get_name") else str(p)) for p in node.get_pins() ])
    ctrl.remove_node(node, False)
