"""查 Control Rig 预览模式相关 API。"""

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
    out = {'dir_previewmode': [], 'rig_attrs': []}
    for n in dir(unreal):
        if 'PreviewMode' in n or 'Previewing' in n:
            out['dir_previewmode'].append(n)
    for p in dir(rig):
        if 'preview' in p.lower() or 'mode' in p.lower():
            out['rig_attrs'].append(p)

    for prop in ('preview_mode', 'PreviewMode'):
        try:
            out[prop] = str(rig.get_editor_property(prop))
        except Exception as exc:
            out[prop] = 'ERR %r' % exc

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
