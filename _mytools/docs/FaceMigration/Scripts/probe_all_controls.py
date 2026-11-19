"""最终核对：所有控制形状 + 编译状态 + 节点数。"""

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
    out = {'controls': [], 'status': str(rig.get_editor_property('status'))}
    for k in h.get_all_keys():
        if k.type != unreal.RigElementType.CONTROL:
            continue
        st = h.get_control_settings(k)
        off = h.get_global_control_offset_transform(k).translation
        out['controls'].append({
            'name': str(k.name),
            'display': str(st.display_name),
            'shape': str(st.shape_name),
            't': [round(off.x, 2), round(off.y, 2), round(off.z, 2)],
        })
    names = [str(n.get_name()) for n in rig.get_default_model().get_nodes()]
    out['node_count'] = len(names)
    out['bb'] = len([n for n in names if n.startswith('BB_')])
    out['bbl'] = len([n for n in names if n.startswith('BBL_')])
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
