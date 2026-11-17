"""在 CR_Seven_MorphSliders 里复刻 3ds Max 的眉毛控制器面板。

对应 3ds Max 场景 (Seven_Skin.max) 里 Circle117 面板上的四条滑块：
    眉毛变弯  -> morph 曲线 browInnerUp + browDownLeft/Right
    眉毛旋转  -> meibu_L / meibu_R 骨骼绕自身轴旋转
    左眉毛隐藏 -> meibu_L 缩放 1..0
    右眉毛隐藏 -> meibu_R 缩放 1..0

脚本幂等：重复执行会先清掉旧的 BROW_ 节点与控件再重建。
"""
import json
import traceback

import unreal

ASSET = '/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'
MESH = '/Game/_MyTest/Mouth/Mesh/Seven'

BEND = 'CTRL_BROW_BEND'
ROT = 'CTRL_BROW_ROT'
HIDE_L = 'CTRL_BROW_HIDE_L'
HIDE_R = 'CTRL_BROW_HIDE_R'

CONTROLS = [
    (BEND, '眉毛变弯', unreal.LinearColor(1.0, 0.62, 0.12, 1.0)),
    (ROT, '眉毛旋转', unreal.LinearColor(0.35, 0.85, 1.0, 1.0)),
    (HIDE_L, '左眉毛隐藏', unreal.LinearColor(1.0, 0.35, 0.55, 1.0)),
    (HIDE_R, '右眉毛隐藏', unreal.LinearColor(0.55, 1.0, 0.55, 1.0)),
]

BEND_CURVES = [('browInnerUp', 1.0), ('browDownLeft', 0.55), ('browDownRight', 0.55)]
ROT_DEGREES = 15.0
DEG2RAD = 0.017453292519943295
ROW_STEP = 6.0
PREFIX = 'BROW_'

REPORT = {}


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def fval(x):
    return unreal.RigHierarchy.make_control_value_from_float(x)


def cleanup(rig, h, hc, ctrl):
    removed = []
    for node in list(rig.get_default_model().get_nodes()):
        if node.get_name().startswith(PREFIX):
            ctrl.remove_node(node, False)
            removed.append(node.get_name())
    REPORT['removed_nodes'] = removed
    # 先清掉任何误导入的骨骼，只保留本面板用的三根
    keep = {'head', 'meibu_L', 'meibu_R'}
    stray = [str(k.name) for k in h.get_all_keys()
             if k.type == unreal.RigElementType.BONE and str(k.name) not in keep]
    for name in reversed(stray):
        hc.remove_element(key(name, unreal.RigElementType.BONE), True, True)
    REPORT['removed_bones'] = stray
    for name in [c[0] for c in CONTROLS] + ['RAIL_' + c[0] for c in CONTROLS]:
        k = key(name)
        if h.contains(k):
            hc.remove_element(k, True, True)
            removed.append(name)
    for bone in ('meibu_L', 'meibu_R', 'head'):
        k = key(bone, unreal.RigElementType.BONE)
        if h.contains(k):
            hc.remove_element(k, True, True)
    for curve, _ in BEND_CURVES:
        k = key(curve, unreal.RigElementType.CURVE)
        if h.contains(k):
            hc.remove_element(k, True, True)


def add_bones(rig, h, hc, mesh):
    ref = unreal.new_object(unreal.RigHierarchy)
    ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
    head_g = ref.get_global_transform(key('head', unreal.RigElementType.BONE))
    head = hc.add_bone('head', unreal.RigElementKey(), head_g, True,
                       unreal.RigBoneType.USER, False)
    added = [str(head.name)]
    for name in ('meibu_L', 'meibu_R'):
        g = ref.get_global_transform(key(name, unreal.RigElementType.BONE))
        b = hc.add_bone(name, head, g, True, unreal.RigBoneType.USER, False)
        added.append(str(b.name))
    return added


