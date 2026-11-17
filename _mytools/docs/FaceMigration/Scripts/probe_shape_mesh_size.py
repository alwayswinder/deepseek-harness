"""读取 ControlRig 内置形状资产的包围盒，换算 shape scale 到厘米。"""

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

NAMES = ['ControlRig_Box_1mm', 'ControlRig_Box_3mm', 'ControlRig_Box', 'ControlRig_Sphere',
         'ControlRig_Circle', 'ControlRig_Diamond', 'ControlRig_Square']


def main():
    out = {}
    paths = [
        '/Engine/Plugins/Animation/ControlRig/Content/Controls/ControlRigShapes',
        '/Engine/Plugins/Animation/ControlRig/Content/Controls',
    ]
    found = {}
    for p in paths:
        try:
            assets = unreal.EditorAssetLibrary.list_assets(p, True, False)
            for a in assets:
                n = str(a).split('.')[-1].split('/')[-1]
                found[n] = str(a)
        except Exception as exc:
            out['list_err_' + p] = repr(exc)

    for n in NAMES:
        path = found.get(n)
        if not path:
            out[n] = 'not found'
            continue
        try:
            mesh = _fm_load_asset(path)
            if mesh is None:
                out[n] = 'load None'
                continue
            b = mesh.get_bounding_box()
            out[n] = {
                'path': path,
                'min': [round(b.min.x, 3), round(b.min.y, 3), round(b.min.z, 3)],
                'max': [round(b.max.x, 3), round(b.max.y, 3), round(b.max.z, 3)],
                'size': [round(b.max.x - b.min.x, 3), round(b.max.y - b.min.y, 3), round(b.max.z - b.min.z, 3)],
            }
        except Exception as exc:
            out[n] = 'ERR %r' % exc

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
