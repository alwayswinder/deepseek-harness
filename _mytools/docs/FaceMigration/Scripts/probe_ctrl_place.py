"""确认两个控制手柄的世界位置/大小，并查 ControlRig 编辑器相关 Python 入口。"""

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
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    out = {'controls': {}}
    for name in ('CTRL_BROW_L', 'CTRL_BROW_R'):
        k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)
        g = h.get_global_control_offset_transform(k)
        out['controls'][name] = {
            'world_t': [round(g.translation.x, 2), round(g.translation.y, 2), round(g.translation.z, 2)],
            'scale': [round(g.scale3d.x, 2), round(g.scale3d.y, 2), round(g.scale3d.z, 2)],
        }
    out['editor_classes'] = [n for n in dir(unreal) if 'ControlRigEditor' in n or 'PreviewMode' in n]
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
