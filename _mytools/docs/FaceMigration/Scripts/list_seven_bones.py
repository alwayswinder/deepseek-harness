"""列出 Seven 骨架的全部骨骼名，用于确认能否补全眉毛链 Bone007-013。"""

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
    skel = mesh.get_editor_property('skeleton')
    names = []
    try:
        names = [str(skel.get_reference_name(n)) for n in skel.get_editor_property('bone_names')]
    except Exception as exc:
        names = ['<%r>' % exc]
    if not names or names[0].startswith('<'):
        ref = unreal.new_object(unreal.RigHierarchy)
        ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, False, False, False, False)
        names = [str(k.name) for k in ref.get_all_keys() if k.type == unreal.RigElementType.BONE]

    out = {
        'mesh': MESH,
        'count': len(names),
        'all': names,
        'brow': [n for n in names if 'meibu' in n.lower() or n.lower().startswith('bone0')],
    }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
