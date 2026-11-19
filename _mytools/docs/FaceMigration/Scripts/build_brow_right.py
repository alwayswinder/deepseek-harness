"""K_SX_MeiMao_R004 -> CR_Seven_MorphSliders：右眉形状控制（BRR_*）。

Max 侧实测（Seven_Skin.max）：
  K_SX_MeiMao_R004（Sphere，父 K_SX_MeiMao_R003）驱动右侧眉毛 4 个辅助点
  KPoint051-054 的“位置表达式”，点再驱动右眉骨骼，网格产生眉形变化。
  +10（父空间）：
     X  -> KPoint051 (1.365,-1.630,7.229) / 052 (3.372,-2.018,0.686) / 053 (1.218,-1.505,-1.702)
     Y  -> 约 0（忽略）
     Z  -> KPoint051 (-0.081,-1.003,1.534) / 052 (-0.891,0.413,3.998) / 053 (0.006,-0.007,0.492)

UE 侧：
  控制 CTRL_BROW_R（POSITION，-10..10 cm，X = Max 的 X 轴，Z = Max 的 Z 轴）
  驱动 Bone010/011/012（右眉 3 根，父 meibu_R），LocalSpace 位移，分量按
  局部 X->世界 X、局部 Y->世界 Z、局部 Z->世界 -Y 换算。

用法：python Scripts\\ue_run.py Scripts\\build_brow_right.py
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
CTRL = 'CTRL_BROW_R'
PREFIX = 'BRR_'
LIMIT = 10.0
POS = (-30.0, 15.68, 142.0)
SHAPE_SCALE = 8.0
BOARD = 'BrowBoard'

# 每单位控制值对应的局部位移（Max +10 位移 /10，再按 (dx, dz, -dy) 转到局部）
COEF = {
    'Bone010': {'X': (0.1365, -0.7229, 0.1630), 'Z': (-0.0081, -0.1534, 0.1003)},
    'Bone011': {'X': (0.3372, -0.0686, 0.2018), 'Z': (-0.0891, -0.3998, -0.0413)},
    'Bone012': {'X': (0.1218, 0.1702, 0.1505), 'Z': (0.0006, -0.0492, 0.0007)},
}
BONES = ['Bone010', 'Bone011', 'Bone012']
PARENT = 'meibu_R'


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def bone_key(name):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=name)


def unit(ctrl, type_name, name, pos):
    path = getattr(unreal, type_name).static_struct().get_path_name()
    node = ctrl.add_unit_node_from_struct_path(path, 'Execute', unreal.Vector2D(*pos), PREFIX + name, False)
    return node.get_name()


def ensure_bones(rig, h, hc, report):
    existing = {str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE}
    report['bones_missing_before'] = [b for b in BONES if b not in existing]

    tmp = unreal.new_object(unreal.RigHierarchy)
    tmp.get_controller(True).import_bones_from_skeletal_mesh(
        _fm_load_asset(MESH), 'None', True, True, False, False, False)

    fixed, added = [], []
    for b in BONES:
        want = tmp.get_global_transform(bone_key(b))
        if b in existing:
            have = h.get_global_transform(bone_key(b))
            delta = (have.translation - want.translation).length()
            if delta <= 0.01:
                continue
            hc.remove_element(bone_key(b))
            fixed.append(b)
        else:
            added.append(b)
        hc.add_bone(b, bone_key(PARENT), want, True,
                    unreal.RigBoneType.IMPORTED, False, False)
    report['bones_added'] = added
    report['bones_realigned'] = fixed


def build_graph(ctrl, first_exec):
    prev = first_exec
    gcv = unit(ctrl, 'RigUnit_GetControlVector', 'GET', (380, 0))
    ctrl.set_pin_default_value(gcv + '.Control', CTRL, False, False)
    ctrl.set_pin_default_value(gcv + '.Space', 'LocalSpace', False, False)

    axes = {}
    for tag, vec, ypos in (('X', (1.0, 0.0, 0.0), -180), ('Z', (0.0, 0.0, 1.0), -320)):
        ax = unit(ctrl, 'RigVMFunction_MathVectorMake', 'AXIS_' + tag, (380, ypos))
        ctrl.set_pin_default_value(ax + '.X', '%f' % vec[0], False, False)
        ctrl.set_pin_default_value(ax + '.Y', '%f' % vec[1], False, False)
        ctrl.set_pin_default_value(ax + '.Z', '%f' % vec[2], False, False)
        axes[tag] = ax

    dots = {}
    for tag, ypos in (('X', -180), ('Z', -320)):
        d = unit(ctrl, 'RigVMFunction_MathVectorDot', 'DOT_' + tag, (620, ypos))
        ctrl.add_link(gcv + '.Vector', d + '.A', False)
        ctrl.add_link(axes[tag] + '.Result', d + '.B', False)
        dots[tag] = d

    y = 520
    for bone in BONES:
        terms = []
        for tag in ('X', 'Z'):
            coef = COEF[bone][tag]
            v = unit(ctrl, 'RigVMFunction_MathVectorMake', 'V%s_%s' % (tag, bone), (880, y))
            ctrl.set_pin_default_value(v + '.X', '%f' % coef[0], False, False)
            ctrl.set_pin_default_value(v + '.Y', '%f' % coef[1], False, False)
            ctrl.set_pin_default_value(v + '.Z', '%f' % coef[2], False, False)
            m = unit(ctrl, 'RigVMFunction_MathVectorScale', 'M%s_%s' % (tag, bone), (1120, y))
            ctrl.add_link(v + '.Result', m + '.Value', False)
            ctrl.set_pin_default_value(m + '.Factor', '1.0', False, False)
            ctrl.add_link(dots[tag] + '.Result', m + '.Factor', False)
            terms.append(m)
            y += 160

        add = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'OFF_' + bone, (1360, y))
        ctrl.add_link(terms[0] + '.Result', add + '.A', False)
        ctrl.add_link(terms[1] + '.Result', add + '.B', False)

        bt = unit(ctrl, 'RigUnit_GetTransform', 'BT_' + bone, (1360, y + 240))
        ctrl.set_pin_default_value(bt + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
        ctrl.set_pin_default_value(bt + '.Space', 'LocalSpace', False, False)
        ctrl.set_pin_default_value(bt + '.bInitial', 'True', False, False)

        vadd = unit(ctrl, 'RigVMFunction_MathVectorAdd', 'VADD_' + bone, (1600, y + 240))
        ctrl.add_link(bt + '.Transform.Translation', vadd + '.A', False)
        ctrl.add_link(add + '.Result', vadd + '.B', False)

        setn = unit(ctrl, 'RigUnit_SetTranslation', 'SET_' + bone, (1840, y))
        ctrl.set_pin_default_value(setn + '.Item', '(Type=Bone,Name="%s")' % bone, False, False)
        ctrl.set_pin_default_value(setn + '.Space', 'LocalSpace', False, False)
        ctrl.set_pin_default_value(setn + '.bInitial', 'False', False, False)
        ctrl.add_link(vadd + '.Result', setn + '.Translation', False)
        ctrl.add_link(prev + '.ExecutePin', setn + '.ExecutePin', False)
        prev = setn
        y += 300
    return prev


def main():
    report = {}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    ctrl = rig.get_controller(rig.get_default_model())

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Brow right shape (R004)'):
        rig.set_auto_vm_recompile(False)
        try:
            for node in list(rig.get_default_model().get_nodes()):
                if node.get_name().startswith(PREFIX):
                    ctrl.remove_node(node, False)

            ensure_bones(rig, h, hc, report)

            k = key(CTRL)
            exists = True
            try:
                h.get_control_settings(k)
                h.get_control_settings(k).control_type
                exists = str(h.get_control_settings(k).control_type) != ''
            except Exception:
                exists = False
            if not exists:
                settings = unreal.RigControlSettings()
                settings.control_type = unreal.RigControlType.POSITION
                settings.display_name = '右眉形状'
                settings.shape_name = 'Sphere_Solid'
                settings.draw_limits = False
                hc.add_control(CTRL, key(BOARD), settings,
                               h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)),
                               False, False)

            st = h.get_control_settings(k)
            st.control_type = unreal.RigControlType.POSITION
            st.display_name = '右眉形状'
            st.shape_name = 'Sphere_Solid'
            st.draw_limits = False
            st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
            st.minimum_value = h.make_control_value_from_vector(unreal.Vector(-LIMIT, -LIMIT, -LIMIT))
            st.maximum_value = h.make_control_value_from_vector(unreal.Vector(LIMIT, LIMIT, LIMIT))
            h.set_control_settings(k, st)

            off = h.get_global_control_offset_transform(k)
            off.translation = unreal.Vector(*POS)
            off.scale3d = unreal.Vector(SHAPE_SCALE, SHAPE_SCALE, SHAPE_SCALE)
            h.set_control_offset_transform(k, off, True, True)
            h.set_control_offset_transform(k, off, False, True)
            h.set_control_value(k, h.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))

            first = None
            for node in rig.get_default_model().get_nodes():
                if node.get_name() == 'BRW_SET_meibu_R':
                    first = node.get_name()
            assert first, 'BRW_SET_meibu_R not found'

            build_graph(ctrl, first)
            rig.recompile_vm()
            report['status'] = str(rig.get_editor_property('status'))
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    def probe(v):
        i = rig.create_control_rig()
        i.request_init()
        rh = i.get_hierarchy()
        rh.set_control_value(key(CTRL), rh.make_control_value_from_vector(unreal.Vector(*v)))
        i.execute('Forwards Solve')
        return {b: rh.get_global_transform(bone_key(b)).translation for b in BONES}

    base = probe((0.0, 0.0, 0.0))
    report['rest'] = {b: [round(base[b].x, 3), round(base[b].y, 3), round(base[b].z, 3)] for b in BONES}
    for tag, v in (('X=+10', (10.0, 0.0, 0.0)), ('Z=+10', (0.0, 0.0, 10.0))):
        cur = probe(v)
        report[tag] = {b: [round(cur[b].x - base[b].x, 3),
                           round(cur[b].y - base[b].y, 3),
                           round(cur[b].z - base[b].z, 3)] for b in BONES}

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        _fm_save_asset(_fm_load_asset(ASSET), False)
        unreal.log('[BrowRight] saved')
    except Exception:
        unreal.log_error('[BrowRight] FAILED\n' + traceback.format_exc())
        raise
