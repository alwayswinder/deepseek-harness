"""列出 Seven 骨架里的眉部骨骼。"""

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
    sk = mesh.get_editor_property('skeleton')
    out = {'mesh': MESH, 'skeleton': sk.get_path_name() if sk else None}
    names = []
    if sk:
        count = unreal.SkeletalMeshEditorSubsystem  # noqa
        try:
            ref_skel = sk.get_editor_property('skeleton')
        except Exception:
            pass
        try:
            ni = sk.get_editor_property('bone_tree')
        except Exception:
            ni = None
        names = [str(n) for n in (sk.get_editor_property('bone_tree') or [])]
    out['bone_tree_raw'] = names

    # 通过 skeleton 的 reference skeleton 取名字
    try:
        ref = _fm_load_asset(sk.get_path_name())
        rig = unreal.new_object(unreal.RigHierarchy)
        rig.get_controller(True).import_bones_from_skeletal_mesh(
            mesh, 'None', True, True, False, False, False)
        keys = [k for k in rig.get_all_keys()]
        bones = sorted(str(k.name) for k in keys if k.type == unreal.RigElementType.BONE)
        out['bone_count'] = len(bones)
        out['bones'] = bones
    except Exception as exc:
        out['import_err'] = repr(exc)

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
