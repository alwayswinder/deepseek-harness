"""探测 import_bones_from_skeletal_mesh 的签名与全量导入结果。"""

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
    fn = unreal.RigHierarchyController.import_bones_from_skeletal_mesh
    out['doc'] = str(unreal.RigHierarchyController.import_bones_from_skeletal_mesh.__doc__)
    out['help'] = str(unreal.RigHierarchyController.import_bones_from_skeletal_mesh)

    try:
        h = unreal.new_object(unreal.RigHierarchy)
        hc = h.get_controller(True)
        mesh = _fm_load_asset(MESH)
        r = hc.import_bones_from_skeletal_mesh(mesh, 'None', False, True, True, True, False)
        out['call1_ok'] = str(r)
        out['call1_bones'] = len([k for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE])
    except Exception as exc:
        out['call1_err'] = repr(exc)

    try:
        h2 = unreal.new_object(unreal.RigHierarchy)
        hc2 = h2.get_controller(True)
        mesh = _fm_load_asset(MESH)
        r = hc2.import_bones_from_skeletal_mesh(mesh)
        out['call2_ok'] = str(r)
        out['call2_bones'] = len([k for k in h2.get_all_keys() if k.type == unreal.RigElementType.BONE])
    except Exception as exc:
        out['call2_err'] = repr(exc)

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
