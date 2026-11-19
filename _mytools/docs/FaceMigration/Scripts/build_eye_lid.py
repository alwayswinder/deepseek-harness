"""【已废弃，改用 build_eye_lid_arc.py】CR_Seven_MorphSliders：左右上眼皮闭合（对应 Max 的 SYP_R001 / SYP_L001）。

注意：本脚本用「初始位置 + dP*d」直线平移，与 Max 的绕眼球中心圆弧轨迹最大差 1.28mm，
中途会穿模。保留仅供对照，重跑它会把资产改回旧行为。

Max 侧实测（3ds Max 2026 / Seven_Skin_New.max）：
  SYP_R001 / SYP_L001 是 NURBSCurveShape，position 的 Y 轴 float_limit 范围 [-1.75, 0]。
  拖动世界 +Y 时 p2.y 变化，骨骼沿固定世界轴旋转（上眼皮闭合）+ 少量位移：
    右眼：Bone027(上内) Bone028(上中) Bone029(上外)
    左眼：Bone036(上内) Bone037(上中) Bone038(上外)
  拖到 limiter 上限（世界 Y 约 135cm、p2.y=-1.75）时的端点数据：
    Bone027 dP=(-0.01285,0.29322,-1.23192) ang=14.806  axis=(0.8795,0.0857,-0.4681)
    Bone028 dP=( 0.02409,0.54537,-2.04955) ang=28.075  axis=(-0.0744,0.0248,0.9969)
    Bone029 dP=(-0.08751,0.49914,-1.33270) ang=28.075  axis=(0.4341,0.0248,0.9005)
    Bone036 dP=( 0.01284,0.29323,-1.23189) ang=14.806  axis=(0.8825,0.0110,0.4701)
    Bone037 dP=(-0.02410,0.54541,-2.04951) ang=28.075  axis=(0.0744,-0.0248,0.9969)
    Bone038 dP=( 0.08750,0.49916,-1.33267) ang=28.075  axis=(-0.4341,-0.0248,0.9005)
  负方向（世界 -Y）无效果。

UE 侧：两个 POSITION 控制 CTRL_EYE_LID_R / CTRL_EYE_LID_L，限值单侧：
  X/Y 锁 0、Z ∈ [-10, 0]（Max 里 SYP 的 limiter 只允许一个方向，向上拖无效果）。
  d = -ctrlZ * 13.5（ctrlZ=-10 -> d=135，对应 Max 端点）
  每骨：位置 += dP_per_cm * d；旋转 = Initial * Quat(axis_ue, angle_per_cm * d)
  axis_ue = (Max.x, -Max.y, Max.z)，角度取反（镜像）。

用法：python Scripts\\ue_run.py Scripts\\build_eye_lid.py
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

SIDES = [
    {
        'control': 'CTRL_EYE_LID_R',
        'display': '右眼上眼皮',
        'pos': (-4.14181, 9.81844, 160.624),
        'bones': [
            # bone, dP per Max cm (UE), axis (UE), deg per Max cm (UE)
            ('Bone027', (-0.0000952, -0.0021720, -0.0091253), (0.8825, 0.0110, -0.4701), 0.10967),
            ('Bone028', (0.0001785, -0.0040398, -0.0151811), (0.0744, 0.0248, -0.9969), 0.20796),
            ('Bone029', (-0.0006482, -0.0036973, -0.0098726), (-0.4341, 0.0248, -0.9005), 0.20796),
        ],
    },
    {
        'control': 'CTRL_EYE_LID_L',
        'display': '左眼上眼皮',
        'pos': (4.14179, 9.81847, 160.624),
        'bones': [
            ('Bone036', (0.0000951, -0.0021721, -0.0091251), (-0.8825, -0.0110, -0.4701), 0.10967),
            ('Bone037', (-0.0001785, -0.0040401, -0.0151811), (-0.0744, -0.0248, -0.9969), 0.20796),
            ('Bone038', (0.0006481, -0.0036974, -0.0098724), (0.4341, -0.0248, -0.9005), 0.20796),
        ],
    },
]

PARENT = 'Root'
DEG2RAD = 0.017453292519943295


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

    y = y0 - 200
    for bone, dpos, axis, ang in side['bones']:
        pos = unit(ctrl, 'RigVMFunction_MathVectorScale', 'POS_%s' % bone, (960, y))
        ctrl.set_pin_default_value(pos + '.Value', vstr(dpos), False, False)
        ctrl.add_link(d + '.Result', pos + '.Factor', False)

        add = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'ADD_%s' % bone, (1220, y))
        ctrl.add_link('EYE_VADD_%s.Result' % bone, add + '.A', False)
        ctrl.add_link(pos + '.Result', add + '.B', False)

        angn = unit(ctrl, 'RigVMFunction_MathFloatMul', 'ANG_%s' % bone, (960, y - 140))
        ctrl.add_link(d + '.Result', angn + '.A', False)
        ctrl.set_pin_default_value(angn + '.B', '%f' % ang, False, False)

        rad = unit(ctrl, 'RigVMFunction_MathFloatMul', 'RAD_%s' % bone, (1220, y - 140))
        ctrl.add_link(angn + '.Result', rad + '.A', False)
        ctrl.set_pin_default_value(rad + '.B', '%f' % DEG2RAD, False, False)

        quat = unit(ctrl, 'RigVMFunction_MathQuaternionFromAxisAndAngle', 'QUAT_%s' % bone, (1480, y - 140))
        ctrl.set_pin_default_value(quat + '.Axis', vstr(axis), False, False)
        ctrl.add_link(rad + '.Result', quat + '.Angle', False)

        qrot = unit(ctrl, 'RigVMFunction_MathQuaternionMul', 'QROT_%s' % bone, (1740, y - 140))
        ctrl.add_link(quat + '.Result', qrot + '.A', False)
        ctrl.add_link('EYE_BT_%s.Transform.Rotation' % bone, qrot + '.B', False)

        try:
            _fm_break_link(ctrl, 'EYE_MAKE_%s.Translation' % bone)
        except Exception:
            pass
        ctrl.add_link(add + '.Result', 'EYE_MAKE_%s.Translation' % bone, False)

        try:
            _fm_break_link(ctrl, 'EYE_MAKE_%s.Rotation' % bone)
        except Exception:
            pass
        ctrl.add_link(qrot + '.Result', 'EYE_MAKE_%s.Rotation' % bone, False)

        y -= 420


def exec_targets(rig):
    """返回 {执行流目标节点: 来源节点}。"""
    targets = {}
    for link in rig.get_default_model().get_links():
        try:
            if 'Execute' in str(link.get_target_pin().get_name()):
                targets[str(link.get_target_node().get_name())] = str(link.get_source_node().get_name())
        except Exception:
            pass
    return targets


def ensure_exec_chain(rig, ctrl):
    """LID_* 节点被插进过执行流，删除后 BROW 链入口可能丢失，这里补回。

    目标拓扑：Begin -> BROW_SET_meibu_L -> … -> BROW_SET_Bone012 -> EYE_SET_Bone043 -> …
    """
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
    with unreal.ScopedEditorTransaction('Eye lid L/R rebuild'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CONTROL and str(k.name) in [s['control'] for s in SIDES]:
                    hc.remove_element(k)

            y = -5200
            for side in SIDES:
                ensure_control(rig, h, hc, side['control'], side['display'], side['pos'])
                build_side(ctrl, side, y)
                y -= 1800
                report['sides'][side['control']] = {'bones': [b[0] for b in side['bones']], 'pos': list(side['pos'])}

            ensure_exec_chain(rig, ctrl)
            report['exec_targets'] = exec_targets(rig)

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

    def probe(values):
        inst = rig.create_control_rig()
        inst.request_init()
        rh = inst.get_hierarchy()
        for c, v in values.items():
            rh.set_control_value(key(c), rh.make_control_value_from_vector(unreal.Vector(*v)))
        inst.execute('Forwards Solve')
        out = {}
        for side in SIDES:
            for bone, _, _, _ in side['bones']:
                t = rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=bone))
                out[bone] = (t.translation, t.rotation)
        return out

    base = probe({})
    import math

    def qinv(q):
        return unreal.Quat(-q.x, -q.y, -q.z, q.w)

    for side in SIDES:
        cur = probe({side['control']: (0.0, 0.0, -10.0)})
        d = {}
        for bone, _, _, _ in side['bones']:
            dq = cur[bone][1] * qinv(base[bone][1])
            ang = math.degrees(2.0 * math.acos(min(1.0, abs(dq.w))))
            sin_half = math.sin(math.radians(ang) / 2.0)
            if sin_half > 1e-6 and dq.w < 0:
                ang = -ang
            norm = max(abs(sin_half), 1e-6)
            axis = [dq.x / norm, dq.y / norm, dq.z / norm]
            d[bone] = {
                'dP': [round(cur[bone][0].x - base[bone][0].x, 4),
                       round(cur[bone][0].y - base[bone][0].y, 4),
                       round(cur[bone][0].z - base[bone][0].z, 4)],
                'angle': round(ang, 3),
                'axis': [round(a, 3) for a in axis],
            }
        report['full_' + side['control']] = d

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[EyeLid] saved')
    except Exception:
        unreal.log_error('[EyeLid] FAILED\n' + traceback.format_exc())
        raise


