"""把 CTRL_BROW_POINT 从 VECTOR2D 改成 POSITION（三轴位移控制），轴向对齐 3ds Max 的 K_SXM004。

Max 侧（实测）：
    K_SXM004 是 K_SXM003(Point) 下的一个 Sphere，拖它：
      Max.x  -> 左右眉反向（倾斜）
      Max.z  -> 两眉同向（升降）
      Max.y  -> 无效

UE 侧：
    骨骼/控制本地轴默认 X=前, Y=右, Z=上；Max 是 X=右, Y=前, Z=上
    所以把控制绕 Z 转 90°，本地三轴就变成 X=右, Y=前, Z=上，和 Max 一一对应：
        拖 X（左右）-> 倾斜
        拖 Z（上下）-> 升降
        拖 Y（前后）-> 无效果（和 Max 一样）

驱动逻辑改成读世界位置：
    delta = 控制世界位置 - 初始位置
    tilt  = delta.Y * -0.5 / +0.5
    lift  = delta.Z * +0.5

用法：python Scripts\\ue_run.py Scripts\\build_brow_position_ctrl.py
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
SCALE = 0.5
LIMIT = 1.25  # 值单位；乘以 offset scale 8 后 = 视觉 ±10cm，骨骼 ±5cm（和原来 VECTOR2D 一致）
SHAPE_SCALE = 8.0
HANDLE_CM = 1.6


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def build_graph(ctrl, report):
    prev = 'Begin.ExecutePin'

    gcv = unit(ctrl, 'RigUnit_GetControlVector', 'GET', (380, 0))
    ctrl.set_pin_default_value(gcv + '.Control', CTRL, False, False)
    ctrl.set_pin_default_value(gcv + '.Space', 'GlobalSpace', False, False)

    init = unit(ctrl, 'RigVMFunction_MathVectorMake', 'INIT', (380, -180))
    ctrl.set_pin_default_value(init + '.X', '%f' % POS[0], False, False)
    ctrl.set_pin_default_value(init + '.Y', '%f' % POS[1], False, False)
    ctrl.set_pin_default_value(init + '.Z', '%f' % POS[2], False, False)

    subv = unit(ctrl, 'RigVMFunction_MathVectorSub', 'DVAL', (620, -120))
    ctrl.add_link(gcv + '.Vector', subv + '.A', False)
    ctrl.add_link(init + '.Result', subv + '.B', False)

    # 世界 Y 轴 / 世界 Z 轴常量，用点积取出分量
    axis_y = unit(ctrl, 'RigVMFunction_MathVectorMake', 'AX_Y', (380, -420))
    ctrl.set_pin_default_value(axis_y + '.X', '0.0', False, False)
    ctrl.set_pin_default_value(axis_y + '.Y', '1.0', False, False)
    ctrl.set_pin_default_value(axis_y + '.Z', '0.0', False, False)

    axis_z = unit(ctrl, 'RigVMFunction_MathVectorMake', 'AX_Z', (380, -560))
    ctrl.set_pin_default_value(axis_z + '.X', '0.0', False, False)
    ctrl.set_pin_default_value(axis_z + '.Y', '0.0', False, False)
    ctrl.set_pin_default_value(axis_z + '.Z', '1.0', False, False)

    dy = unit(ctrl, 'RigVMFunction_MathVectorDot', 'DY', (840, -320))
    ctrl.add_link(subv + '.Result', dy + '.A', False)
    ctrl.add_link(axis_y + '.Result', dy + '.B', False)

    dz = unit(ctrl, 'RigVMFunction_MathVectorDot', 'DZ', (840, -200))
    ctrl.add_link(subv + '.Result', dz + '.A', False)
    ctrl.add_link(axis_z + '.Result', dz + '.B', False)

    tilt_l = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_L', (1080, -420))
    ctrl.set_pin_default_value(tilt_l + '.B', '%f' % (-SCALE), False, False)
    ctrl.add_link(dy + '.Result', tilt_l + '.A', False)

    tilt_r = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_R', (1080, -300))
    ctrl.set_pin_default_value(tilt_r + '.B', '%f' % SCALE, False, False)
    ctrl.add_link(dy + '.Result', tilt_r + '.A', False)

    lift = unit(ctrl, 'RigVMFunction_MathFloatMul', 'LIFT', (1080, -180))
    ctrl.set_pin_default_value(lift + '.B', '%f' % SCALE, False, False)
    ctrl.add_link(dz + '.Result', lift + '.A', False)

    add_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_L', (1320, -380))
    add_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_R', (1320, -240))
    ctrl.add_link(tilt_l + '.Result', add_l + '.A', False)
    ctrl.add_link(lift + '.Result', add_l + '.B', False)
    ctrl.add_link(tilt_r + '.Result', add_r + '.A', False)
    ctrl.add_link(lift + '.Result', add_r + '.B', False)

    vec_l = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_L', (1560, -380))
    vec_r = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_R', (1560, -240))
    ctrl.add_link(add_l + '.Result', vec_l + '.Z', False)
    ctrl.add_link(add_r + '.Result', vec_r + '.Z', False)

    for bone, off_node, y_off in (('meibu_L', vec_l, -380), ('meibu_R', vec_r, -240)):
        bt = unit(ctrl, 'RigUnit_GetBoneTransform', 'BT_' + bone, (1560, y_off + 520))
        ctrl.set_pin_default_value(bt + '.Bone', bone, False, False)
        ctrl.set_pin_default_value(bt + '.Space', 'GlobalSpace', False, False)
        vadd = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_' + bone, (1800, y_off + 520))
        ctrl.add_link(bt + '.Transform.Translation', vadd + '.A', False)
        ctrl.add_link(off_node + '.Result', vadd + '.B', False)

        setn = unit(ctrl, 'RigUnit_SetTranslation', 'SET_' + bone, (2040, y_off + 260))
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
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())
    k = key(CTRL)

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Brow control -> POSITION, axis like 3ds Max'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)

            # 1) 类型：POSITION（三轴位移）
            st = h.get_control_settings(k)
            st.control_type = unreal.RigControlType.POSITION
            st.display_name = '眉毛控制点'
            st.shape_name = 'Sphere_Solid'
            st.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
            st.primary_axis = unreal.RigControlAxis.X
            st.draw_limits = False
            st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True),
                                unreal.RigControlLimitEnabled(minimum=True, maximum=True),
                                unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
            st.minimum_value = h.make_control_value_from_vector(unreal.Vector(-LIMIT, -LIMIT, -LIMIT))
            st.maximum_value = h.make_control_value_from_vector(unreal.Vector(LIMIT, LIMIT, LIMIT))
            h.set_control_settings(k, st)
            report['type'] = str(h.get_control_settings(k).control_type)

            # 2) 朝向：不转，本地轴 = 世界轴
            #    红 X = 前后（本控制不用它）
            #    绿 Y = 左右 -> 眉毛一上一下交错
            #    蓝 Z = 上下 -> 眉毛整条一起升降
            off = h.get_global_control_offset_transform(k)
            off.translation = unreal.Vector(*POS)
            off.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
            off.scale3d = unreal.Vector(SHAPE_SCALE, SHAPE_SCALE, SHAPE_SCALE)
            h.set_control_offset_transform(k, off, True, True)
            h.set_control_offset_transform(k, off, False, True)
            def vec3(v):
                return [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
            report['axis_world'] = {
                'red_X': [round(v, 3) for v in (1.0, 0.0, 0.0)],
                'green_Y': [round(v, 3) for v in (0.0, 1.0, 0.0)],
                'blue_Z': [round(v, 3) for v in (0.0, 0.0, 1.0)],
            }
            _r = h.get_global_control_offset_transform(k).rotation.rotator()
            report['ctrl_axis_actual'] = {
                'X_red': vec3(unreal.MathLibrary.get_forward_vector(_r)),
                'Y_green': vec3(unreal.MathLibrary.get_right_vector(_r)),
                'Z_blue': vec3(unreal.MathLibrary.get_up_vector(_r)),
            }

            # 3) 值归零
            h.set_control_value(k, h.make_control_value_from_transform(unreal.Transform()))

            # 4) 图
            build_graph(ctrl, report)

            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    # 5) 自检：拖世界 Y = 倾斜，拖世界 Z = 升降
    #    POSITION 的值是 Vector（不是 Transform），且会被 offset scale 放大，所以除以 SHAPE_SCALE 得到真实厘米位移
    def probe(vx, vy, vz):
        i = rig.create_control_rig()
        i.request_init()
        rh = i.get_hierarchy()
        rh.set_control_value(key(CTRL), rh.make_control_value_from_vector(
            unreal.Vector(vx / SHAPE_SCALE, vy / SHAPE_SCALE, vz / SHAPE_SCALE)))
        i.execute('Forwards Solve')
        return {n: rh.get_global_transform(key(n, unreal.RigElementType.BONE)).translation
                for n in ('meibu_L', 'meibu_R')}

    base = probe(0, 0, 0)
    report['rest_z'] = [round(base[n].z, 3) for n in ('meibu_L', 'meibu_R')]
    for tag, (vx, vy, vz) in (('dragX+10(localX=worldY)', (10, 0, 0)),
                              ('dragZ+10(localZ=worldZ)', (0, 0, 10)),
                              ('dragY+10(localY=world-X)', (0, 10, 0)),
                              ('all0', (0, 0, 0))):
        cur = probe(vx, vy, vz)
        report[tag] = [round(cur[n].z - base[n].z, 3) for n in ('meibu_L', 'meibu_R')]

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        _fm_save_asset(_fm_load_asset(ASSET), False)
        unreal.log('[BrowPosCtrl] saved')
    except Exception:
        unreal.log_error('[BrowPosCtrl] FAILED\n' + traceback.format_exc())
        raise



