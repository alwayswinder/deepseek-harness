"""CR_Seven_MorphSliders：眼周 16 个点控（对应 Max 的 zCircle083/074/075/076/082/077/078/079 及其镜像）。

Max 侧实测（3ds Max 2026 / Seven_Skin_New.max）：
  每个 zCircle 世界三轴 1:1 驱动一根眼周骨，无交叉、无旋转：
    右眼：083->Bone043(内眼角) 074->Bone027(上内) 075->Bone028(上中) 076->Bone029(上外)
          082->Bone042(外眼角) 077->Bone030(下外) 078->Bone031(下中) 079->Bone032(下内)
    左眼：084->Bone044(内眼角) 068->Bone036(上内) 069->Bone037(上中) 070->Bone038(上外)
          085->Bone045(外眼角) 071->Bone039(下外) 072->Bone040(下中) 073->Bone041(下内)
  控制位置 = 对应骨骼静止世界坐标（zCircle 与骨骼重合）。

UE 侧：16 个 POSITION 控制，父 Root，±10，系数 1.0，Box_Thick，绿色。
  每根骨一条独立链：GetTransform(bInitial) -> VADD(+偏移) -> MAKE -> SET。

用法：python Scripts\\ue_run.py Scripts\\build_eye_points.py
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
PREFIX = 'EYE_'
LIMIT = 10.0
COEF = 1.0
SHAPE = 'Box_Thick'
SHAPE_SCALE = (0.12, 0.10, 0.05)
COLOR = (0.20, 0.90, 0.50, 1.0)

# control, display, bone, world pos (UE), max zCircle
POINTS = [
    ('CTRL_EYE_R_CORNER_IN', '右眼内眼角', 'Bone043', (-1.635, 8.018, 159.062), 'zCircle083'),
    ('CTRL_EYE_R_UP_IN', '右眼上内', 'Bone027', (-2.335, 8.231, 159.183), 'zCircle074'),
    ('CTRL_EYE_R_UP_MID', '右眼上中', 'Bone028', (-4.322, 8.263, 159.389), 'zCircle075'),
    ('CTRL_EYE_R_UP_OUT', '右眼上外', 'Bone029', (-5.928, 7.268, 159.501), 'zCircle076'),
    ('CTRL_EYE_R_CORNER_OUT', '右眼外眼角', 'Bone042', (-6.727, 6.340, 159.474), 'zCircle082'),
    ('CTRL_EYE_R_DOWN_OUT', '右眼下外', 'Bone030', (-5.989, 6.863, 158.032), 'zCircle077'),
    ('CTRL_EYE_R_DOWN_MID', '右眼下中', 'Bone031', (-4.278, 7.567, 157.347), 'zCircle078'),
    ('CTRL_EYE_R_DOWN_IN', '右眼下内', 'Bone032', (-2.439, 7.895, 157.878), 'zCircle079'),
    ('CTRL_EYE_L_CORNER_IN', '左眼内眼角', 'Bone044', (1.635, 8.018, 159.062), 'zCircle084'),
    ('CTRL_EYE_L_UP_IN', '左眼上内', 'Bone036', (2.336, 8.231, 159.183), 'zCircle068'),
    ('CTRL_EYE_L_UP_MID', '左眼上中', 'Bone037', (4.323, 8.263, 159.389), 'zCircle069'),
    ('CTRL_EYE_L_UP_OUT', '左眼上外', 'Bone038', (5.928, 7.268, 159.501), 'zCircle070'),
    ('CTRL_EYE_L_CORNER_OUT', '左眼外眼角', 'Bone045', (6.728, 6.341, 159.474), 'zCircle085'),
    ('CTRL_EYE_L_DOWN_OUT', '左眼下外', 'Bone039', (5.990, 6.863, 158.032), 'zCircle071'),
    ('CTRL_EYE_L_DOWN_MID', '左眼下中', 'Bone040', (4.278, 7.567, 157.347), 'zCircle072'),
    ('CTRL_EYE_L_DOWN_IN', '左眼下内', 'Bone041', (2.439, 7.895, 157.877), 'zCircle073'),
]

PARENT = 'Root'


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


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
    off.translation = unreal.Vector(*pos)
    off.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
    off.scale3d = unreal.Vector(1.0, 1.0, 1.0)
    h.set_control_offset_transform(k, off, True, True)
    h.set_control_offset_transform(k, off, False, True)
    h.set_control_value(k, zero)
    return k


def build_chain(ctrl, control, bone, exec_prev, y):
    get = unit(ctrl, 'RigUnit_GetControlVector', '%s_GET' % control, (200, y))
    ctrl.set_pin_default_value(get + '.Control', control, False, False)
    ctrl.set_pin_default_value(get + '.Space', 'LocalSpace', False, False)

    scale = unit(ctrl, 'RigVMFunction_MathVectorScale', '%s_SCALE' % control, (460, y))
    ctrl.add_link(get + '.Vector', scale + '.Value', False)
    ctrl.set_pin_default_value(scale + '.Factor', '%f' % COEF, False, False)

    bt = unit(ctrl, 'RigUnit_GetTransform', 'BT_%s' % bone, (460, y - 140))
    ctrl.set_pin_default_value(bt + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
    ctrl.set_pin_default_value(bt + '.Space', 'GlobalSpace', False, False)
    ctrl.set_pin_default_value(bt + '.bInitial', 'True', False, False)

    add = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_%s' % bone, (720, y - 140))
    ctrl.add_link(bt + '.Transform.Translation', add + '.A', False)
    ctrl.add_link(scale + '.Result', add + '.B', False)

    make = unit(ctrl, 'RigVMFunction_MathTransformMake', 'MAKE_%s' % bone, (980, y - 140))
    ctrl.add_link(add + '.Result', make + '.Translation', False)
    ctrl.add_link(bt + '.Transform.Rotation', make + '.Rotation', False)
    ctrl.add_link(bt + '.Transform.Scale3D', make + '.Scale', False)

    setn = unit(ctrl, 'RigUnit_SetTransform', 'SET_%s' % bone, (1240, y - 140))
    ctrl.set_pin_default_value(setn + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
    ctrl.set_pin_default_value(setn + '.Space', 'GlobalSpace', False, False)
    ctrl.set_pin_default_value(setn + '.bInitial', 'False', False, False)
    ctrl.set_pin_default_value(setn + '.Weight', '1.0', False, False)
    ctrl.set_pin_default_value(setn + '.bPropagateToChildren', 'False', False, False)
    ctrl.add_link(make + '.Result', setn + '.Value', False)
    ctrl.add_link(exec_prev + '.ExecutePin', setn + '.ExecutePin', False)
    return setn


def main():
    report = {'points': []}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Eye points L/R rebuild'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CONTROL and str(k.name) in [p[0] for p in POINTS]:
                    hc.remove_element(k)

            prev = _fm_node('Begin')
            y = -3200
            for control, display, bone, pos, maxname in POINTS:
                ensure_control(rig, h, hc, control, display, pos)
                prev = build_chain(ctrl, control, bone, prev, y)
                y -= 420
                report['points'].append({'control': control, 'display': display,
                                         'bone': bone, 'pos': list(pos), 'max': maxname})

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

    bones = [p[2] for p in POINTS]
    keys = {p[0]: p[2] for p in POINTS}

    def probe(values):
        inst = rig.create_control_rig()
        inst.request_init()
        rh = inst.get_hierarchy()
        for c, v in values.items():
            rh.set_control_value(key(c), rh.make_control_value_from_vector(unreal.Vector(*v)))
        inst.execute('Forwards Solve')
        return {b: rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)).translation
                for b in bones}

    base = probe({})
    report['rest'] = {b: [round(base[b].x, 3), round(base[b].y, 3), round(base[b].z, 3)] for b in bones}

    for control, display, bone, pos, maxname in POINTS:
        for tag, vec in (('x+10', (10.0, 0.0, 0.0)), ('y+10', (0.0, 10.0, 0.0)), ('z+10', (0.0, 0.0, 10.0))):
            cur = probe({control: vec})
            d = {b: [round(cur[b].x - base[b].x, 2), round(cur[b].y - base[b].y, 2),
                     round(cur[b].z - base[b].z, 2)] for b in bones}
            report['%s %s' % (control, tag)] = {b: v for b, v in d.items() if any(abs(x) > 0.01 for x in v)}

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[EyePoints] saved')
    except Exception:
        unreal.log_error('[EyePoints] FAILED\n' + traceback.format_exc())
        raise
