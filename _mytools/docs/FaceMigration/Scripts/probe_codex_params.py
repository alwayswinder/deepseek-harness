"""读 codex 版 SQUAT 的轴/增益，和 OQUAT 的轴/角度对比。"""

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

RIG = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')

rig = _fm_load_asset(RIG)
ctrl = rig.get_controller(rig.get_default_model())
out = {}
for b in ('Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038'):
    rec = {}
    for pin in ('OQUAT_%s.Axis' % b, 'OANG_%s.B' % b, 'SQUAT_%s.Axis' % b, 'SANG_%s.B' % b):
        try:
            rec[pin] = ctrl.get_pin_default_value('LID_' + pin)
        except Exception as exc:
            rec[pin] = 'ERR %r' % exc
    out[b] = rec

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
