"""用原 Seven.fbx 覆盖导入 Mesh/Seven（8 骨影响设置生效后）。"""

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


def main():
    fbx = source_path('fbx')
    out = {}
    mesh_before = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Mesh/Seven'))
    sk_before = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Mesh/Seven_Skeleton'))
    out['before'] = {
        'mesh': str(mesh_before) if mesh_before else None,
        'bones': len(sk_before.get_editor_property('bone_tree')) if sk_before else None,
        'morphs': len(mesh_before.get_editor_property('morph_targets')) if mesh_before else None,
    }

    task = unreal.AssetImportTask()
    task.filename = str(fbx)
    destination = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
    task.destination_path, task.destination_name = destination.rsplit('/', 1)
    task.replace_existing = True
    task.automated = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    out['imported'] = [str(p) for p in task.imported_object_paths]

    mesh_after = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Mesh/Seven'))
    sk_after = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Mesh/Seven_Skeleton'))
    out['after'] = {
        'mesh': str(mesh_after) if mesh_after else None,
        'bones': len(sk_after.get_editor_property('bone_tree')) if sk_after else None,
        'morphs': len(mesh_after.get_editor_property('morph_targets')) if mesh_after else None,
    }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
