
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()

controls = []
bones = []
curves = []
for k in h.get_all_keys():
    if k.type == unreal.RigElementType.CONTROL:
        st = h.get_control_settings(k)
        off = h.get_global_control_offset_transform(k)
        controls.append({
            'name': str(k.name),
            'display': str(st.display_name),
            'shape': str(st.shape_name),
            'z': round(off.translation.z, 2),
        })
    elif k.type == unreal.RigElementType.BONE:
        bones.append(str(k.name))
    elif k.type == unreal.RigElementType.CURVE:
        curves.append(str(k.name))

nodes = [n.get_name() for n in rig.get_default_model().get_nodes()]
out = {
    'status': str(rig.get_editor_property('status')),
    'controls': controls,
    'bones': bones,
    'curves': curves,
    'brow_nodes': [n for n in nodes if n.startswith('BROW_')],
    'dirty': rig.get_outermost().is_dirty() if hasattr(rig.get_outermost(), 'is_dirty') else 'n/a',
}
print(json.dumps(out, ensure_ascii=False, indent=1))
