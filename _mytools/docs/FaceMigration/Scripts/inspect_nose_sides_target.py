
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal
bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'));h=bp.get_hierarchy();m=bp.get_default_model()
for n in ('bijian','bitou','Bone026','Bone034','CTRL_NOSE'):
 kind=unreal.RigElementType.CONTROL if n.startswith('CTRL') else unreal.RigElementType.BONE;k=unreal.RigElementKey(type=kind,name=n);print(n,h.get_global_transform(k,True))
print('NOSEMAKE',[(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in m.get_links() if str(l.get_target_pin().get_pin_path()).startswith('NOSE_MAKE_bijian.')])
