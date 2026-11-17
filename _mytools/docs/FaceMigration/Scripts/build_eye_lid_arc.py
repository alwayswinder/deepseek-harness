"""上眼皮闭合 v2：按 Max 虚拟体（眼球中心）做圆弧运动，替代原来的直线平移。

背景：Max 里上眼皮骨绕眼球中心的虚拟体（Point004 / yanqiu_L|R）旋转，骨骼走圆弧。
UE 原实现是「骨骼自转 + 沿 dP 直线平移」，端点一致但中途走弦，离 Max 轨迹最大 1.28mm——
眼皮与眼球间隙小时就会在中途穿模。

本版位置改为：pos = P + R(axis, angle*s) * (t0 - P) * (1 + k1*s)，s = d/135
  离线核对（Bone037，8 个采样点）最大误差 0.0037 cm。

【关键修正 2026-11-06】旋转也必须是「绕眼球中心的世界旋转」，不能再用骨骼自身
反算的 dq 轴：位置公转 + 朝向自转会让眼皮在公转之外再翻滚一圈，压进球体。
Bone028/029 与 Bone037/038 各自共用同一根世界轴，SANG 用 0.20796（28.07°/满行程）。
参数取自临床 rig `LidDiagnostic/CR_Seven_LidWorldRotation`（codex 修正版）。


用法：python Scripts\\ue_run.py Scripts\\build_eye_lid_arc.py
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
PREFIX = 'LID_'
Z_MIN = -10.0
Z_MAX = 0.0
SHAPE = 'Box_Thick'
SHAPE_SCALE = (0.14, 0.10, 0.05)
COLOR = (0.80, 0.45, 1.0, 1.0)
GAIN = 13.5
FULL_D = 135.0
DEG2RAD = 0.017453292519943295
PARENT = 'Root'

# bone, orbit_axis(UE), orbit_angle(deg @ full d), k1=r1/r0-1, spin_axis(UE), spin_deg_per_cm, t1(UE, 满行程端点)
SIDES = [
    {
        'control': 'CTRL_EYE_LID_R',
        'display': '右眼上眼皮',
        'pos': (-4.14181, 9.81844, 160.624),
        'pivot': (-3.1503, 4.0862, 159.5584),
        'bones': [
            ('Bone027', (-0.981212, 0.189737, -0.034963), 17.1540, 0.002113,
             (-0.474289, -0.879164, 0.046048), 0.109673861, (-2.3482, 7.9381, 157.9515)),
            ('Bone028', (-0.961716, -0.267439, 0.059816), 28.0434, 0.015207,
             (-0.969233, -0.239952, 0.054870), 0.207962467, (-4.2982, 7.7179, 157.3400)),
            ('Bone029', (-0.725161, -0.627868, 0.282707), 19.5592, -0.014193,
             (-0.969233, -0.239952, 0.054870), 0.207962483, (-6.0152, 6.7689, 158.1678)),
        ],
    },
    {
        'control': 'CTRL_EYE_LID_L',
        'display': '左眼上眼皮',
        'pos': (4.14179, 9.81847, 160.624),
        'pivot': (3.1508, 4.0862, 159.5584),
        'bones': [
            ('Bone036', (-0.981212, -0.189736, 0.034963), 17.1539, 0.002120,
             (-0.474284, 0.879166, -0.046066), 0.109673832, (2.3487, 7.9381, 157.9514)),
            ('Bone037', (-0.961711, 0.267459, -0.059822), 28.0430, 0.015217,
             (-0.969232, 0.239957, -0.054870), 0.207962432, (4.2988, 7.7179, 157.3399)),
            ('Bone038', (-0.725145, 0.627867, -0.282748), 19.5564, -0.014200,
             (-0.969232, 0.239957, -0.054870), 0.207962404, (6.0158, 6.7689, 158.1679)),
        ],
    },
]

# Bone037 的 Max 实测轨迹（转 UE 坐标），用于中间点核对
MAX_TRACK_BONE037 = [
    (0.0, (4.32270, 8.26317, 159.389)),
    (0.142857, (4.33495, 8.24623, 159.086)),
    (0.285714, (4.34203, 8.20864, 158.784)),
    (0.428571, (4.34387, 8.15048, 158.484)),
    (0.571429, (4.34044, 8.07197, 158.188)),
    (0.714286, (4.33174, 7.97340, 157.898)),
    (0.857143, (4.31778, 7.85516, 157.615)),
    (1.0, (4.29860, 7.71777, 157.340)),
]


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def vstr(v):
    return '(X=%f,Y=%f,Z=%f)' % (v[0], v[1], v[2])


def ensure_control(rig, h, hc, control, display, pos):
    k = key(control)
    parent = key(PARENT, unreal.RigElementType.BONE)

    settings = unreal.RigControlSettings()
    settings.control_type = unreal.RigControlType.POSITION
    settings.display_name = display
    settings.shape_name = SHAPE
    settings.primary_axis = unreal.RigControlAxis.X
    settings.draw_limits = False
    settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    try:
        settings.shape_color = unreal.LinearColor(*COLOR)
    except Exception:
        pass

    zero = h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0))
    hc.add_control(control, parent, settings, zero, False, False)

    st = h.get_control_settings(k)
    st.control_type = unreal.RigControlType.POSITION
    st.display_name = display
    st.shape_name = SHAPE
    st.draw_limits = False
    st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    try:
        st.shape_color = unreal.LinearColor(*COLOR)
    except Exception:
        pass
    st.minimum_value = h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, Z_MIN))
    st.maximum_value = h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, Z_MAX))
    h.set_control_settings(k, st)

    shape_tf = unreal.Transform()
    shape_tf.translation = unreal.Vector(0.0, 0.0, 0.0)
    shape_tf.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
    shape_tf.scale3d = unreal.Vector(*SHAPE_SCALE)
    h.set_control_shape_transform(k, shape_tf, True)
    h.set_control_shape_transform(k, shape_tf, False)

    off = h.get_global_control_offset_transform(k)
    off.translation = unreal.Vector(*pos)
    off.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
    off.scale3d = unreal.Vector(1.0, 1.0, 1.0)
    h.set_control_offset_transform(k, off, True, True)
    h.set_control_offset_transform(k, off, False, True)
    h.set_control_value(k, zero)
    return k


def build_side(ctrl, side, y0):
    get = unit(ctrl, 'RigUnit_GetControlVector', '%s_GET' % side['control'], (200, y0))
    ctrl.set_pin_default_value(get + '.Control', side['control'], False, False)
    ctrl.set_pin_default_value(get + '.Space', 'LocalSpace', False, False)

    dot = unit(ctrl, 'RigVMFunction_MathVectorDot', '%s_DOT' % side['control'], (460, y0))
    ctrl.add_link(get + '.Vector', dot + '.A', False)
    ctrl.set_pin_default_value(dot + '.B', '(X=0.000000,Y=0.000000,Z=1.000000)', False, False)

    d = unit(ctrl, 'RigVMFunction_MathFloatMul', '%s_D' % side['control'], (700, y0))
    ctrl.add_link(dot + '.Result', d + '.A', False)
    ctrl.set_pin_default_value(d + '.B', '%f' % (-GAIN), False, False)

    s = unit(ctrl, 'RigVMFunction_MathFloatMul', '%s_S' % side['control'], (940, y0))
    ctrl.add_link(d + '.Result', s + '.A', False)
    ctrl.set_pin_default_value(s + '.B', '%f' % (1.0 / FULL_D), False, False)

    pivot = side['pivot']
    y = y0 - 260
    for bone, oaxis, oang, k1, saxis, sdeg, _t1 in side['bones']:
        oangn = unit(ctrl, 'RigVMFunction_MathFloatMul', 'OANG_%s' % bone, (1200, y))
        ctrl.add_link(s + '.Result', oangn + '.A', False)
        ctrl.set_pin_default_value(oangn + '.B', '%f' % oang, False, False)

        orad = unit(ctrl, 'RigVMFunction_MathFloatMul', 'ORAD_%s' % bone, (1450, y))
        ctrl.add_link(oangn + '.Result', orad + '.A', False)
        ctrl.set_pin_default_value(orad + '.B', '%f' % DEG2RAD, False, False)

        oq = unit(ctrl, 'RigVMFunction_MathQuaternionFromAxisAndAngle', 'OQUAT_%s' % bone, (1700, y))
        ctrl.set_pin_default_value(oq + '.Axis', vstr(oaxis), False, False)
        ctrl.add_link(orad + '.Result', oq + '.Angle', False)

        vsub = unit(ctrl, 'RigVMFunction_MathVectorSub', 'VSUB_%s' % bone, (1200, y - 160))
        ctrl.add_link('EYE_VADD_%s.Result' % bone, vsub + '.A', False)
        ctrl.set_pin_default_value(vsub + '.B', vstr(pivot), False, False)

        rotv = unit(ctrl, 'RigVMFunction_MathQuaternionRotateVector', 'ROTV_%s' % bone, (1700, y - 160))
        ctrl.add_link(oq + '.Result', rotv + '.Transform', False)
        ctrl.add_link(vsub + '.Result', rotv + '.Vector', False)

        k0 = unit(ctrl, 'RigVMFunction_MathFloatMul', 'K0_%s' % bone, (1200, y - 320))
        ctrl.add_link(s + '.Result', k0 + '.A', False)
        ctrl.set_pin_default_value(k0 + '.B', '%f' % k1, False, False)

        k1n = unit(ctrl, 'RigVMFunction_MathFloatAdd', 'K1_%s' % bone, (1450, y - 320))
        ctrl.add_link(k0 + '.Result', k1n + '.A', False)
        ctrl.set_pin_default_value(k1n + '.B', '1.000000', False, False)

        vsc = unit(ctrl, 'RigVMFunction_MathVectorScale', 'VSC_%s' % bone, (1950, y - 320))
        ctrl.add_link(rotv + '.Result', vsc + '.Value', False)
        ctrl.add_link(k1n + '.Result', vsc + '.Factor', False)

        vadd = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_%s' % bone, (2200, y - 320))
        ctrl.add_link(vsc + '.Result', vadd + '.A', False)
        ctrl.set_pin_default_value(vadd + '.B', vstr(pivot), False, False)

        try:
            _fm_break_link(ctrl, 'EYE_MAKE_%s.Translation' % bone)
        except Exception:
            pass
        ctrl.add_link(vadd + '.Result', 'EYE_MAKE_%s.Translation' % bone, False)

        # 自转（与 v1 相同）
        sang = unit(ctrl, 'RigVMFunction_MathFloatMul', 'SANG_%s' % bone, (2200, y))
        ctrl.add_link(d + '.Result', sang + '.A', False)
        ctrl.set_pin_default_value(sang + '.B', '%f' % sdeg, False, False)

        srad = unit(ctrl, 'RigVMFunction_MathFloatMul', 'SRAD_%s' % bone, (2450, y))
        ctrl.add_link(sang + '.Result', srad + '.A', False)
        ctrl.set_pin_default_value(srad + '.B', '%f' % DEG2RAD, False, False)

        sq = unit(ctrl, 'RigVMFunction_MathQuaternionFromAxisAndAngle', 'SQUAT_%s' % bone, (2700, y))
        ctrl.set_pin_default_value(sq + '.Axis', vstr(saxis), False, False)
        ctrl.add_link(srad + '.Result', sq + '.Angle', False)

        qrot = unit(ctrl, 'RigVMFunction_MathQuaternionMul', 'QROT_%s' % bone, (2950, y))
        ctrl.add_link(sq + '.Result', qrot + '.A', False)
        ctrl.add_link('EYE_BT_%s.Transform.Rotation' % bone, qrot + '.B', False)

        try:
            _fm_break_link(ctrl, 'EYE_MAKE_%s.Rotation' % bone)
        except Exception:
            pass
        ctrl.add_link(qrot + '.Result', 'EYE_MAKE_%s.Rotation' % bone, False)

        y -= 620


def exec_targets(rig):
    targets = {}
    for link in rig.get_default_model().get_links():
        try:
            if 'Execute' in str(link.get_target_pin().get_name()):
                targets[str(link.get_target_node().get_name())] = str(link.get_source_node().get_name())
        except Exception:
            pass
    return targets


def ensure_exec_chain(rig, ctrl):
    targets = exec_targets(rig)
    if 'BROW_SET_meibu_L' not in targets:
        try:
            ctrl.add_link('Begin.ExecutePin', 'BROW_SET_meibu_L.ExecutePin', False)
        except Exception:
            pass
    targets = exec_targets(rig)
    if targets.get('EYE_SET_Bone043') == _fm_node('Begin'):
        try:
            ctrl.add_link('BROW_SET_Bone012.ExecutePin', 'EYE_SET_Bone043.ExecutePin', False)
        except Exception:
            pass


def main():
    report = {'sides': {}}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Eye lid arc rebuild'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CONTROL and str(k.name) in [s['control'] for s in SIDES]:
                    hc.remove_element(k)

            y = -12000
            for side in SIDES:
                ensure_control(rig, h, hc, side['control'], side['display'], side['pos'])
                build_side(ctrl, side, y)
                y -= 3200
                report['sides'][side['control']] = [b[0] for b in side['bones']]

            ensure_exec_chain(rig, ctrl)
            try:
                rig.set_preview_mesh(_fm_load_asset(MESH))
                report['preview_mesh'] = MESH
            except Exception as exc:
                report['preview_mesh'] = 'ERR %r' % exc

            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    _fm_save_asset(rig, False)

    # 自检
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()

    def ckey(n):
        return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)

    def bkey(n):
        return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)

    def pos(b):
        t = rh.get_global_transform(bkey(b)).translation
        return (t.x, t.y, t.z)

    def solve(v):
        for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
            rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, v)))
        inst.execute('Forwards Solve')

    report['endpoint_err'] = {}
    solve(-10.0)
    for side in SIDES:
        for bone, _a, _b, _c, _d, _e, t1 in side['bones']:
            p = pos(bone)
            err = sum((p[i] - t1[i]) ** 2 for i in range(3)) ** 0.5
            report['endpoint_err'][bone] = round(err, 4)

    # 中间点 vs Max 实测（Bone037）
    track = []
    for s_val, expect in MAX_TRACK_BONE037:
        solve(-10.0 * s_val)
        p = pos('Bone037')
        err = sum((p[i] - expect[i]) ** 2 for i in range(3)) ** 0.5
        track.append([round(s_val, 3), round(err, 4), [round(x, 3) for x in p]])
    report['bone037_track_err'] = track

    solve(0.0)
    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[EyeLidArc] saved')
    except Exception:
        unreal.log_error('[EyeLidArc] FAILED\n' + traceback.format_exc())
        raise
