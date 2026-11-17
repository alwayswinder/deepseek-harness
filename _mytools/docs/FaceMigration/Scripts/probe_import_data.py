"""查看 Seven 网格的导入源与 FBX 导入选项（骨骼影响上限）。"""

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
    out = {}
    mesh = _fm_load_asset(MESH)
    try:
        data = mesh.get_editor_property('asset_import_data')
        out['import_files'] = [str(data.get_first_filename())]
        try:
            out['import_count'] = data.get_imported_count()
        except Exception:
            pass
    except Exception as exc:
        out['import_data'] = 'ERR %r' % exc

    for cls_name in ('FbxSkeletalMeshImportData', 'FbxMeshImportData', 'SkeletalMeshImportData'):
        cls = getattr(unreal, cls_name, None)
        if cls is None:
            out[cls_name] = 'MISSING'
            continue
        try:
            props = [p for p in dir(cls) if 'bone' in p.lower() or 'weight' in p.lower() or 'influence' in p.lower()]
            out[cls_name] = props
        except Exception as exc:
            out[cls_name] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
