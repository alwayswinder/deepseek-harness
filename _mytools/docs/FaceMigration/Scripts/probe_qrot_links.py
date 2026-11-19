"""读 codex 版 LID_QROT 的输入连接，确认旋转用的是公转四元数（OQUAT）还是自转（SQUAT）。"""

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
model = rig.get_default_model()

targets = {}
for link in model.get_links():
    try:
        tn = str(link.get_target_node().get_name())
        tp = str(link.get_target_pin().get_name())
        sn = str(link.get_source_node().get_name())
        sp = str(link.get_source_pin().get_name())
    except Exception:
        continue
    if tn.startswith('LID_QROT') or tn.startswith('LID_SQ') or tn.startswith('LID_OQ'):
        targets.setdefault(tn, []).append({'pin': tp, 'from': '%s.%s' % (sn, sp)})

print('JSONSTART')
print(json.dumps(targets, ensure_ascii=False, indent=1))
print('JSONEND')
