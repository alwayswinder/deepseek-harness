"""尝试读取 UE 网格的顶点数/导入信息。"""

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
    out = {}
    for prop in ('skeletal_mesh_description', 'mesh_description', 'render_data', 'lod_settings',
                 'imported_bounds', 'skeleton', 'morph_targets', 'physics_asset', 'asset_import_data'):
        try:
            v = mesh.get_editor_property(prop)
            out[prop] = str(v)[:120]
        except Exception as exc:
            out[prop] = 'ERR'
    try:
        sk = mesh.get_editor_property('skeleton')
        out['skeleton_bone_count'] = len(sk.get_editor_property('bone_tree'))
    except Exception as exc:
        out['skeleton_bone_count'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
