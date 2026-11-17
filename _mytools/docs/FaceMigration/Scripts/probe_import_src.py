"""读 Seven 网格与骨架的导入源信息（FBX 路径、时间），判断 UE 网格是否与 Max 场景同源。"""

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

out = {}
for path in (MESH, _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven_Skeleton')):
    a = _fm_load_asset(path)
    rec = {'class': a.get_class().get_name()}
    try:
        d = a.get_editor_property('asset_import_data')
        rec['import_data'] = str(d)
        if d is not None:
            try:
                rec['source_file'] = str(d.get_first_filename())
            except Exception as exc:
                rec['source_file'] = 'ERR %r' % exc
            for attr in ('source_file', 'import_source', 'source_file_timestamp'):
                try:
                    rec[attr] = str(d.get_editor_property(attr))
                except Exception:
                    pass
    except Exception as exc:
        rec['import_data'] = 'ERR %r' % exc
    try:
        rec['modified'] = str(a.get_outermost().get_editor_property('saved_hash'))
    except Exception:
        pass
    out[path] = rec

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
