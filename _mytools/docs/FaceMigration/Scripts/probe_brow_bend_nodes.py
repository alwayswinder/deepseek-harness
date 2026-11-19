"""检查 BB_ 节点无重复、编译状态。"""

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
    names = [str(n.get_name()) for n in rig.get_default_model().get_nodes()]
    bb = [n for n in names if n.startswith('BB_')]
    out = {
        'status': str(rig.get_editor_property('status')),
        'node_total': len(names),
        'bb_count': len(bb),
        'bb_dup': len(bb) != len(set(bb)),
        'bb_names': bb,
    }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
