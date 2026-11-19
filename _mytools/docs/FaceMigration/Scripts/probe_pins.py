
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


def pin_info(node):
    out = []
    for p in node.get_pins():
        try:
            nm = p.get_name()
        except AttributeError:
            nm = str(p)
        try:
            ct = p.get_cpp_type().get_name()
        except Exception:
            ct = '?'
        out.append((nm, str(ct)))
    return out


for name in ('RigUnit_SetBoneRotation', 'RigUnit_SetScale', 'RigUnit_SetTransform',
             'RigUnit_GetBoneTransform', 'RigVMFunction_MathQuaternionFromAxisAndAngle'):
    cls = getattr(unreal, name, None)
    if cls is None:
        continue
    try:
        path = cls.static_struct().get_path_name()
        node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(0, 2000), 'ZZ_' + name, False)
        print("=== %s\n    %s" % (name, pin_info(node)))
        ctrl.remove_node(node, False)
    except Exception as exc:
        print("ERR", name, repr(exc))
