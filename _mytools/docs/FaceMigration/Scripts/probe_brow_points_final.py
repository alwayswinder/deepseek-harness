"""最终状态核对：控制列表 + BPT_ 节点数（应无重复）。"""

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
    out = {'controls': []}
    for k in h.get_all_keys():
        if k.type != unreal.RigElementType.CONTROL:
            continue
        st = h.get_control_settings(k)
        off = h.get_global_control_offset_transform(k).translation
        out['controls'].append({
            'name': str(k.name),
            'display': str(st.display_name),
            'type': str(st.control_type).split('.')[-1],
            'shape': str(st.shape_name),
            't': [round(off.x, 3), round(off.y, 3), round(off.z, 3)],
            'parent': str(h.get_first_parent(k).name),
        })
    nodes = [str(n.get_name()) for n in rig.get_default_model().get_nodes()]
    out['node_count'] = len(nodes)
    out['bpt_nodes'] = [n for n in nodes if n.startswith('BPT_')]
    out['dup_check'] = len(out['bpt_nodes']) == len(set(out['bpt_nodes']))
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
