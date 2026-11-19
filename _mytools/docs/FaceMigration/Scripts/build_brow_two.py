"""CR_Seven_MorphSliders：左/右眉整体平移控制（对应 Max 的 Animcraft_*_Brow_Z_Ctrl）。

Max 侧实测（世界空间）：拖 10 cm -> 本侧眉毛整体平移 5 cm，左眉右眉互不影响；Y（前后）无效。
UE 侧：两个 POSITION 控制，X/Z 各 ×0.5，Y 用逐分量乘 (0.5,0,0.5) 屏蔽。

用法：python Scripts\\ue_run.py Scripts\\build_brow_two.py
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
PREFIX = 'BROW_'
LIMIT = 10.0
COEF = 0.5
SHAPE = 'Box_Thick'
CTRL_SHAPE_SCALE = (0.42, 0.22, 0.05)
CTRL_YAW_DEG = 0.0

SIDES = {
    'L': {
        'control': 'CTRL_BROW_L',
        'display': '左眉整体',
        'bones': ['meibu_L', 'Bone007', 'Bone008', 'Bone009'],
        'pos': (4.0, 11.2, 161.2),
        'yaw': -CTRL_YAW_DEG,
    },
    'R': {
        'control': 'CTRL_BROW_R',
        'display': '右眉整体',
        'bones': ['meibu_R', 'Bone010', 'Bone011', 'Bone012'],
        'pos': (-4.0, 11.2, 161.2),
        'yaw': CTRL_YAW_DEG,
    },
}

PARENT = 'Root'


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def ensure_control(rig, h, hc, side, cfg):
    k = key(cfg['control'])
    parent = key(PARENT, unreal.RigElementType.BONE)

    settings = unreal.RigControlSettings()
    settings.control_type = unreal.RigControlType.POSITION
    settings.display_name = cfg['display']
    settings.shape_name = SHAPE
    settings.primary_axis = unreal.RigControlAxis.X
    settings.draw_limits = False
    settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    try:
        settings.shape_color = unreal.LinearColor(1.0, 0.42, 0.04, 1.0)
    except Exception:
        pass

    zero = h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0))
    hc.add_control(cfg['control'], parent, settings, zero, False, False)

    st = h.get_control_settings(k)
    st.control_type = unreal.RigControlType.POSITION
    st.display_name = cfg['display']
    st.shape_name = SHAPE
    st.draw_limits = False
    st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    try:
        st.shape_color = unreal.LinearColor(1.0, 0.42, 0.04, 1.0)
    except Exception:
        pass
    st.minimum_value = h.make_control_value_from_vector(unreal.Vector(-LIMIT, -LIMIT, -LIMIT))
    st.maximum_value = h.make_control_value_from_vector(unreal.Vector(LIMIT, LIMIT, LIMIT))
    h.set_control_settings(k, st)

    # 手柄显示大小放在 shape transform 上；控制自身的 transform 必须是单位缩放，
    # 否则非均匀缩放会把拖动距离按 1/scale 放大，控制值就不等于世界厘米了。
    shape_tf = unreal.Transform()
    shape_tf.translation = unreal.Vector(0.0, 0.0, 0.0)
    shape_tf.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0)
    shape_tf.scale3d = unreal.Vector(*CTRL_SHAPE_SCALE)
    h.set_control_shape_transform(k, shape_tf, True)
    h.set_control_shape_transform(k, shape_tf, False)

    off = h.get_global_control_offset_transform(k)
    off.translation = unreal.Vector(*cfg['pos'])
    off.rotation = unreal.Quat(0.0, 0.0, 0.0, 1.0) * unreal.Quat(
        0.0, 0.0, unreal.MathLibrary.sin(unreal.MathLibrary.degrees_to_radians(cfg['yaw'] / 2.0)),
        unreal.MathLibrary.cos(unreal.MathLibrary.degrees_to_radians(cfg['yaw'] / 2.0)))
    off.scale3d = unreal.Vector(1.0, 1.0, 1.0)
    h.set_control_offset_transform(k, off, True, True)
    h.set_control_offset_transform(k, off, False, True)
    h.set_control_value(k, zero)
    return k


def build_side(ctrl, cfg, exec_prev, y0):
    """一侧的图：控制值 -> 世界偏移 -> 每根骨 GetTransform(初始) + 偏移 -> SetTransform。"""
    control = cfg['control']
    y = y0
    get = unit(ctrl, 'RigUnit_GetControlVector', '%s_GET' % cfg['control'], (300, y))
    ctrl.set_pin_default_value(get + '.Control', control, False, False)
    ctrl.set_pin_default_value(get + '.Space', 'LocalSpace', False, False)

    scale = unit(ctrl, 'RigVMFunction_MathVectorScale', '%s_SCALE' % cfg['control'], (560, y))
    ctrl.add_link(get + '.Vector', scale + '.Value', False)
    ctrl.set_pin_default_value(scale + '.Factor', '1.000000', False, False)

    # Max 侧 Y（前后）无效，只有 X/Z 各 0.5；用逐分量乘法把 Y 清零。
    mask = unit(ctrl, 'RigVMFunction_MathVectorMul', '%s_MASK' % cfg['control'], (760, y))
    ctrl.add_link(scale + '.Result', mask + '.A', False)
    ctrl.set_pin_default_value(mask + '.B', '(X=%f,Y=0.000000,Z=%f)' % (COEF, COEF), False, False)

    prev = exec_prev
    for bone in cfg['bones']:
        y += 200
        bt = unit(ctrl, 'RigUnit_GetTransform', 'BT_%s' % bone, (560, y))
        ctrl.set_pin_default_value(bt + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
        ctrl.set_pin_default_value(bt + '.Space', 'GlobalSpace', False, False)
        ctrl.set_pin_default_value(bt + '.bInitial', 'True', False, False)

        add = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_%s' % bone, (1000, y))
        ctrl.add_link(bt + '.Transform.Translation', add + '.A', False)
        ctrl.add_link(mask + '.Result', add + '.B', False)

        make = unit(ctrl, 'RigVMFunction_MathTransformMake', 'MAKE_%s' % bone, (1240, y))
        ctrl.add_link(add + '.Result', make + '.Translation', False)
        ctrl.add_link(bt + '.Transform.Rotation', make + '.Rotation', False)
        ctrl.add_link(bt + '.Transform.Scale3D', make + '.Scale', False)

        setn = unit(ctrl, 'RigUnit_SetTransform', 'SET_%s' % bone, (1280, y))
        ctrl.set_pin_default_value(setn + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
        ctrl.set_pin_default_value(setn + '.Space', 'GlobalSpace', False, False)
        ctrl.set_pin_default_value(setn + '.bInitial', 'False', False, False)
        ctrl.set_pin_default_value(setn + '.Weight', '1.0', False, False)
        ctrl.set_pin_default_value(setn + '.bPropagateToChildren', 'False', False, False)
        ctrl.add_link(make + '.Result', setn + '.Value', False)
        ctrl.add_link(prev + '.ExecutePin', setn + '.ExecutePin', False)
        prev = setn
    return prev


def main():
    report = {'sides': {}}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Brow L/R whole translate rebuild'):
        rig.set_auto_vm_recompile(False)
        try:
            # 清掉旧 BROW_ 节点（幂等）
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            # 清掉旧控制
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CONTROL and str(k.name) in ('CTRL_BROW_L', 'CTRL_BROW_R'):
                    hc.remove_element(k)
                elif k.type == unreal.RigElementType.NULL and str(k.name).startswith('BrowBoard'):
                    hc.remove_element(k)

            prev = _fm_node('Begin')
            y = -100
            for side, cfg in SIDES.items():
                ensure_control(rig, h, hc, side, cfg)
                prev = build_side(ctrl, cfg, prev, y)
                y -= 1000
                report['sides'][side] = {'control': cfg['control'], 'bones': cfg['bones']}

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

    # ---- 自检：实例化，喂控制值，读骨骼世界位移 ----
    bones = SIDES['L']['bones'] + SIDES['R']['bones']

    def probe(values):
        inst = rig.create_control_rig()
        inst.request_init()
        rh = inst.get_hierarchy()
        for side, cfg in SIDES.items():
            v = values.get(side, (0.0, 0.0, 0.0))
            rh.set_control_value(key(cfg['control']), rh.make_control_value_from_vector(unreal.Vector(*v)))
        inst.execute('Forwards Solve')
        return {b: rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)).translation
                for b in bones}

    base = probe({})
    report['rest'] = {b: [round(base[b].x, 2), round(base[b].y, 2), round(base[b].z, 2)] for b in bones}

    cases = {
        'L_x+10': {'L': (10.0, 0.0, 0.0)},
        'L_y+10': {'L': (0.0, 10.0, 0.0)},
        'L_z+10': {'L': (0.0, 0.0, 10.0)},
        'R_x+10': {'R': (10.0, 0.0, 0.0)},
        'R_y+10': {'R': (0.0, 10.0, 0.0)},
        'R_z+10': {'R': (0.0, 0.0, 10.0)},
    }
    for tag, vals in cases.items():
        cur = probe(vals)
        report[tag] = {b: [round(cur[b].x - base[b].x, 2), round(cur[b].y - base[b].y, 2), round(cur[b].z - base[b].z, 2)]
                       for b in bones}

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[BrowTwo] saved')
    except Exception:
        unreal.log_error('[BrowTwo] FAILED\n' + traceback.format_exc())
        raise

