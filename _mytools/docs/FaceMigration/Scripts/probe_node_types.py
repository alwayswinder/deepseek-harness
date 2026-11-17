
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
rig = _fm_load_asset(ASSET)
ctrl = rig.get_controller(rig.get_default_model())

CANDIDATES = [
    'RigUnit_SetBoneRotation', 'RigUnit_GetBoneRotation',
    'RigUnit_SetBoneTransform', 'RigUnit_GetBoneTransform',
    'RigUnit_SetBoneScale', 'RigUnit_GetBoneScale',
    'RigUnit_SetScale', 'RigUnit_GetScale',
    'RigUnit_SetCurveValue', 'RigUnit_GetControlFloat',
    'RigVMFunction_MathFloatMul', 'RigVMFunction_MathFloatSub',
    'RigVMFunction_MathFloatRemap', 'RigVMFunction_MathFloatDiv',
    'RigVMFunction_MathQuaternionFromAxisAndAngle',
    'RigVMFunction_MathQuaternionMul',
    'RigVMFunction_MathTransformFromLocationRotationScale',
    'RigVMFunction_MathTransformMul',
    'RigVMFunction_MathVectorMake',
    'RigVMFunction_MathQuaternionRotationOrder',
]

for name in CANDIDATES:
    cls = getattr(unreal, name, None)
    print(("HAS " if cls else "NO  ") + name)
