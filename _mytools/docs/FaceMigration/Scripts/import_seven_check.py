"""把新导出的 FBX 导入到临时目录，检查骨架与网格。"""

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
from face_paths import source_path

DEST = _fm_asset('/Game/_MyTest/Temp/SevenCheck')


def main():
    task = unreal.AssetImportTask()
    task.filename = str(source_path('fbx_check'))
    task.destination_path, task.destination_name = DEST.rsplit('/', 1)
    task.replace_existing = True
    task.automated = True
    task.save = True
    try:
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        out = {'imported': [str(p) for p in task.imported_object_paths]}
    except Exception as exc:
        out = {'error': repr(exc)}

    assets = {}
    for path in (_fm_asset('/Game/_MyTest/Temp/SevenCheck'), _fm_asset('/Game/_MyTest/Temp/SevenCheck_Skeleton')):
        try:
            a = _fm_load_asset(path)
            assets[path] = str(a) if a else 'None'
        except Exception as exc:
            assets[path] = 'ERR %r' % exc
    out['assets'] = assets
    try:
        sk = _fm_load_asset(_fm_asset('/Game/_MyTest/Temp/SevenCheck_Skeleton'))
        if sk:
            out['bone_count'] = len(sk.get_editor_property('bone_tree'))
    except Exception as exc:
        out['bone_count'] = 'ERR %r' % exc
    try:
        mesh = _fm_load_asset(_fm_asset('/Game/_MyTest/Temp/SevenCheck'))
        if mesh:
            out['morph_count'] = len(mesh.get_editor_property('morph_targets'))
    except Exception as exc:
        out['morph_count'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
