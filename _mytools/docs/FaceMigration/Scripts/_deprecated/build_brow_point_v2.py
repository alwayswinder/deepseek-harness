"""用 VECTOR2D 控件复刻 3ds Max 的 K_SXM004 眉毛控制点。

3ds Max 实测：
    K_SXM004.pos.x +d  ->  meibu_L 世界 Z -0.5d, meibu_R +0.5d   （眉毛倾斜）
    K_SXM004.pos.z +d  ->  meibu_L/R 世界 Z +0.5d                （眉毛升降）

UE 里用一个 VECTOR2D 控件（X=倾斜，Y=升降），取值范围 -10..10。
"""
import json
import traceback

import unreal

ASSET = '/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'
MESH = '/Game/_MyTest/Mouth/Mesh/Seven'

CTRL = 'CTRL_BROW_POINT'
SCALE = 0.5
RANGE = 10.0
HANDLE_CM = 2.0
PREFIX = 'BRW_'

POS_X, POS_Y, POS_Z = -30.0, 15.68, 152.0


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def fval(x):
    return unreal.RigHierarchy.make_control_value_from_float(x)


def v2val(x, y):
    return unreal.RigHierarchy.make_control_value_from_vector2d(unreal.Vector2D(x, y))


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def build_control(rig, h, hc, lib_shapes, ref, bone_base):
    # 形状按厘米算，避免 offset scale 把球放大成几米
    shape = lib_shapes['Sphere_Solid']
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
        print('limit setup skipped:', repr(exc))

    board = hc.add_null('BrowBoard', unreal.RigElementKey(), unreal.Transform())
    c = hc.add_control(CTRL, board, settings, v2val(0.0, 0.0), False)
    off = unreal.Transform(location=unreal.Vector(POS_X, POS_Y, POS_Z),
                           scale=unreal.Vector(offset_scale, offset_scale, offset_scale))
    h.set_control_offset_transform(c, off, True, True)
    h.set_control_offset_transform(c, off, False, True)
    shp = unreal.Transform(scale=unreal.Vector(shape_scale, shape_scale, shape_scale))
    h.set_control_shape_transform(c, shp, True)
    h.set_control_shape_transform(c, shp, False)
    return c, {'unit_dia': unit_dia, 'shape_scale': shape_scale}