def build_controls(h, hc):
    lib = unreal.load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
    shapes = {str(s.shape_name): s for s in lib.get_editor_property('shapes')}
    board = key('MorphBoard', unreal.RigElementType.NULL)

    base = h.get_global_control_offset_transform(key('CTRL_1_happy'))
    rail_offset = h.get_global_control_offset_transform(key('RAIL_1_happy'))
    handle_shape = h.get_local_control_shape_transform(key('CTRL_1_happy'))
    rail_shape = h.get_local_control_shape_transform(key('RAIL_1_happy'))

    x, y, top = base.translation.x, base.translation.y, base.translation.z - 7 * ROW_STEP
    scale = base.scale3d.x
    out = []
    for i, (name, display, color) in enumerate(CONTROLS):
        z = top - i * ROW_STEP
        settings = unreal.RigControlSettings()
        settings.control_type = unreal.RigControlType.FLOAT
        settings.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
        settings.display_name = display
        settings.primary_axis = unreal.RigControlAxis.X
        settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
        settings.minimum_value = fval(0.0)
        settings.maximum_value = fval(1.0)
        settings.draw_limits = False
        settings.shape_name = 'Sphere_Solid'
        settings.shape_color = color
        c = hc.add_control(name, board, settings, fval(0.0), False)
        off = unreal.Transform(location=unreal.Vector(x, y, z), scale=unreal.Vector(scale, scale, scale))
        h.set_control_offset_transform(c, off, True, True)
        h.set_control_offset_transform(c, off, False, True)
        h.set_control_shape_transform(c, handle_shape, True)
        h.set_control_shape_transform(c, handle_shape, False)

        rs = unreal.RigControlSettings()
        rs.control_type = unreal.RigControlType.FLOAT
        rs.animation_type = unreal.RigControlAnimationType.VISUAL_CUE
        rs.display_name = 'rail_' + display
        rs.primary_axis = unreal.RigControlAxis.X
        rs.shape_name = 'Box_Solid'
        rs.shape_color = unreal.LinearColor(color.r * 0.55, color.g * 0.55, color.b * 0.55, 1.0)
        rail = hc.add_control('RAIL_' + name, board, rs, fval(0.0), False)
        roff = unreal.Transform(location=unreal.Vector(rail_offset.translation.x, y, z),
                                scale=rail_offset.scale3d)
        h.set_control_offset_transform(rail, roff, True, True)
        h.set_control_offset_transform(rail, roff, False, True)
        h.set_control_shape_transform(rail, rail_shape, True)
        h.set_control_shape_transform(rail, rail_shape, False)
        out.append((name, (x, y, z)))
    return out


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def main():
    rig = unreal.load_asset(ASSET)
    mesh = unreal.load_asset(MESH)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Add Seven brow controller panel'):
        rig.set_auto_vm_recompile(False)
        try:
            cleanup(rig, h, hc, ctrl)
            REPORT['bones'] = add_bones(rig, h, hc, mesh)
            REPORT['controls'] = build_controls(h, hc)
            for curve, _ in BEND_CURVES:
                if not h.contains(key(curve, unreal.RigElementType.CURVE)):
                    hc.add_curve(curve, 0.0, False)

            begin = None
            for node in rig.get_default_model().get_nodes():
                if node.get_name() == 'Begin':
                    begin = node.get_name()
            assert begin, 'Begin node missing'
            prev = begin + '.ExecutePin'
            rows = 0

            # ---- 眉毛变弯 ----
            y = 0
            get = unit(ctrl, 'RigUnit_GetControlFloat', 'BEND_Get', (900, y))
            ctrl.set_pin_default_value(get + '.Control', BEND, False, False)
            prev_curve = prev
            for idx, (curve, weight) in enumerate(BEND_CURVES):
                setter = unit(ctrl, 'RigUnit_SetCurveValue', 'BEND_Set%d' % idx, (1400, y + idx * 120))
                ctrl.set_pin_default_value(setter + '.Curve', curve, False, False)
                if weight == 1.0:
                    src = get + '.FloatValue'
                else:
                    mul = unit(ctrl, 'RigVMFunction_MathFloatMul', 'BEND_Mul%d' % idx, (1200, y + idx * 120))
                    ctrl.set_pin_default_value(mul + '.B', '%f' % weight, False, False)
                    ctrl.add_link(get + '.FloatValue', mul + '.A', False)
                    src = mul + '.Result'
                ctrl.add_link(src, setter + '.Value', False)
                ctrl.add_link(prev_curve, setter + '.ExecutePin', False)
                prev_curve = setter + '.ExecutePin'
            prev = prev_curve

            # ---- 眉毛旋转 ----
            y = 600
            get = unit(ctrl, 'RigUnit_GetControlFloat', 'ROT_Get', (900, y))
            ctrl.set_pin_default_value(get + '.Control', ROT, False, False)
            sub = unit(ctrl, 'RigVMFunction_MathFloatSub', 'ROT_Sub', (1150, y))
            ctrl.set_pin_default_value(sub + '.B', '0.5', False, False)
            mul = unit(ctrl, 'RigVMFunction_MathFloatMul', 'ROT_Mul', (1350, y))
            ctrl.set_pin_default_value(mul + '.B', '%f' % (ROT_DEGREES * 2.0 * DEG2RAD), False, False)
            quat = unit(ctrl, 'RigVMFunction_MathQuaternionFromAxisAndAngle', 'ROT_Quat', (1550, y))
            ctrl.set_pin_default_value(quat + '.Axis', '(X=0.000000,Y=1.000000,Z=0.000000)', True, False)
            ctrl.add_link(get + '.FloatValue', sub + '.A', False)
            ctrl.add_link(sub + '.Result', mul + '.A', False)
            ctrl.add_link(mul + '.Result', quat + '.Angle', False)
            prev_rot = prev
            for side in ('L', 'R'):
                setter = unit(ctrl, 'RigUnit_SetBoneRotation', 'ROT_Set' + side, (1800, y + (0 if side == 'L' else 150)))
                ctrl.set_pin_default_value(setter + '.Bone', 'meibu_' + side, False, False)
                ctrl.set_pin_default_value(setter + '.Space', 'Local', False, False)
                ctrl.add_link(quat + '.Result', setter + '.Rotation', False)
                ctrl.add_link(prev_rot, setter + '.ExecutePin', False)
                prev_rot = setter + '.ExecutePin'
            prev = prev_rot

            # ---- 左/右眉毛隐藏 ----
            for idx, (ctrl_name, bone) in enumerate(((HIDE_L, 'meibu_L'), (HIDE_R, 'meibu_R'))):
                y = 1200 + idx * 500
                get = unit(ctrl, 'RigUnit_GetControlFloat', 'HIDE%d_Get' % idx, (900, y))
                ctrl.set_pin_default_value(get + '.Control', ctrl_name, False, False)
                sub = unit(ctrl, 'RigVMFunction_MathFloatSub', 'HIDE%d_Sub' % idx, (1150, y))
                ctrl.set_pin_default_value(sub + '.A', '1.0', False, False)
                vec = unit(ctrl, 'RigVMFunction_MathVectorMake', 'HIDE%d_Vec' % idx, (1350, y))
                setter = unit(ctrl, 'RigUnit_SetScale', 'HIDE%d_Set' % idx, (1600, y))
                ok_item = ctrl.set_pin_default_value(setter + '.Item',
                                                    '(Type=Bone,Name="%s")' % bone, False, False)
                ok_space = ctrl.set_pin_default_value(setter + '.Space', 'LocalSpace', False, False)
                ok_init = ctrl.set_pin_default_value(setter + '.bInitial', 'False', False, False)
                REPORT.setdefault('pin_sets', []).append((bone, ok_item, ok_space, ok_init))
                ctrl.add_link(get + '.FloatValue', sub + '.B', False)
                for comp in ('X', 'Y', 'Z'):
                    ctrl.add_link(sub + '.Result', vec + '.' + comp, False)
                ctrl.add_link(vec + '.Result', setter + '.Scale', False)
                ctrl.add_link(prev, setter + '.ExecutePin', False)
                prev = setter + '.ExecutePin'

            rig.recompile_vm()
            status = rig.get_editor_property('status')
            REPORT['status'] = str(status)
            assert status != unreal.BlueprintStatus.BS_ERROR, 'rig compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    # ---- 自检 ----
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()

    def setv(name, v):
        rh.set_control_value(key(name), fval(v))

    def curve(name):
        return rh.get_curve_value(key(name, unreal.RigElementType.CURVE))

    def scale_of(name):
        return rh.get_global_transform(key(name, unreal.RigElementType.BONE)).scale3d

    setv(BEND, 0.0)
    setv(ROT, 0.5)
    setv(HIDE_L, 0.0)
    setv(HIDE_R, 0.0)
    inst.execute('Forwards Solve')
    base_scale = (scale_of('meibu_L').x, scale_of('meibu_R').x)
    REPORT['base_scale'] = base_scale
    REPORT['base_curves'] = {c: curve(c) for c, _ in BEND_CURVES}

    setv(BEND, 1.0)
    inst.execute('Forwards Solve')
    REPORT['bend_curves'] = {c: curve(c) for c, _ in BEND_CURVES}

    setv(BEND, 0.0)
    setv(ROT, 1.0)
    setv(HIDE_L, 1.0)
    setv(HIDE_R, 1.0)
    inst.execute('Forwards Solve')
    q = rh.get_local_transform(key('meibu_L', unreal.RigElementType.BONE)).rotation
    REPORT['rot_local_quat'] = str(q)
    REPORT['hide_scale_L'] = str(scale_of('meibu_L'))
    REPORT['hide_scale_R'] = str(scale_of('meibu_R'))
    REPORT['saved'] = False
    print(json.dumps(REPORT, ensure_ascii=False, indent=1))
    return REPORT


if __name__ == '__main__':
    try:
        rep = main()
        unreal.EditorAssetLibrary.save_loaded_asset(unreal.load_asset(ASSET), False)
        unreal.log('[BrowPanel] saved')
    except Exception:
        unreal.log_error('[BrowPanel] FAILED\n' + traceback.format_exc())
        raise
