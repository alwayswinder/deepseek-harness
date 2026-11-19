"""查 RigControlSettings 里与手柄显示相关的属性（shape transform 等）。"""

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
    k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='CTRL_BROW_L')
    st = h.get_control_settings(k)

    out = {'props': []}
    for p in dir(st):
        if p.startswith('_'):
            continue
        low = p.lower()
        if 'shape' in low or 'color' in low or 'transform' in low or 'scale' in low:
            try:
                v = getattr(st, p)
                out['props'].append({'name': p, 'value': str(v)[:120]})
            except Exception as exc:
                out['props'].append({'name': p, 'error': repr(exc)[:80]})

    out['offset_scale'] = [round(x, 3) for x in (
        h.get_global_control_offset_transform(k).scale3d.x,
        h.get_global_control_offset_transform(k).scale3d.y,
        h.get_global_control_offset_transform(k).scale3d.z)]

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
