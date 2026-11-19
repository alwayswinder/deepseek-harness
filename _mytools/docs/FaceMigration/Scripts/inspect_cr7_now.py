"""检视 CR_Seven_MorphSliders 现状：控制、骨骼、曲线、图节点。"""

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


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    report = {}

    # controls
    ctrl_key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='')
    controls = []
    n = h.get_num_controls()
    for i in range(n):
        k = h.get_control_by_index(i)
        st = h.get_control_settings(k)
        controls.append({
            'name': k.name,
            'type': str(st.control_type),
            'display': st.display_name,
            'parent': str(h.get_parent(k).name) if h.get_parent(k) else '',
            'value': str(h.get_control_value(k)),
        })
    report['control_count'] = n
    report['controls'] = controls

    # bones
    bones = []
    for i in range(h.get_num_bones()):
        k = h.get_bone_by_index(i)
        par = h.get_parent(k)
        bones.append({'name': k.name, 'parent': par.name if par else ''})
    report['bone_count'] = len(bones)
    report['bones'] = bones

    # curves
    curves = []
    for i in range(h.get_num_curves()):
        curves.append(h.get_curve_by_index(i).name)
    report['curve_count'] = len(curves)
    report['curves'] = curves

    # graph nodes
    ctrl = rig.get_controller(rig.get_default_model())
    nodes = [nd.get_name() for nd in rig.get_default_model().get_nodes()]
    report['node_count'] = len(nodes)
    report['nodes'] = sorted(nodes)

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
