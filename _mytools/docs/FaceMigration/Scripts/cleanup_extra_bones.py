"""清掉误导入到 CR_Seven_MorphSliders 的 head_ 前缀整条骨架，只留 head / meibu_L / meibu_R。"""

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
h = rig.get_hierarchy()
hc = rig.get_hierarchy_controller()

KEEP = {'head', 'meibu_L', 'meibu_R'}
extra = [str(k.name) for k in h.get_all_keys()
         if k.type == unreal.RigElementType.BONE and str(k.name) not in KEEP]
print("extra bones:", len(extra))

removed = []
rig.modify()
with unreal.ScopedEditorTransaction('Remove stray imported bones'):
    # 从叶到根删除，避免父级结构报错
    for name in reversed(extra):
        k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=name)
        if h.contains(k):
            hc.remove_element(k, True, True)
            removed.append(name)

left = [str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE]
print("removed:", len(removed), "left:", left)

rig.recompile_vm()
print("status:", rig.get_editor_property('status'))
_fm_save_asset(rig, False)
print(json.dumps({'removed': len(removed), 'bones_left': left}, ensure_ascii=False))