def main():
    report = {}
    rig = unreal.load_asset(ASSET)
    mesh = unreal.load_asset(MESH)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    lib = unreal.load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
    shapes = {str(s.shape_name): s for s in lib.get_editor_property('shapes')}

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Add VECTOR2D brow control point'):
        rig.set_auto_vm_recompile(False)
        try:
            # ---- 清旧 ----
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
                if node.get_name() in ('BROWBoard',):
                    pass
            for name in (CTRL, 'RAIL_' + CTRL, 'CTRL_BROW_TILT', 'CTRL_BROW_LIFT',
                         'RAIL_CTRL_BROW_TILT', 'RAIL_CTRL_BROW_LIFT'):
                k = key(name)
                if h.contains(k):
                    hc.remove_element(k, True, True)
            for name in ('BrowBoard', 'BrowPanel'):
                k = key(name, unreal.RigElementType.NULL)
                if h.contains(k):
                    hc.remove_element(k, True, True)
            # 只保留本 rig 需要的三根骨
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.BONE and str(k.name) not in ('head', 'meibu_L', 'meibu_R'):
                    hc.remove_element(k, True, True)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CURVE:
                    hc.remove_element(k, True, True)

            # ---- 骨骼 ----
            ref = unreal.new_object(unreal.RigHierarchy)
            ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
            head_g = ref.get_global_transform(key('head', unreal.RigElementType.BONE))
            head = hc.add_bone('head', unreal.RigElementKey(), head_g, True, unreal.RigBoneType.USER, False)
            base = {}
            for name in ('meibu_L', 'meibu_R'):
                g = ref.get_global_transform(key(name, unreal.RigElementType.BONE))
                hc.add_bone(name, head, g, True, unreal.RigBoneType.USER, False)
                base[name] = g.translation
            report['base'] = {k: [round(v.x, 3), round(v.y, 3), round(v.z, 3)] for k, v in base.items()}

            # ---- 控件 ----
            c, info = build_control(rig, h, hc, shapes, ref, base)
            report['handle'] = info

            # ---- 图 ----
            prev = 'Begin.ExecutePin'
            get = unit(ctrl, 'RigUnit_GetControlVector2D', 'GET', (500, 0))
            ctrl.set_pin_default_value(get + '.Control', CTRL, False, False)

            tilt_l = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_L', (800, -150))
            ctrl.set_pin_default_value(tilt_l + '.B', '%f' % (-SCALE), False, False)
            ctrl.add_link(get + '.Vector.X', tilt_l + '.A', False)

            tilt_r = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_R', (800, 0))
            ctrl.set_pin_default_value(tilt_r + '.B', '%f' % SCALE, False, False)
            ctrl.add_link(get + '.Vector.X', tilt_r + '.A', False)

            lift = unit(ctrl, 'RigVMFunction_MathFloatMul', 'LIFT', (800, 150))
            ctrl.set_pin_default_value(lift + '.B', '%f' % SCALE, False, False)
            ctrl.add_link(get + '.Vector.Y', lift + '.A', False)

            add_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_L', (1050, -100))
            add_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ADD_R', (1050, 100))
            ctrl.add_link(tilt_l + '.Result', add_l + '.A', False)
            ctrl.add_link(lift + '.Result', add_l + '.B', False)
            ctrl.add_link(tilt_r + '.Result', add_r + '.A', False)
            ctrl.add_link(lift + '.Result', add_r + '.B', False)

            base_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'BASE_L', (1300, -100))
            base_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'BASE_R', (1300, 100))
            ctrl.set_pin_default_value(base_l + '.B', '%f' % base['meibu_L'].z, False, False)
            ctrl.set_pin_default_value(base_r + '.B', '%f' % base['meibu_R'].z, False, False)
            ctrl.add_link(add_l + '.Result', base_l + '.A', False)
            ctrl.add_link(add_r + '.Result', base_r + '.A', False)

            vec_l = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_L', (1550, -100))
            vec_r = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VEC_R', (1550, 100))
            for node, b in ((vec_l, base['meibu_L']), (vec_r, base['meibu_R'])):
                ctrl.set_pin_default_value(node + '.X', '%f' % b.x, False, False)
                ctrl.set_pin_default_value(node + '.Y', '%f' % b.y, False, False)
            ctrl.add_link(base_l + '.Result', vec_l + '.Z', False)
            ctrl.add_link(base_r + '.Result', vec_r + '.Z', False)

            for bone, vec, y_off in (('meibu_L', vec_l, 0), ('meibu_R', vec_r, 200)):
                setn = unit(ctrl, 'RigUnit_SetTranslation', 'SET_' + bone, (1800, y_off))
                ctrl.set_pin_default_value(setn + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
                ctrl.set_pin_default_value(setn + '.Space', 'GlobalSpace', False, False)
                ctrl.set_pin_default_value(setn + '.bInitial', 'False', False, False)
                ctrl.add_link(vec + '.Result', setn + '.Translation', False)
                ctrl.add_link(prev, setn + '.ExecutePin', False)
                prev = setn + '.ExecutePin'

            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    # ---- 自检 ----
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()

    def setv(x, y):
        rh.set_control_value(key(CTRL), v2val(x, y))

    def z_of(n):
        return rh.get_global_transform(key(n, unreal.RigElementType.BONE)).translation.z

    setv(0, 0)
    inst.execute('Forwards Solve')
    b0 = (z_of('meibu_L'), z_of('meibu_R'))

    setv(10, 0)
    inst.execute('Forwards Solve')
    report['tilt10'] = [round(z_of('meibu_L') - b0[0], 3), round(z_of('meibu_R') - b0[1], 3)]

    setv(0, 10)
    inst.execute('Forwards Solve')
    report['lift10'] = [round(z_of('meibu_L') - b0[0], 3), round(z_of('meibu_R') - b0[1], 3)]

    setv(-10, -10)
    inst.execute('Forwards Solve')
    report['neg'] = [round(z_of('meibu_L') - b0[0], 3), round(z_of('meibu_R') - b0[1], 3)]

    setv(0, 0)
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.EditorAssetLibrary.save_loaded_asset(unreal.load_asset(ASSET), False)
        unreal.log('[BrowPointV2] saved')
    except Exception:
        unreal.log_error('[BrowPointV2] FAILED\n' + traceback.format_exc())
        raise
