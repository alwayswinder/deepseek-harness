"""VECTOR2D 眉毛控制点（相对偏移版）。

3ds Max 实测（K_SXM004）：
    pos.x +d  -> meibu_L 世界 Z -0.5d, meibu_R +0.5d   （倾斜）
    pos.z +d  -> meibu_L/R 世界 Z +0.5d                （升降）

UE：VECTOR2D 控件 X=倾斜 / Y=升降，范围 -10..10。
驱动方式改成「当前骨骼位置 + 偏移」，不再硬写参考姿态坐标，角色换个姿势也不会跳。
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
MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')

CTRL = 'CTRL_BROW_POINT'
SCALE = 0.5
RANGE = 10.0
HANDLE_CM = 1.6
PREFIX = 'BRW_'

POS_X, POS_Y, POS_Z = -30.0, 15.68, 152.0


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def v2val(x, y):
    return unreal.RigHierarchy.make_control_value_from_vector2d(unreal.Vector2D(x, y))


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def main():
    report = {}
    rig = _fm_load_asset(ASSET)
    mesh = _fm_load_asset(MESH)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())
    lib = _fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
    shapes = {str(s.shape_name): s for s in lib.get_editor_property('shapes')}

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Rebuild brow point as VECTOR2D with offsets'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for name in (CTRL, 'RAIL_' + CTRL):
                k = key(name)
                if h.contains(k):
                    hc.remove_element(k, True, True)
            for name in ('BrowBoard',):
                k = key(name, unreal.RigElementType.NULL)
                if h.contains(k):
                    hc.remove_element(k, True, True)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.BONE and str(k.name) not in ('head', 'meibu_L', 'meibu_R'):
                    hc.remove_element(k, True, True)

            # ---- 骨骼 ----
            if not h.contains(key('meibu_L', unreal.RigElementType.BONE)):
                ref = unreal.new_object(unreal.RigHierarchy)
                ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
                head_g = ref.get_global_transform(key('head', unreal.RigElementType.BONE))
                head = hc.add_bone('head', unreal.RigElementKey(), head_g, True, unreal.RigBoneType.USER, False)
                for name in ('meibu_L', 'meibu_R'):
                    g = ref.get_global_transform(key(name, unreal.RigElementType.BONE))
                    hc.add_bone(name, head, g, True, unreal.RigBoneType.USER, False)

            # ---- 控件（厘米尺寸） ----
            shape = shapes['Sphere_Solid']
            bounds = shape.get_editor_property('shape_proxy').get_bounds()
            ds = shape.get_editor_property('transform').scale3d
            unit_dia = 2 * max(bounds.box_extent.x * abs(ds.x),
                               bounds.box_extent.y * abs(ds.y),
                               bounds.box_extent.z * abs(ds.z))
            offset_scale = 8.0
            shape_scale = HANDLE_CM / (unit_dia * offset_scale)

            settings = unreal.RigControlSettings()
            settings.control_type = unreal.RigControlType.VECTOR2D
            settings.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
            settings.display_name = '眉毛控制点'
            settings.primary_axis = unreal.RigControlAxis.X
            settings.draw_limits = False
            settings.shape_name = 'Sphere_Solid'
            settings.shape_color = unreal.LinearColor(1.0, 0.55, 0.15, 1.0)
            try:
                settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True),
                                          unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
                settings.minimum_value = v2val(-RANGE, -RANGE)
                settings.maximum_value = v2val(RANGE, RANGE)
            except Exception as exc:
                report['limit_err'] = repr(exc)

            board = hc.add_null('BrowBoard', unreal.RigElementKey(), unreal.Transform())
            c = hc.add_control(CTRL, board, settings, v2val(0.0, 0.0), False)
            off = unreal.Transform(location=unreal.Vector(POS_X, POS_Y, POS_Z),
                                   rotation=unreal.Rotator(pitch=0.0, yaw=0.0, roll=-90.0),
                                   scale=unreal.Vector(offset_scale, offset_scale, offset_scale))
            h.set_control_offset_transform(c, off, True, True)
            h.set_control_offset_transform(c, off, False, True)
            shp = unreal.Transform(scale=unreal.Vector(shape_scale, shape_scale, shape_scale))
            h.set_control_shape_transform(c, shp, True)
            h.set_control_shape_transform(c, shp, False)
            report['handle_cm'] = HANDLE_CM
            report['shape_scale'] = round(shape_scale, 5)

            # ---- 图 ----
            prev = 'Begin.ExecutePin'
            get = unit(ctrl, 'RigUnit_GetControlVector2D', 'GET', (400, 0))
            ctrl.set_pin_default_value(get + '.Control', CTRL, False, False)

            tilt_l = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_L', (700, -200))
            ctrl.set_pin_default_value(tilt_l + '.B', '%f' % (-SCALE), False, False)
            ctrl.add_link(get + '.Vector.X', tilt_l + '.A', False)

            tilt_r = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_R', (700, -60))
            ctrl.set_pin_default_value(tilt_r + '.B', '%f' % SCALE, False, False)
            ctrl.add_link(get + '.Vector.X', tilt_r + '.A', False)

            lift = unit(ctrl, 'RigVMFunction_MathFloatMul', 'LIFT', (700, 80))
            ctrl.set_pin_default_value(lift + '.B', '%f' % SCALE, False, False)
            ctrl.add_link(get + '.Vector.Y', lift + '.A', False)

            add_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_L', (950, -160))
            add_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_R', (950, 40))
            ctrl.add_link(tilt_l + '.Result', add_l + '.A', False)
            ctrl.add_link(lift + '.Result', add_l + '.B', False)
            ctrl.add_link(tilt_r + '.Result', add_r + '.A', False)
            ctrl.add_link(lift + '.Result', add_r + '.B', False)

            vec_l = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_L', (1200, -160))
            vec_r = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_R', (1200, 40))
            ctrl.add_link(add_l + '.Result', vec_l + '.Z', False)
            ctrl.add_link(add_r + '.Result', vec_r + '.Z', False)

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

            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    # ---- 自检 ----
    # 每轮新建实例：相对偏移是「读当前 + 加偏移」，同一个实例连续 execute 会自己叠加
    def probe(x, y):
        i = rig.create_control_rig()
        i.request_init()
        rh = i.get_hierarchy()
        rh.set_control_value(key(CTRL), v2val(x, y))
        i.execute('Forwards Solve')
        zs = {}
        for n in ('meibu_L', 'meibu_R'):
            k = key(n, unreal.RigElementType.BONE)
            zs[n] = rh.get_global_transform(k).translation
        return i, zs

    def delta(base, cur):
        return [round(cur['meibu_L'].z - base['meibu_L'].z, 3),
                round(cur['meibu_R'].z - base['meibu_R'].z, 3)]

    inst0, base = probe(0, 0)
    report['rest_z'] = [round(base['meibu_L'].z, 3), round(base['meibu_R'].z, 3)]
    report['rest_xy'] = [[round(base[n].x, 2), round(base[n].y, 2)] for n in ('meibu_L', 'meibu_R')]

    for tag, (x, y) in (('tilt10', (10, 0)), ('lift10', (0, 10)),
                        ('mix', (5, 5)), ('neg', (-10, -10))):
        _, cur = probe(x, y)
        report[tag] = delta(base, cur)

    print(json.dumps(report, ensure_ascii=False, indent=1))
    return report


if __name__ == '__main__':
    try:
        main()
        _fm_save_asset(_fm_load_asset(ASSET), False)
        unreal.log('[BrowPointV3] saved')
    except Exception:
        unreal.log_error('[BrowPointV3] FAILED\n' + traceback.format_exc())
        raise
