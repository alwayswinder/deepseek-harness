"""在 CR_Seven_MorphSliders 里复刻 3ds Max 的 K_SXM004 眉毛控制点。

实测（3ds Max 场景 Seven_Skin.max）：
    K_SXM004.pos.x +d  ->  meibu_L 世界 Z -0.5d, meibu_R 世界 Z +0.5d   （眉毛倾斜）
    K_SXM004.pos.z +d  ->  meibu_L/R 世界 Z +0.5d                      （眉毛整体升降）
所以这里用两个 float 控件复刻这两个自由度：
    CTRL_BROW_TILT  (-10..10)  左眉 -0.5v / 右眉 +0.5v
    CTRL_BROW_LIFT  (-10..10)  左右眉都 +0.5v
"""
import json
import traceback

import unreal

ASSET = '/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'
MESH = '/Game/_MyTest/Mouth/Mesh/Seven'

TILT = 'CTRL_BROW_TILT'
LIFT = 'CTRL_BROW_LIFT'
SCALE = 0.5
RANGE = 10.0
PREFIX = 'BRW_'

CONTROLS = [
    (TILT, '眉毛倾斜', unreal.LinearColor(1.0, 0.45, 0.2, 1.0)),
    (LIFT, '眉毛升降', unreal.LinearColor(0.25, 0.8, 1.0, 1.0)),
]


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def fval(x):
    return unreal.RigHierarchy.make_control_value_from_float(x)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def main():
    report = {}
    rig = unreal.load_asset(ASSET)
    mesh = unreal.load_asset(MESH)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Add K_SXM004 style brow point controls'):
        rig.set_auto_vm_recompile(False)
        try:
            # ---- 清旧的 ----
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for name in [c[0] for c in CONTROLS] + ['RAIL_' + c[0] for c in CONTROLS]:
                k = key(name)
                if h.contains(k):
                    hc.remove_element(k, True, True)
            for bone in ('meibu_L', 'meibu_R', 'head'):
                k = key(bone, unreal.RigElementType.BONE)
                if h.contains(k):
                    hc.remove_element(k, True, True)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.BONE:
                    hc.remove_element(k, True, True)

            # ---- 骨骼 ----
            ref = unreal.new_object(unreal.RigHierarchy)
            ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
            head_g = ref.get_global_transform(key('head', unreal.RigElementType.BONE))
            head = hc.add_bone('head', unreal.RigElementKey(), head_g, True, unreal.RigBoneType.USER, False)
            for name in ('meibu_L', 'meibu_R'):
                g = ref.get_global_transform(key(name, unreal.RigElementType.BONE))
                hc.add_bone(name, head, g, True, unreal.RigBoneType.USER, False)
            report['bones'] = [str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE]

            # ---- 控件 ----
            board = hc.add_null('BrowBoard', unreal.RigElementKey(), unreal.Transform())
            lib = unreal.load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
            x, y, top = -30.0, 15.68, 163.35
            for i, (name, display, color) in enumerate(CONTROLS):
                settings = unreal.RigControlSettings()
                settings.control_type = unreal.RigControlType.FLOAT
                settings.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
                settings.display_name = display
                settings.primary_axis = unreal.RigControlAxis.X
                settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
                settings.minimum_value = fval(-RANGE)
                settings.maximum_value = fval(RANGE)
                settings.draw_limits = False
                settings.shape_name = 'Sphere_Solid'
                settings.shape_color = color
                c = hc.add_control(name, board, settings, fval(0.0), False)
                off = unreal.Transform(location=unreal.Vector(x, y, top - i * 6.0),
                                       scale=unreal.Vector(8.0, 8.0, 8.0))
                h.set_control_offset_transform(c, off, True, True)
                h.set_control_offset_transform(c, off, False, True)

            # ---- 图 ----
            begin = 'Begin'
            prev = begin + '.ExecutePin'

            t_get = unit(ctrl, 'RigUnit_GetControlFloat', 'TILT_Get', (600, 0))
            ctrl.set_pin_default_value(t_get + '.Control', TILT, False, False)
            l_get = unit(ctrl, 'RigUnit_GetControlFloat', 'LIFT_Get', (600, 300))
            ctrl.set_pin_default_value(l_get + '.Control', LIFT, False, False)

            half_l = unit(ctrl, 'RigVMFunction_MathFloatMul', 'LIFT_Half', (850, 300))
            ctrl.set_pin_default_value(half_l + '.B', '%f' % SCALE, False, False)
            ctrl.add_link(l_get + '.FloatValue', half_l + '.A', False)

            t_neg = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_Neg', (850, 0))
            ctrl.set_pin_default_value(t_neg + '.B', '%f' % (-SCALE), False, False)
            ctrl.add_link(t_get + '.FloatValue', t_neg + '.A', False)

            t_pos = unit(ctrl, 'RigVMFunction_MathFloatMul', 'TILT_Pos', (850, 150))
            ctrl.set_pin_default_value(t_pos + '.B', '%f' % SCALE, False, False)
            ctrl.add_link(t_get + '.FloatValue', t_pos + '.A', False)

            z_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ZL_Add', (1100, 80))
            z_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ZR_Add', (1100, 230))
            ctrl.add_link(t_neg + '.Result', z_l + '.A', False)
            ctrl.add_link(half_l + '.Result', z_l + '.B', False)
            ctrl.add_link(t_pos + '.Result', z_r + '.A', False)
            ctrl.add_link(half_l + '.Result', z_r + '.B', False)

            vec_l = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VL_Make', (1350, 80))
            vec_r = unit(ctrl, 'RigVMFunction_MathVectorMake', 'VR_Make', (1350, 230))
            base_l = ref.get_global_transform(key('meibu_L', unreal.RigElementType.BONE)).translation
            base_r = ref.get_global_transform(key('meibu_R', unreal.RigElementType.BONE)).translation
            for node, base in ((vec_l, base_l), (vec_r, base_r)):
                ctrl.set_pin_default_value(node + '.X', '%f' % base.x, False, False)
                ctrl.set_pin_default_value(node + '.Y', '%f' % base.y, False, False)
            report['base'] = [(base_l.x, base_l.y, base_l.z), (base_r.x, base_r.y, base_r.z)]

            # SetTranslation 的 bInitial 是 setup 语义，这里必须用绝对世界位置
            z_off_l = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ZL_BaseAdd', (1350, 400))
            z_off_r = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'ZR_BaseAdd', (1350, 550))
            ctrl.set_pin_default_value(z_off_l + '.B', '%f' % base_l.z, False, False)
            ctrl.set_pin_default_value(z_off_r + '.B', '%f' % base_r.z, False, False)
            ctrl.add_link(z_l + '.Result', z_off_l + '.A', False)
            ctrl.add_link(z_r + '.Result', z_off_r + '.A', False)
            ctrl.add_link(z_off_l + '.Result', vec_l + '.Z', False)
            ctrl.add_link(z_off_r + '.Result', vec_r + '.Z', False)

            set_l = unit(ctrl, 'RigUnit_SetTranslation', 'SET_L', (1650, 80))
            set_r = unit(ctrl, 'RigUnit_SetTranslation', 'SET_R', (1650, 230))
            for node, bone, vec in ((set_l, 'meibu_L', vec_l), (set_r, 'meibu_R', vec_r)):
                ok = ctrl.set_pin_default_value(node + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
                ok = ctrl.set_pin_default_value(node + '.Space', 'GlobalSpace', False, False) and ok
                ok = ctrl.set_pin_default_value(node + '.bInitial', 'False', False, False) and ok
                report.setdefault('pins', []).append((bone, ok))
                ctrl.add_link(vec + '.Result', node + '.Translation', False)
                ctrl.add_link(prev, node + '.ExecutePin', False)
                prev = node + '.ExecutePin'

            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    # ---- 自检 ----
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()

    def setv(n, v):
        rh.set_control_value(key(n), fval(v))

    def z_of(n):
        return rh.get_global_transform(key(n, unreal.RigElementType.BONE)).translation.z

    setv(TILT, 0)
    setv(LIFT, 0)
    inst.execute('Forwards Solve')
    base = (z_of('meibu_L'), z_of('meibu_R'))
    report['base_z'] = base

    setv(LIFT, 10)
    inst.execute('Forwards Solve')
    report['lift10'] = [round(z_of('meibu_L') - base[0], 3), round(z_of('meibu_R') - base[1], 3)]

    setv(LIFT, 0)
    setv(TILT, 10)
    inst.execute('Forwards Solve')
    report['tilt10'] = [round(z_of('meibu_L') - base[0], 3), round(z_of('meibu_R') - base[1], 3)]

    setv(TILT, 0)
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.EditorAssetLibrary.save_loaded_asset(unreal.load_asset(ASSET), False)
        unreal.log('[BrowPoint] saved')
    except Exception:
        unreal.log_error('[BrowPoint] FAILED\n' + traceback.format_exc())
        raise
