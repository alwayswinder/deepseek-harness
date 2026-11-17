
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

out = {}
eal = unreal.EditorAssetLibrary
for p in (_fm_asset('/Game/CR_Seven_MorphSliders_Take1'), _fm_asset('/Game/CR_Seven_MorphSliders_Take2')):
    try:
        a = eal.load_asset(p)
        info = {"class": a.get_class().get_name() if a else None, "path": a.get_path_name() if a else None}
        if a:
            try:
                info["seq"] = str(a.get_editor_property("sequence")) if hasattr(a, "get_editor_property") else None
            except Exception:
                pass
            try:
                info["tracks"] = [str(t.get_class().get_name()) for t in a.get_editor_property("tracks")]
            except Exception as exc:
                info["tracks"] = "n/a: %r" % (exc,)
        out[p] = info
    except Exception as exc:
        out[p] = "err %r" % (exc,)

rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'))
h = rig.get_hierarchy()
out["rig"] = {
    "elements": len(h.get_all_keys()),
    "nodes": [n.get_name() for n in rig.get_default_model().get_nodes()],
    "status": str(rig.get_editor_property("status")),
    "package_dirty": unreal.EditorAssetLibrary.does_asset_exist(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')),
}
print(json.dumps(out, ensure_ascii=False, indent=1))
