"""尝试读 Seven 网格的顶点/LOD 数量，用于和 Max (Seven_Head 4526 verts) 对比。"""

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
mesh = _fm_load_asset(MESH)
out = {}

for name in ('get_num_lods', 'get_num_sections', 'get_num_vertices', 'get_num_triangles',
             'get_editor_property', 'get_skeletal_mesh_description', 'get_lod_count'):
    out[name] = hasattr(mesh, name)

for attr in ('lod_settings', 'num_lods', 'lod_count', 'extended_bounds', 'bounding_box'):
    try:
        out['prop_' + attr] = str(mesh.get_editor_property(attr))[:300]
    except Exception as exc:
        out['prop_' + attr] = 'ERR'

try:
    out['num_lods_call'] = mesh.get_num_lods()
except Exception as exc:
    out['num_lods_call'] = 'ERR %r' % exc

# SkeletalMesh 的 LOD 信息可能通过 mesh.get_editor_property('lod_info') 的替代 API
for m in ('get_lod_info', 'get_mesh_description', 'get_render_data'):
    if hasattr(mesh, m):
        try:
            out[m] = str(getattr(mesh, m)())
        except Exception as exc:
            out[m] = 'ERR %r' % exc

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
