"""探测 UE 网格的蒙皮权重上限 / LOD 设置。"""

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
    out = {'class': str(mesh.get_class().get_name()), 'props': []}
    for p in dir(mesh):
        low = p.lower()
        if 'bone' in low or 'skin' in low or 'weight' in low or 'lod' in low:
            out['props'].append(p)
    for name in ('max_bones_per_vertex', 'skinning_data', 'lod_info', 'skeleton', 'import_settings'):
        try:
            out[name] = str(mesh.get_editor_property(name))
        except Exception as exc:
            out[name] = 'ERR %r' % exc
    try:
        lods = mesh.get_editor_property('lod_info')
        out['lod_count'] = len(lods)
        if lods:
            l0 = lods[0]
            out['lod0_props'] = [p for p in dir(l0) if 'bone' in p.lower() or 'weight' in p.lower()]
    except Exception as exc:
        out['lod_info'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
