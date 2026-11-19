"""读 RigVM 连线（用 get_source_pin/get_target_pin），检查 Begin 执行流与 BROW 链。"""

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

rig = _fm_load_asset(ASSET)
model = rig.get_default_model()
links = list(model.get_links())

pairs = []
for link in links:
    try:
        s = str(link.get_pin_path_representation(link.get_source_pin()))
    except Exception:
        try:
            s = str(link.get_source_pin())
        except Exception:
            s = None
    try:
        d = str(link.get_pin_path_representation(link.get_target_pin()))
    except Exception:
        try:
            d = str(link.get_target_pin())
        except Exception:
            d = None
    pairs.append([s, d])

out = {'count': len(pairs), 'sample': pairs[:6]}

exec_pairs = [p for p in pairs if p[0] and (p[0].endswith('.Execute') or '.Execute.' in p[0])]
out['exec_sample'] = exec_pairs[:40]
out['exec_count'] = len(exec_pairs)

brow = [p for p in pairs if (p[0] and 'BROW' in p[0]) or (p[1] and 'BROW' in p[1])]
out['brow_count'] = len(brow)
out['brow_sample'] = brow[:40]

begin = [p for p in pairs if (p[0] and p[0].startswith(_fm_node('Begin'))) or (p[1] and p[1].startswith(_fm_node('Begin')))]
out['begin_links'] = begin

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
