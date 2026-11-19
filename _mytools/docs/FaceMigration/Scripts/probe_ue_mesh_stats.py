"""UE 网格顶点数与骨骼权重信息。"""

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
    try:
        out['lod_count'] = mesh.get_num_lods()
    except Exception as exc:
        out['lod_count'] = 'ERR %r' % exc
    try:
        out['num_verts_lod0'] = mesh.get_num_vertices(0)
    except Exception as exc:
        out['num_verts_lod0'] = 'ERR %r' % exc
    try:
        out['num_triangles_lod0'] = mesh.get_num_triangles(0)
    except Exception as exc:
        out['num_triangles_lod0'] = 'ERR %r' % exc
    try:
        out['skeleton_bones'] = len(mesh.get_skeleton().get_editor_property('bone_tree'))
    except Exception as exc:
        out['skeleton_bones'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
