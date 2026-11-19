"""打印 CR_Seven_MorphSliders 当前全部内容，作为“清空重建”前的现状快照。

用法：python Scripts\\ue_run.py Scripts\\inspect_cr7_state.py
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import traceback

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')


def main():
    out = {}
    rig = _fm_load_asset(ASSET)
    out['asset'] = ASSET
    out['class'] = rig.get_class().get_name()
    out['status'] = str(rig.get_editor_property('status'))

    h = rig.get_hierarchy()
    keys = list(h.get_all_keys())
    by_type = {}
    for k in keys:
        by_type.setdefault(k.type, []).append(str(k.name))
    out['counts'] = {str(t): len(v) for t, v in by_type.items()}

    controls = []
    for name in by_type.get(unreal.RigElementType.CONTROL, []):
        k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)
        try:
            st = h.get_control_settings(k)
            try:
                parent = str(h.get_first_parent(k).name)
            except Exception:
                parent = '-'
            controls.append({
                'name': name,
                'type': str(st.control_type),
                'display': str(st.display_name),
                'shape': str(st.shape_name),
                'parent': parent,
                'value': str(h.get_control_value(k)),
                'offset_t': [round(x, 2) for x in (
                    h.get_global_control_offset_transform(k).translation.x,
                    h.get_global_control_offset_transform(k).translation.y,
                    h.get_global_control_offset_transform(k).translation.z)],
            })
        except Exception as exc:
            controls.append({'name': name, 'error': repr(exc)})
    out['controls'] = controls

    bones = by_type.get(unreal.RigElementType.BONE, [])
    out['bone_count'] = len(bones)
    out['bones_brow'] = [b for b in bones if 'meibu' in b.lower() or b.startswith('Bone0')]
    out['bones_all'] = bones

    out['nulls'] = by_type.get(unreal.RigElementType.NULL, [])

    out['curves'] = by_type.get(unreal.RigElementType.CURVE, [])

    model = rig.get_default_model()
    out['nodes'] = [str(n.get_name()) for n in model.get_nodes()]

    try:
        variables = [str(v) for v in rig.get_editor_property('variable_names')]
    except Exception as exc:
        variables = ['<%r>' % exc]
    out['variables'] = variables

    try:
        pm = rig.get_editor_property('preview_mesh')
        out['preview_mesh'] = pm.get_path_name() if pm else None
    except Exception as exc:
        out['preview_mesh'] = repr(exc)

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')
    return out


if __name__ == '__main__':
    try:
        main()
    except Exception:
        unreal.log_error('[InspectCR7] FAILED\n' + traceback.format_exc())
        raise
