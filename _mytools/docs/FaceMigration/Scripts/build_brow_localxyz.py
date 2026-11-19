"""眉毛控制点：直接读控制自己的本地 X/Z 分量来驱动，不经过世界坐标换算。

目标（按 3ds Max 的 K_SXM004 语义）：
    控制本地 X（红箭头，左右） -> 眉毛一上一下交错
    控制本地 Z（蓝箭头，上下） -> 眉毛整条一起升降
    控制本地 Y（绿箭头，前后） -> 不使用

控制旋转保持绕 Z 90°，让红箭头指向角色左右、蓝箭头朝上，和 Max 面板一致。
因为读的是控制自己的本地值，Sequencer 里 Location 的 X/Y/Z 就是这三个分量，一一对应。

用法：python Scripts\\ue_run.py Scripts\\build_brow_localxyz.py
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
PREFIX = 'BRW_'
POS = (-30.0, 15.68, 152.0)
SCALE = 4.0  # 本地值 1.25 = 视觉拖 10cm -> 骨骼 5cm（和 Max 的 10 单位对 5cm 一致）
LIMIT = 1.25
SHAPE_SCALE = 8.0
YAW_QUAT = unreal.Quat(0.0, 0.0, 0.70710678, 0.70710678)


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def build_graph(ctrl):
    prev = 'Begin.ExecutePin'

    gcv = unit(ctrl, 'RigUnit_GetControlVector', 'GET', (380, 0))
    ctrl.set_pin_default_value(gcv + '.Control', CTRL, False, False)
    ctrl.set_pin_default_value(gcv + '.Space', 'LocalSpace', False, False)

    axis = {}
    for tag, vec in (('X', (1.0, 0.0, 0.0)), ('Y', (0.0, 1.0, 0.0)), ('Z', (0.0, 0.0, 1.0))):
        n = unit(ctrl, 'RigVMFunction_MathVectorMake', 'AX_' + tag, (380, -180 - 140 * len(axis)))
        ctrl.set_pin_default_value(n + '.X', '%f' % vec[0], False, False)
        ctrl.set_pin_default_value(n + '.Y', '%f' % vec[1], False, False)
        ctrl.set_pin_default_value(n + '.Z', '%f' % vec[2], False, False)
        axis[tag] = n

    # 分量
    comp = {}
    for tag in ('X', 'Y', 'Z'):
        dot = unit(ctrl, 'RigVMFunction_MathVectorDot', 'DOT_' + tag, (620, -180 - 140 * ('X', 'Y', 'Z').index(tag)))
        ctrl.add_link(gcv + '.Vector', dot + '.A', False)
        ctrl.add_link(axis[tag] + '.Result', dot + '.B', False)
        comp[tag] = dot

    tilt_l = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_L', (880, -420))
    ctrl.set_pin_default_value(tilt_l + '.B', '%f' % (-SCALE), False, False)
    ctrl.add_link(comp['X'] + '.Result', tilt_l + '.A', False)

    tilt_r = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_R', (880, -300))
    ctrl.set_pin_default_value(tilt_r + '.B', '%f' % SCALE, False, False)
    ctrl.add_link(comp['X'] + '.Result', tilt_r + '.A', False)

    lift = unit(ctrl, 'RigVMFunction_MathFloatMul', 'LIFT', (880, -180))
    ctrl.set_pin_default_value(lift + '.B', '%f' % SCALE, False, False)
    ctrl.add_link(comp['Z'] + '.Result', lift + '.A', False)

    add_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_L', (1120, -380))
    add_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_R', (1120, -240))
    ctrl.add_link(tilt_l + '.Result', add_l + '.A', False)
    ctrl.add_link(lift + '.Result', add_l + '.B', False)
    ctrl.add_link(tilt_r + '.Result', add_r + '.A', False)
    ctrl.add_link(lift + '.Result', add_r + '.B', False)

    vec_l = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_L', (1360, -380))
    vec_r = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_R', (1360, -240))
    ctrl.add_link(add_l + '.Result', vec_l + '.Z', False)
    ctrl.add_link(add_r + '.Result', vec_r + '.Z', False)

    for bone, off_node, y_off in (('meibu_L', vec_l, -380), ('meibu_R', vec_r, -240)):
        bt = unit(ctrl, 'RigUnit_GetBoneTransform', 'BT_' + bone, (1360, y_off + 520))
        ctrl.set_pin_default_value(bt + '.Bone', bone, False, False)
        ctrl.set_pin_default_value(bt + '.Space', 'GlobalSpace', False, False)
        vadd = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_' + bone, (1600, y_off + 520))
        ctrl.add_link(bt + '.Transform.Translation', vadd + '.A', False)
        ctrl.add_link(off_node + '.Result', vadd + '.B', False)

        setn = unit(ctrl, 'RigUnit_SetTranslation', 'SET_' + bone, (1840, y_off + 260))
        ctrl.set_pin_default_value(setn + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
        ctrl.set_pin_default_value(setn + '.Space', 'GlobalSpace', False, False)
        ctrl.set_pin_default_value(setn + '.bInitial', 'False', False, False)
        ctrl.add_link(vadd + '.Result', setn + '.Translation', False)
        ctrl.add_link(prev, setn + '.ExecutePin', False)
        prev = setn + '.ExecutePin'


def main():
    report = {}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    ctrl = rig.get_controller(rig.get_default_model())
    k = key(CTRL)

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Brow control drive by local X/Z'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)

            st = h.get_control_settings(k)
            st.control_type = unreal.RigControlType.POSITION
            st.display_name = '眉毛控制点'
            st.shape_name = 'Sphere_Solid'
            st.primary_axis = unreal.RigControlAxis.X
            st.draw_limits = False
            st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
            st.minimum_value = h.make_control_value_from_vector(unreal.Vector(-LIMIT, -LIMIT, -LIMIT))
            st.maximum_value = h.make_control_value_from_vector(unreal.Vector(LIMIT, LIMIT, LIMIT))
            h.set_control_settings(k, st)

            off = h.get_global_control_offset_transform(k)
            off.translation = unreal.Vector(*POS)
            off.rotation = YAW_QUAT
            off.scale3d = unreal.Vector(SHAPE_SCALE, SHAPE_SCALE, SHAPE_SCALE)
            h.set_control_offset_transform(k, off, True, True)
            h.set_control_offset_transform(k, off, False, True)
            h.set_control_value(k, h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))

            build_graph(ctrl)
            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    def probe(v):
        i = rig.create_control_rig()
        i.request_init()
        rh = i.get_hierarchy()
        rh.set_control_value(key(CTRL), rh.make_control_value_from_vector(unreal.Vector(*v)))
        i.execute('Forwards Solve')
        return {n: rh.get_global_transform(key(n, unreal.RigElementType.BONE)).translation
                for n in ('meibu_L', 'meibu_R')}

    base = probe((0, 0, 0))
    report['rest'] = [round(base[n].z, 3) for n in ('meibu_L', 'meibu_R')]
    for tag, v in (('local_X_+1 (红/左右) -> 应交错', (1, 0, 0)),
                   ('local_Z_+1 (蓝/上下) -> 应同向升降', (0, 0, 1)),
                   ('local_Y_+1 (绿/前后) -> 应无', (0, 1, 0))):
        cur = probe(v)
        report[tag] = {
            'dL': [round(cur['meibu_L'].x - base['meibu_L'].x, 2),
                   round(cur['meibu_L'].y - base['meibu_L'].y, 2),
                   round(cur['meibu_L'].z - base['meibu_L'].z, 2)],
            'dR': [round(cur['meibu_R'].x - base['meibu_R'].x, 2),
                   round(cur['meibu_R'].y - base['meibu_R'].y, 2),
                   round(cur['meibu_R'].z - base['meibu_R'].z, 2)],
        }

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        _fm_save_asset(_fm_load_asset(ASSET), False)
        unreal.log('[BrowLocalXYZ] saved')
    except Exception:
        unreal.log_error('[BrowLocalXYZ] FAILED\n' + traceback.format_exc())
        raise
