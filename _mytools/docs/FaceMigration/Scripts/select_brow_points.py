"""选中六个新控制并截屏前检查。"""

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
CONTROLS = ['CTRL_BROW_L_IN', 'CTRL_BROW_L_MID', 'CTRL_BROW_L_OUT',
            'CTRL_BROW_R_IN', 'CTRL_BROW_R_MID', 'CTRL_BROW_R_OUT']


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    out = {'methods': [m for m in dir(hc) if 'select' in m.lower()]}
    keys = [unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c) for c in CONTROLS]
    try:
        hc.set_selection(keys)
        out['set_selection'] = 'OK'
    except Exception as exc:
        out['set_selection'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
