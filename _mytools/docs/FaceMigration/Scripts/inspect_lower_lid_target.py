"""Read target Rig before adding lower eyelids; no asset changes."""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
from pathlib import Path
import unreal

root = Path(unreal.Paths.project_dir())
rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))
assert rig is not None
model = rig.get_default_model()
h = rig.get_hierarchy()
out = {'status': str(rig.get_editor_property('status')), 'nodes': len(model.get_nodes()),
       'controls': [str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.CONTROL],
       'links': [], 'pins': {}, 'api': {}}
for link in model.get_links():
    out['links'].append([str(link.get_source_node().get_name()), str(link.get_source_pin().get_name()),
                         str(link.get_target_node().get_name()), str(link.get_target_pin().get_name())])
for node in model.get_nodes():
    if str(node.get_name()).startswith(('EYE_MAKE_Bone03', 'EYE_MAKE_Bone04')):
        out['pins'][str(node.get_name())] = [str(p.get_name()) for p in node.get_pins()]
out['api']['reload_packages'] = str(unreal.EditorLoadingAndSavingUtils.reload_packages.__doc__)
out['api']['set_preview'] = str(rig.set_preview_mesh.__doc__)
out['api']['set_debug_object'] = str(rig.set_object_being_debugged.__doc__) if hasattr(rig, 'set_object_being_debugged') else None
out['available_units'] = [n for n in ('RigVMFunction_MathFloatClamp', 'RigVMFunction_MathFloatMul', 'RigVMFunction_MathVectorScale', 'RigVMFunction_MathVectorAdd', 'RigVMFunction_MathQuaternionMul') if hasattr(unreal, n)]
(_fm_output(_fm_saved('lower_lid_before.json'))).write_text(json.dumps(out, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k not in ('links','pins')}, ensure_ascii=False))
