"""打印 UE Seven 骨架里眉部骨骼的父子与位置。"""

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

MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')


def main():
    mesh = _fm_load_asset(MESH)
    rig = unreal.new_object(unreal.RigHierarchy)
    rig.get_controller(True).import_bones_from_skeletal_mesh(
        mesh, 'None', True, True, False, False, False)
    keys = [k for k in rig.get_all_keys() if k.type == unreal.RigElementType.BONE]
    names = {str(k.name): k for k in keys}

    targets = ['head', 'yankuang_L', 'yankuang_R', 'meibu_L', 'meibu_R'] + \
              ['Bone%03d' % i for i in range(1, 24)]
    out = {}
    rows = []
    for n in targets:
        k = names.get(n)
        if not k:
            rows.append({'bone': n, 'missing': True})
            continue
        p = rig.get_first_parent(k)
        t = rig.get_global_transform(k)
        rows.append({
            'bone': n,
            'parent': str(p.name) if p else '',
            'pos': [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)],
        })
    out['bones'] = rows
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
