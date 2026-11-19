
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
hc = rig.get_hierarchy_controller()

print("HC_METHODS:", sorted([m for m in dir(hc) if not m.startswith('_')]))

for name in ('RigUnit_SetBoneRotation', 'RigUnit_SetBoneScale', 'RigUnit_SetBoneTransform',
             'RigUnit_GetBoneTransform', 'RigUnit_SetCurveValue', 'RigUnit_GetControlFloat',
             'RigVMFunction_MathFloatMul', 'RigVMFunction_MathFloatAdd',
             'RigVMFunction_MathFloatLerp', 'RigVMFunction_MathFloatRemap',
             'RigUnit_SetRelativeRotationForItem', 'RigUnit_SetTranslation'):
    cls = getattr(unreal, name, None)
    if cls is None:
        print("MISSING", name)
        continue
    try:
        sp = cls.static_struct().get_path_name()
    except Exception as exc:
        sp = "err:%r" % (exc,)
    print("OK", name, sp)

print("VERSION", unreal.SystemLibrary.get_engine_version())
