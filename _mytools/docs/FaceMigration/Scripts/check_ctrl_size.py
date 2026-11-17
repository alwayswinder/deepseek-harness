
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
rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'))
h = rig.get_hierarchy()
out = []
for k in h.get_all_keys():
    if k.type == unreal.RigElementType.CONTROL:
        st = h.get_control_settings(k)
        off = h.get_global_control_offset_transform(k)
        shp = h.get_local_control_shape_transform(k)
        out.append({"name": str(k.name), "display": str(st.display_name), "type": str(st.control_type),
                    "shape": str(st.shape_name), "offset_scale": round(off.scale3d.x, 2),
                    "shape_scale": round(shp.scale3d.x, 4),
                    "pos": [round(off.translation.x,1), round(off.translation.y,1), round(off.translation.z,1)]})
print(json.dumps(out, ensure_ascii=False, indent=1))
print("nodes:", len([n for n in rig.get_default_model().get_nodes()]))
