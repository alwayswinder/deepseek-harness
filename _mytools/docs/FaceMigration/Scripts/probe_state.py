
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
ctrl = rig.get_controller(rig.get_default_model())
model = rig.get_default_model()

info = []
for n in model.get_nodes():
    nm = n.get_name()
    if not nm.startswith('BROW_'):
        continue
    pins = {}
    for p in n.get_pins():
        try:
            pname = p.get_name()
        except AttributeError:
            pname = str(p)
        try:
            dv = p.get_default_value()
        except Exception:
            dv = None
        try:
            src = [str(s) for s in p.get_sources()]
        except Exception:
            src = None
        pins[pname] = {'default': dv, 'sources': src}
    info.append({'node': nm, 'pins': pins})

print(json.dumps(info, ensure_ascii=False, indent=1))
