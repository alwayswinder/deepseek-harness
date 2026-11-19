"""只读：确认目标 Rig 上眉毛所需骨骼/父级/形状库是否存在。"""

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

TARGET = _fm_asset('/Game/_MyTest/Mouth/Rig/NewControlRigRuntimeAsset')
CTRL = '/ControlRig/Controls/DefaultGizmoLibraryNormalized'
BONES = ['Root', 'meibu_L', 'meibu_R', 'Bone007', 'Bone008', 'Bone009', 'Bone010', 'Bone011', 'Bone012']


def main():
    asset = unreal.load_asset(TARGET)
    h = asset.hierarchy
    hc = h.get_controller()
    present = {}
    for b in BONES:
        present[b] = h.contains(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b))
    lib = unreal.load_asset(CTRL)
    shapes = [str(s.get_editor_property('shape_name')) for s in lib.get_editor_property('shapes')]
    out = {
        'bones_present': present,
        'all_key_count': len(h.get_all_keys()),
        'shape_count': len(shapes),
        'has_box_thick': 'Box_Thick' in shapes,
        'hc_can_add_control': hasattr(hc, 'add_control'),
        'is_runtime': asset.get_class().get_name(),
    }
    print('PROBE4:' + json.dumps(out, ensure_ascii=False))


main()
