"""校验 CR_Seven_MorphSliders 里新增的右眉控制（CTRL_BROW_R / BRR_*）。"""

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
MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    out = {}

    k_ctrl = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='CTRL_BROW_R')
    st = h.get_control_settings(k_ctrl)
    out['control'] = {
        'exists': h.contains(k_ctrl) if hasattr(h, 'contains') else None,
        'type': str(st.control_type),
        'display': str(st.display_name),
        'shape': str(st.shape_name),
        'parent': str(h.get_first_parent(k_ctrl).name) if h.get_first_parent(k_ctrl) else '',
    }

    bones = {}
    for b in ('Bone010', 'Bone011', 'Bone012'):
        kb = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)
        t = h.get_global_transform(kb).translation
        p = h.get_first_parent(kb)
        bones[b] = {'pos': [round(t.x, 3), round(t.y, 3), round(t.z, 3)],
                    'parent': str(p.name) if p else ''}
    out['bones'] = bones

    nodes = [n.get_name() for n in rig.get_default_model().get_nodes()]
    out['brr_nodes'] = len([n for n in nodes if n.startswith('BRR_')])
    out['brw_nodes'] = len([n for n in nodes if n.startswith('BRW_')])
    out['status'] = str(rig.get_editor_property('status'))

    def solve(v):
        i = rig.create_control_rig()
        i.request_init()
        rh = i.get_hierarchy()
        rh.set_control_value(k_ctrl, rh.make_control_value_from_vector(unreal.Vector(*v)))
        i.execute('Forwards Solve')
        return {b: rh.get_global_transform(
            unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)).translation
            for b in bones}

    base = solve((0, 0, 0))
    for tag, v in (('X+10', (10, 0, 0)), ('X-10', (-10, 0, 0)),
                   ('Z+10', (0, 0, 10)), ('Z-10', (0, 0, -10))):
        cur = solve(v)
        out[tag] = {b: [round(cur[b].x - base[b].x, 2),
                        round(cur[b].y - base[b].y, 2),
                        round(cur[b].z - base[b].z, 2)] for b in bones}

    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
