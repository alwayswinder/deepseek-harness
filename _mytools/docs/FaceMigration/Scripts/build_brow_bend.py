"""CR_Seven_MorphSliders：右眉弯曲控制（对应 Max 的 Animcraft_Right_Brow_Ctrl）。

Max 侧实测（3ds Max 2026 / Seven_Skin_New.max）：
  Animcraft_Right_Brow_Ctrl 是 NURBSCurveshape，父级 Animcraft_Right_Brow_Z_Ctrl。
  它的局部位置 (x,y,z) 被逐轴 float_limit 约束：x≈0，y∈[-2,2]，z 拖动时被夹到 -1。
  实际驱动链：n 的位置 -> KPoint051/052/053 的表达式（MeiMao_SX 变量）-> 三根眉骨。
  基准 (0,0,0)：
    Bone010 (-1.17773,-9.76263,161.442) euler (90,0,-95)
    Bone011 (-4.07024,-9.00898,161.795) euler (90,0,-115)
    Bone012 (-6.74794,-7.37118,162.146) euler (90,0,-130)
  y=+2,z=0 相对基准：
    Bone010 dP=(-0.01744,-0.19924,0.3)    Bone011 dP=(-0.18126,0.08452,0.8)   Bone012 dP=(0,0,0.1)
  y=-2,z=0 相对基准：
    Bone010 dP=(0.08218,-0.20796,-0.5)   Bone011 dP=(0.29491,-0.31406,-0.62) Bone012 dP=(0,0,-0.1)
  z=-1 的固定外移（与 y 无关）：
    Bone010 (0.59772,-0.05233,0)  Bone011 (0.45316,-0.21131,0)  Bone012 (0,0,0)
  旋转只随 y 变（绕世界 X，单位：度）：
    y=+2: Bone010 -9.1674, Bone011 0, Bone012 +10.313
    y=-2: Bone010 +11.4589, Bone011 -3.4377, Bone012 -4.5837
  meibu_R / meibu_L 不动。

UE 侧：一个 POSITION 控制 CTRL_BROW_R_BEND，限值 ±2，取控制值 Z 分量 c：
  half = c/2, neghalf = -c/2
  位置 = zoff + (c>0 ? half*D_pos : neghalf*D_neg)
  旋转 = 绕世界 X 轴（RigVM 四元数合成顺序：Initial * Delta，角度取 -dEuler）

用法：python Scripts\\ue_run.py Scripts\\build_brow_bend.py
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
PREFIX = 'BB_'
LIMIT = 2.0
SHAPE = 'Box_Thick'
SHAPE_SCALE = (0.15, 0.10, 0.05)
CTRL = 'CTRL_BROW_R_BEND'
CTRL_POS = (-2.2336, 11.5447, 162.256)

# bone, D_pos(y=+2,z=0), D_neg(y=-2,z=0), zoff, dEuler_pos, dEuler_neg
# 实测：实际拖动时 p2 的 z 分量虽然显示 -1，但不进入骨骼驱动（位移与 z=0 相同），因此 zoff 全 0。
BONES = [
    ('Bone010', (-0.01744, -0.19924, 0.3), (0.08218, -0.20796, -0.5),
     (0.0, 0.0, 0.0), -9.1674, 11.4589),
    ('Bone011', (-0.18126, 0.08452, 0.8), (0.29491, -0.31406, -0.62),
     (0.0, 0.0, 0.0), 0.0, -3.4377),
    ('Bone012', (0.0, 0.0, 0.1), (0.0, 0.0, -0.1),
     (0.0, 0.0, 0.0), 10.313, -4.5837),
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


def ensure_control(rig, h, hc):
    k = key(CTRL)
    parent = key(PARENT, unreal.RigElementType.BONE)

    settings = unreal.RigControlSettings()
    settings.control_type = unreal.RigControlType.POSITION
    settings.display_name = '右眉弯曲'
    settings.shape_name = SHAPE
    settings.primary_axis = unreal.RigControlAxis.X
    settings.draw_limits = False
    settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    try:
        settings.shape_color = unreal.LinearColor(0.15, 0.85, 1.0, 1.0)
    except Exception:
        pass

    zero = h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0))
    hc.add_control(CTRL, parent, settings, zero, False, False)

    st = h.get_control_settings(k)
    st.control_type = unreal.RigControlType.POSITION
    st.display_name = '右眉弯曲'
    st.shape_name = SHAPE
    st.draw_limits = False
    st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    try:
        st.shape_color = unreal.LinearColor(0.15, 0.85, 1.0, 1.0)
    except Exception:
        pass
    st.minimum_value = h.make_control_value_from_vector(unreal.Vector(-LIMIT, -LIMIT, -LIMIT))
    st.maximum_value = h.make_control_value_from_vector(unreal.Vector(LIMIT, LIMIT, LIMIT))
    h.set_control_settings(k, st)

    shape_tf = unreal.Transform()
    shape_tf.translation = unreal.Vector(0.0, 0.0, 0.0)
    shape_tf.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
    shape_tf.scale3d = unreal.Vector(*SHAPE_SCALE)
    h.set_control_shape_transform(k, shape_tf, True)
    h.set_control_shape_transform(k, shape_tf, False)

    off = h.get_global_control_offset_transform(k)
    off.translation = unreal.Vector(*CTRL_POS)
    off.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
    off.scale3d = unreal.Vector(1.0, 1.0, 1.0)
    h.set_control_offset_transform(k, off, True, True)
    h.set_control_offset_transform(k, off, False, True)
    h.set_control_value(k, zero)
    return k


def build(ctrl):
    # 共享：控制值 Z、是否为正、c/2、-c/2
    get = unit(ctrl, 'RigUnit_GetControlVector', 'GET', (200, -2600))
    ctrl.set_pin_default_value(get + '.Control', CTRL, False, False)
    ctrl.set_pin_default_value(get + '.Space', 'LocalSpace', False, False)

    dot = unit(ctrl, 'RigVMFunction_MathVectorDot', 'DOT', (460, -2600))
    ctrl.add_link(get + '.Vector', dot + '.A', False)
    ctrl.set_pin_default_value(dot + '.B', '(X=0.000000,Y=0.000000,Z=1.000000)', False, False)

    gt = unit(ctrl, 'RigVMFunction_MathFloatGreater', 'ISPOS', (700, -2600))
    ctrl.add_link(dot + '.Result', gt + '.A', False)
    ctrl.set_pin_default_value(gt + '.B', '0.0', False, False)

    half = unit(ctrl, 'RigVMFunction_MathFloatMul', 'HALF', (700, -2760))
    ctrl.add_link(dot + '.Result', half + '.A', False)
    ctrl.set_pin_default_value(half + '.B', '0.5', False, False)

    nhalf = unit(ctrl, 'RigVMFunction_MathFloatMul', 'NHALF', (700, -2920))
    ctrl.add_link(dot + '.Result', nhalf + '.A', False)
    ctrl.set_pin_default_value(nhalf + '.B', '-0.5', False, False)

    # |c|/2：zoff 随行程线性加入（Max 里 z 被 limit 到 -1，UE 用线性过渡避免 0 点跳变）
    absn = unit(ctrl, 'RigVMFunction_MathFloatAbs', 'ABS', (700, -3080))
    ctrl.add_link(dot + '.Result', absn + '.Value', False)

    halfabs = unit(ctrl, 'RigVMFunction_MathFloatMul', 'HALFABS', (960, -3080))
    ctrl.add_link(absn + '.Result', halfabs + '.A', False)
    ctrl.set_pin_default_value(halfabs + '.B', '0.5', False, False)

    y = -2200
    for bone, dpos, dneg, zoff, rpos, rneg in BONES:
        # 位置
        mulp = unit(ctrl, 'RigVMFunction_MathVectorScale', 'POSMUL_%s' % bone, (960, y))
        ctrl.set_pin_default_value(mulp + '.Value', vstr(dpos), False, False)
        ctrl.add_link(half + '.Result', mulp + '.Factor', False)

        muln = unit(ctrl, 'RigVMFunction_MathVectorScale', 'NEGMUL_%s' % bone, (960, y - 140))
        ctrl.set_pin_default_value(muln + '.Value', vstr(dneg), False, False)
        ctrl.add_link(nhalf + '.Result', muln + '.Factor', False)

        sel = unit(ctrl, 'RigVMFunction_MathVectorSelectBool', 'SELPOS_%s' % bone, (1220, y - 70))
        ctrl.add_link(gt + '.Result', sel + '.Condition', False)
        ctrl.add_link(mulp + '.Result', sel + '.IfTrue', False)
        ctrl.add_link(muln + '.Result', sel + '.IfFalse', False)

        zc = unit(ctrl, 'RigVMFunction_MathVectorScale', 'ZOFF_%s' % bone, (1220, y - 210))
        ctrl.set_pin_default_value(zc + '.Value', vstr(zoff), False, False)
        ctrl.add_link(halfabs + '.Result', zc + '.Factor', False)

        add1 = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'ADD1_%s' % bone, (1480, y - 70))
        ctrl.add_link('BPT_ADD_%s.Result' % bone, add1 + '.A', False)
        ctrl.add_link(sel + '.Result', add1 + '.B', False)

        add2 = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'ADD2_%s' % bone, (1740, y - 70))
        ctrl.add_link(add1 + '.Result', add2 + '.A', False)
        ctrl.add_link(zc + '.Result', add2 + '.B', False)

        # 旋转
        pang = unit(ctrl, 'RigVMFunction_MathFloatMul', 'PANG_%s' % bone, (960, y - 360))
        ctrl.add_link(half + '.Result', pang + '.A', False)
        ctrl.set_pin_default_value(pang + '.B', '%f' % (-rpos), False, False)

        nang = unit(ctrl, 'RigVMFunction_MathFloatMul', 'NANG_%s' % bone, (960, y - 500))
        ctrl.add_link(nhalf + '.Result', nang + '.A', False)
        ctrl.set_pin_default_value(nang + '.B', '%f' % (-rneg), False, False)

        asel = unit(ctrl, 'RigVMFunction_MathFloatSelectBool', 'SELANG_%s' % bone, (1220, y - 430))
        ctrl.add_link(gt + '.Result', asel + '.Condition', False)
        ctrl.add_link(pang + '.Result', asel + '.IfTrue', False)
        ctrl.add_link(nang + '.Result', asel + '.IfFalse', False)

        rad = unit(ctrl, 'RigVMFunction_MathFloatMul', 'RAD_%s' % bone, (1480, y - 430))
        ctrl.add_link(asel + '.Result', rad + '.A', False)
        ctrl.set_pin_default_value(rad + '.B', '%f' % DEG2RAD, False, False)

        quat = unit(ctrl, 'RigVMFunction_MathQuaternionFromAxisAndAngle', 'QUAT_%s' % bone, (1740, y - 430))
        ctrl.set_pin_default_value(quat + '.Axis', '(X=1.000000,Y=0.000000,Z=0.000000)', False, False)
        ctrl.add_link(rad + '.Result', quat + '.Angle', False)

        qrot = unit(ctrl, 'RigVMFunction_MathQuaternionMul', 'QROT_%s' % bone, (2000, y - 430))
        ctrl.add_link('BROW_BT_%s.Transform.Rotation' % bone, qrot + '.A', False)
        ctrl.add_link(quat + '.Result', qrot + '.B', False)

        try:
            _fm_break_link(ctrl, 'BROW_MAKE_%s.Translation' % bone)
        except Exception:
            pass
        ctrl.add_link(add2 + '.Result', 'BROW_MAKE_%s.Translation' % bone, False)

        try:
            _fm_break_link(ctrl, 'BROW_MAKE_%s.Rotation' % bone)
        except Exception:
            pass
        ctrl.add_link(qrot + '.Result', 'BROW_MAKE_%s.Rotation' % bone, False)

        y -= 700


def main():
    report = {'control': CTRL, 'bones': [b[0] for b in BONES]}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Brow bend R rebuild'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CONTROL and str(k.name) == CTRL:
                    hc.remove_element(k)

            ensure_control(rig, h, hc)
            build(ctrl)

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

    bones = [b[0] for b in BONES]

    def probe(c):
        inst = rig.create_control_rig()
        inst.request_init()
        rh = inst.get_hierarchy()
        rh.set_control_value(key(CTRL), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, c)))
        inst.execute('Forwards Solve')
        out = {}
        for b in bones:
            t = rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b))
            e = t.rotation.rotator()
            out[b] = ([round(t.translation.x, 4), round(t.translation.y, 4), round(t.translation.z, 4)],
                      [round(e.pitch, 3), round(e.yaw, 3), round(e.roll, 3)])
        return out

    base = probe(0.0)
    report['base'] = base
    for c in (2.0, -2.0, 1.0, -1.0):
        cur = probe(c)
        d = {}
        for b in bones:
            d[b] = {
                'dP': [round(cur[b][0][i] - base[b][0][i], 4) for i in range(3)],
                'dEuler': [round(cur[b][1][i] - base[b][1][i], 3) for i in range(3)],
            }
        report['c_%+g' % c] = d

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[BrowBend] saved')
    except Exception:
        unreal.log_error('[BrowBend] FAILED\n' + traceback.format_exc())
        raise

