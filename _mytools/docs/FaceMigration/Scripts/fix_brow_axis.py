r"""把 CTRL_BROW_POINT 的轴向对齐到 3ds Max 的 K_SXM004。

3ds Max 里控制器的 pivot 轴是「世界轴」：X=左右, Y=前后, Z=上下
UE 里骨骼/控制器的本地轴默认是：X=前,   Y=右,   Z=上

所以同一个「X」，在 Max 里是左右，在 UE 里是前后 —— 直接照搬一定差 90°。

两种对齐方式（改文件顶部 MODE 后重跑，幂等）：

  MODE = 'v2d'    VECTOR2D 控制（当前用的类型）
                  本地 X -> 世界 +Y（右），本地 Y -> 世界 +Z（上）
                  四元数 (0.5, 0.5, 0.5, 0.5)
                  视口里两个手柄一左一右、一上一下，正好对应 Max 的 X 和 Z

  MODE = 'xform'  Transform 控制（三轴 gizmo，手感最接近 Max）
                  本地 X -> 世界 +Y（右），本地 Y -> 世界 -X（前），本地 Z -> 世界 +Z（上）
                  Rotator(yaw=90)

用法（编辑器开着时）：
    python Scripts\ue_run.py Scripts\fix_brow_axis.py
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import traceback

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
CTRL = 'CTRL_BROW_POINT'
MODE = 'v2d'          # 'v2d' | 'xform'

V2D_QUAT = unreal.Quat(0.5, 0.5, 0.5, 0.5)
XFORM_ROT = unreal.Rotator(roll=0.0, pitch=0.0, yaw=90.0)


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def axes(quat):
    m = unreal.MathLibrary
    r = quat.rotator()
    f = m.get_forward_vector(r)
    rt = m.get_right_vector(r)
    u = m.get_up_vector(r)

    def s(v):
        return [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
    return {'X(right/left)': s(f), 'Y(other side)': s(rt), 'Z(up)': s(u)}


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    k = key(CTRL)
    off = h.get_global_control_offset_transform(k)
    before = axes(off.rotation)

    if MODE == 'v2d':
        new_rot = V2D_QUAT
    else:
        new_rot = XFORM_ROT.quaternion()

    out = {
        'mode': MODE,
        'before_quat': [round(off.rotation.x, 4), round(off.rotation.y, 4),
                        round(off.rotation.z, 4), round(off.rotation.w, 4)],
        'before_axes': before,
        'after_quat': [round(new_rot.x, 4), round(new_rot.y, 4),
                       round(new_rot.z, 4), round(new_rot.w, 4)],
        'after_axes': axes(new_rot),
    }

    off.rotation = new_rot
    rig.modify()
    with unreal.ScopedEditorTransaction('Align brow control axis to Max'):
        h.set_control_offset_transform(k, off, True, True)
        h.set_control_offset_transform(k, off, False, True)
        rig.recompile_vm()
    _fm_save_asset(rig, False)
    out['status'] = str(rig.get_editor_property('status'))
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        unreal.log_error('[FixBrowAxis] FAILED\n' + traceback.format_exc())
        raise
