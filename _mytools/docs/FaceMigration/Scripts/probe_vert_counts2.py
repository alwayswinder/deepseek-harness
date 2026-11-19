
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal, json
sub = unreal.get_editor_subsystem(unreal.SkeletalMeshEditorSubsystem)
out = {}
for tag, path in (("old", _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')), ("new", _fm_asset('/Game/_MyTest/Mouth/TMp/Seven_Skeletal_2026-11-06'))):
    m = _fm_load_asset(path)
    rec = {}
    try: rec["num_verts"] = sub.get_num_verts(m, 0)
    except Exception as e: rec["num_verts"] = "ERR %r" % e
    try: rec["num_sections"] = sub.get_num_sections(m, 0)
    except Exception as e: rec["num_sections"] = "ERR %r" % e
    try: rec["morphs"] = len(m.get_editor_property("morph_targets") or [])
    except Exception as e: rec["morphs"] = "ERR"
    out[tag] = rec
print("JSONSTART")
print(json.dumps(out, ensure_ascii=False, indent=1))
print("JSONEND")
