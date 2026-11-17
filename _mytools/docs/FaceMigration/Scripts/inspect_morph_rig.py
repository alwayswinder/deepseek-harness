
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
out = {}

h = rig.get_hierarchy()
keys = [k for k in h.get_all_keys()]
out['element_count'] = len(keys)
rows = []
for k in keys:
    rows.append('%s:%s' % (str(k.type).replace('RigElementType.', ''), str(k.name)))
out['elements'] = rows

controls = []
for k in keys:
    if k.type == unreal.RigElementType.CONTROL:
        try:
            st = h.get_control_settings(k)
            controls.append({
                'name': str(k.name),
                'type': str(st.control_type),
                'display': str(st.display_name),
                'shape': str(st.shape_name),
                'anim': str(st.animation_type),
                'min': str(st.minimum_value),
                'max': str(st.maximum_value),
                'parent': str(h.get_first_parent(k).name) if h.get_first_parent(k) else '',
            })
        except Exception as exc:
            controls.append({'name': str(k.name), 'err': repr(exc)})
out['controls'] = controls

curves = []
for k in keys:
    if k.type == unreal.RigElementType.CURVE:
        try:
            curves.append({'name': str(k.name), 'value': h.get_curve_value(k)})
        except Exception as exc:
            curves.append({'name': str(k.name), 'err': repr(exc)})
out['curves'] = curves

nodes = []
try:
    ctrl = rig.get_controller(rig.get_default_model())
    for n in rig.get_default_model().get_nodes():
        nodes.append({'name': n.get_name(), 'cls': n.get_class().get_name()})
except Exception as exc:
    out['node_err'] = repr(exc)
out['nodes'] = nodes

try:
    out['member_variables'] = [str(v) for v in rig.get_member_variables()]
except Exception as exc:
    out['member_variables_err'] = repr(exc)

try:
    libs = rig.get_editor_property('shape_libraries')
    out['shape_libraries'] = [str(l.get_path_name()) for l in libs]
except Exception as exc:
    out['shape_libraries_err'] = repr(exc)

print(json.dumps(out, ensure_ascii=False, indent=1))
