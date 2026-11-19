"""探测 RigVMController 的链接 API 与形状库。"""

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

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')


def main():
    out = {}
    rig = _fm_load_asset(ASSET)
    ctrl = rig.get_controller(rig.get_default_model())
    out['link_methods'] = [m for m in dir(ctrl) if 'link' in m.lower()]
    out['pin_methods'] = [m for m in dir(ctrl) if 'pin' in m.lower()]
    out['hierarchy_methods'] = [m for m in dir(rig.get_hierarchy()) if 'shape' in m.lower()]
    try:
        out['shape_lib'] = [m for m in dir(unreal.ControlRigShapeLibrary) if not m.startswith('_')]
    except Exception as exc:
        out['shape_lib'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
