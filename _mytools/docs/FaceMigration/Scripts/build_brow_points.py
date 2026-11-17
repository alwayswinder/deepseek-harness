"""CR_Seven_MorphSliders：左右眉各三个点控（对应 Max 的 zCircle049/050/048 与 zCircle051/052/053）。

Max 侧实测（世界空间，3ds Max 2026 / Seven_Skin_New.max）：
  拖 zCircle049 (+10 X) -> Bone008 世界 +10 X（1:1，无交叉）
  zCircle050 -> Bone009，zCircle048 -> Bone007
  zCircle051 -> Bone010，zCircle052 -> Bone011，zCircle053 -> Bone012
  三轴都是 1:1；左右互不影响。

UE 侧：六个 POSITION 控制，父 Root，位置 = 对应骨骼世界坐标（Max zCircle 与骨骼重合），
系数 1.0，与现有“眉毛整体”控制（CTRL_BROW_L/R，系数 0.5）在图上做向量相加。

用法：python Scripts\\ue_run.py Scripts\\build_brow_points.py
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
PREFIX = 'BPT_'
LIMIT = 10.0
COEF = 1.0
SHAPE = 'Box_Thick'
SHAPE_SCALE = (0.12, 0.10, 0.05)

# (control, display, bone, world pos (UE), max zCircle)
POINTS = [
    ('CTRL_BROW_L_IN', '左眉内点', 'Bone008', (1.178, 9.763, 161.442), 'zCircle049'),
    ('CTRL_BROW_L_MID', '左眉中点', 'Bone009', (4.071, 9.009, 161.795), 'zCircle050'),
    ('CTRL_BROW_L_OUT', '左眉外点', 'Bone007', (6.748, 7.371, 162.146), 'zCircle048'),
    ('CTRL_BROW_R_IN', '右眉内点', 'Bone010', (-1.177, 9.763, 161.442), 'zCircle051'),
    ('CTRL_BROW_R_MID', '右眉中点', 'Bone011', (-4.070, 9.009, 161.795), 'zCircle052'),
    ('CTRL_BROW_R_OUT', '右眉外点', 'Bone012', (-6.748, 7.371, 162.146), 'zCircle053'),
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
        settings.shape_color = unreal.LinearColor(1.0, 0.42, 0.04, 1.0)
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
        st.shape_color = unreal.LinearColor(1.0, 0.42, 0.04, 1.0)
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


def build_point(ctrl, control, bone, y):
    get = unit(ctrl, 'RigUnit_GetControlVector', '%s_GET' % control, (300, y))
    ctrl.set_pin_default_value(get + '.Control', control, False, False)
    ctrl.set_pin_default_value(get + '.Space', 'LocalSpace', False, False)

    scale = unit(ctrl, 'RigVMFunction_MathVectorScale', '%s_SCALE' % control, (560, y))
    ctrl.add_link(get + '.Vector', scale + '.Value', False)
    ctrl.set_pin_default_value(scale + '.Factor', '%f' % COEF, False, False)

    add = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'ADD_%s' % bone, (800, y))
    ctrl.add_link('BROW_VADD_%s.Result' % bone, add + '.A', False)
    ctrl.add_link(scale + '.Result', add + '.B', False)

    # 把 MAKE.Translation 从 BROW_VADD 改接到新的相加节点上
    make_path = 'BROW_MAKE_%s.Translation' % bone
    try:
        _fm_break_link(ctrl, make_path)
    except Exception:
        pass
    ctrl.add_link(add + '.Result', make_path, False)
    return add


def main():
    report = {'points': [], 'rest': {}}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Brow points L/R rebuild'):
        rig.set_auto_vm_recompile(False)
        try:
            # 幂等：清掉旧点控节点与控制
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)
            for k in list(h.get_all_keys()):
                if k.type == unreal.RigElementType.CONTROL and str(k.name) in [p[0] for p in POINTS]:
                    hc.remove_element(k)

            y = -1500
            for control, display, bone, pos, maxname in POINTS:
                ensure_control(rig, h, hc, control, display, pos)
                build_point(ctrl, control, bone, y)
                y -= 220
                report['points'].append({'control': control, 'display': display, 'bone': bone,
                                         'pos': list(pos), 'max': maxname})

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

    # ---- 自检 ----
    names = [p[0] for p in POINTS]
    bones = [p[2] for p in POINTS]

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
    report['rest'] = {b: [round(base[b].x, 2), round(base[b].y, 2), round(base[b].z, 2)] for b in bones}

    for idx, (control, display, bone, pos, maxname) in enumerate(POINTS):
        for tag, vec in (('x+10', (10.0, 0.0, 0.0)), ('y+10', (0.0, 10.0, 0.0)), ('z+10', (0.0, 0.0, 10.0))):
            cur = probe({control: vec})
            d = {b: [round(cur[b].x - base[b].x, 2), round(cur[b].y - base[b].y, 2), round(cur[b].z - base[b].z, 2)]
                 for b in bones}
            report['%s %s' % (control, tag)] = d

    # 叠加：整体 CTRL_BROW_L 10X + 左眉内点 10Z -> Bone008 = (5,0,10)
    cur = probe({'CTRL_BROW_L': (10.0, 0.0, 0.0), 'CTRL_BROW_L_IN': (0.0, 0.0, 10.0)})
    report['stack_L_IN'] = {b: [round(cur[b].x - base[b].x, 2), round(cur[b].y - base[b].y, 2),
                                round(cur[b].z - base[b].z, 2)] for b in bones}

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[BrowPoints] saved')
    except Exception:
        unreal.log_error('[BrowPoints] FAILED\n' + traceback.format_exc())
        raise

