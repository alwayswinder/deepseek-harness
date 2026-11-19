"""实验：闭眼 + 把眼球骨向后(-Y)平移 0.6cm，看穿模是否消失（判断是不是眼球/眼皮间隙问题）。"""

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


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(ASSET)
inst = rig.get_debugged_control_rig()
rh = inst.get_hierarchy()
for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
    rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
inst.execute('Forwards Solve')

out = {}
for b in ('yanqiu_R', 'yanqiu_L'):
    t = rh.get_global_transform(bkey(b))
    before = [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)]
    t.translation.y -= 0.6
    rh.set_global_transform(bkey(b), t, True)
    inst.execute('Forwards Solve')
    t2 = rh.get_global_transform(bkey(b))
    out[b] = {'before': before, 'after': [round(t2.translation.x, 3), round(t2.translation.y, 3), round(t2.translation.z, 3)]}
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False))
print('JSONEND')
