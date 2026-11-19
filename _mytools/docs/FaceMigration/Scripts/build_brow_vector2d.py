"""眉毛控制点：回到 VECTOR2D（Sequencer 里原有轨迹能继续用），只修两个手柄的朝向。

UE 里 VECTOR2D 控制有两个手柄，沿控制本地 X / Y。
默认本地 X = 世界 +X（前后），这就是之前「方向不对」的根源。

把 offset 旋转设成四元数 (0.5, 0.5, 0.5, 0.5)，本地轴变成：
    本地 X -> 世界 +Y（角色左右）  -> 手柄一左一右
    本地 Y -> 世界 +Z（上）        -> 手柄一上一下
    本地 Z -> 世界 +X（前）

于是：
    拖左右手柄 -> 眉毛一上一下交错
    拖上下手柄 -> 眉毛整条升降
（对应 3ds Max 里 K_SXM004 的 X 和 Z，Y 本来就不用）

用法：python Scripts\\ue_run.py Scripts\\build_brow_vector2d.py
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
RANGE = 10.0
SHAPE_SCALE = 8.0
ROT = unreal.Quat(0.5, 0.5, 0.5, 0.5)   # X->世界Y, Y->世界Z, Z->世界X


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def v2val(x, y):
    return unreal.RigHierarchy.make_control_value_from_vector2d(unreal.Vector2D(x, y))


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def build_graph(ctrl):
    prev = 'Begin.ExecutePin'
    get = unit(ctrl, 'RigUnit_GetControlVector2D', 'GET', (400, 0))
    ctrl.set_pin_default_value(get + '.Control', CTRL, False, False)

    tilt_l = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_L', (700, -200))
    ctrl.set_pin_default_value(tilt_l + '.B', '%f' % (-SCALE), False, False)
    ctrl.add_link(get + '.Vector.Y', tilt_l + '.A', False)

    tilt_r = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_R', (700, -60))
    ctrl.set_pin_default_value(tilt_r + '.B', '%f' % SCALE, False, False)
    ctrl.add_link(get + '.Vector.Y', tilt_r + '.A', False)

    lift = unit(ctrl, 'RigVMFunction_MathFloatMul', 'LIFT', (700, 80))
    ctrl.set_pin_default_value(lift + '.B', '%f' % SCALE, False, False)
    ctrl.add_link(get + '.Vector.X', lift + '.A', False)

    add_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_L', (950, -160))
    add_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_R', (950, 40))
    ctrl.add_link(tilt_l + '.Result', add_l + '.A', False)
    ctrl.add_link(lift + '.Result', add_l + '.B', False)
    ctrl.add_link(tilt_r + '.Result', add_r + '.A', False)
    ctrl.add_link(lift + '.Result', add_r + '.B', False)

    vec_l = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_L', (1200, -160))
    vec_r = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_R', (1200, 40))
    ctrl.add_link(add_l + '.Result', vec_l + '.X', False)
    ctrl.add_link(add_r + '.Result', vec_r + '.X', False)

    for bone, off_node, y_off in (('meibu_L', vec_l, -160), ('meibu_R', vec_r, 260)):
        bt = unit(ctrl, 'RigUnit_GetBoneTransform', 'BT_' + bone, (1200, y_off + 300))
        ctrl.set_pin_default_value(bt + '.Bone', bone, False, False)
        ctrl.set_pin_default_value(bt + '.Space', 'GlobalSpace', False, False)
        vadd = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_' + bone, (1500, y_off + 300))
        ctrl.add_link(bt + '.Transform.Translation', vadd + '.A', False)
        ctrl.add_link(off_node + '.Result', vadd + '.B', False)

        setn = unit(ctrl, 'RigUnit_SetTranslation', 'SET_' + bone, (1800, y_off))
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
    with unreal.ScopedEditorTransaction('Brow control back to VECTOR2D with upright handles'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)

            st = h.get_control_settings(k)
            st.control_type = unreal.RigControlType.VECTOR2D
            st.display_name = '眉毛控制点'
            st.shape_name = 'Sphere_Solid'
            st.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
            st.primary_axis = unreal.RigControlAxis.X
            st.draw_limits = False
            st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True),
                                unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
            st.minimum_value = v2val(-RANGE, -RANGE)
            st.maximum_value = v2val(RANGE, RANGE)
            h.set_control_settings(k, st)

            off = h.get_global_control_offset_transform(k)
            off.translation = unreal.Vector(*POS)
            off.rotation = ROT
            off.scale3d = unreal.Vector(SHAPE_SCALE, SHAPE_SCALE, SHAPE_SCALE)
            h.set_control_offset_transform(k, off, True, True)
            h.set_control_offset_transform(k, off, False, True)
            h.set_control_value(k, v2val(0.0, 0.0))

            build_graph(ctrl)
            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'

            r = h.get_global_control_offset_transform(k).rotation.rotator()
            report['axes'] = {
                'X_handle': [round(v, 3) for v in (unreal.MathLibrary.get_forward_vector(r).x,
                                                   unreal.MathLibrary.get_forward_vector(r).y,
                                                   unreal.MathLibrary.get_forward_vector(r).z)],
                'Y_handle': [round(v, 3) for v in (unreal.MathLibrary.get_right_vector(r).x,
                                                   unreal.MathLibrary.get_right_vector(r).y,
                                                   unreal.MathLibrary.get_right_vector(r).z)],
            }
        finally:
            rig.set_auto_vm_recompile(old_auto)

    def probe(x, y):
        i = rig.create_control_rig()
        i.request_init()
        rh = i.get_hierarchy()
        rh.set_control_value(key(CTRL), v2val(x, y))
        i.execute('Forwards Solve')
        return {n: rh.get_global_transform(key(n, unreal.RigElementType.BONE)).translation.z
                for n in ('meibu_L', 'meibu_R')}

    base = probe(0, 0)
    for tag, (x, y) in (('X+10 (左右手柄) -> 应交错', (10, 0)),
                        ('Y+10 (上下手柄) -> 应整体升降', (0, 10))):
        cur = probe(x, y)
        report[tag] = [round(cur[n] - base[n], 2) for n in ('meibu_L', 'meibu_R')]

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        _fm_save_asset(_fm_load_asset(ASSET), False)
        unreal.log('[BrowV2D] saved')
    except Exception:
        unreal.log_error('[BrowV2D] FAILED\n' + traceback.format_exc())
        raise

