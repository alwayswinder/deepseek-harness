"""在指定诊断 Rig 增量添加左右 XYP 下眼皮；保留现有上眼皮与执行链。

输入数据在 Docs/Evidence/XYP。固定目标仅为 CR_Seven_LidWorldRotation。
运行：python Scripts/ue_run.py Scripts/build_lower_lids.py
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime
import json
import math
from pathlib import Path
import shutil

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
PREFIX = 'LLID_'
CONTROLS = ['CTRL_EYE_LOWER_LID_R', 'CTRL_EYE_LOWER_LID_L']
ROOT = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE = _fm_tool('Docs/Evidence/XYP')


def key(name, kind=unreal.RigElementType.BONE):
    return unreal.RigElementKey(type=kind, name=name)


def vstr(v):
    return '(X=%.9f,Y=%.9f,Z=%.9f)' % tuple(v)


def exec_links(model):
    return [(str(l.get_source_node().get_name()) + '.' + str(l.get_source_pin().get_name()),
             str(l.get_target_node().get_name()) + '.' + str(l.get_target_pin().get_name()))
            for l in model.get_links() if 'Execute' in str(l.get_target_pin().get_name())]


def instance(rig):
    inst = rig.create_control_rig()
    inst.request_init()
    h = inst.get_hierarchy()
    if not h.get_all_keys():
        h.copy_hierarchy(rig.get_hierarchy())
        inst.request_init()
    assert all(h.contains(k) for k in rig.get_hierarchy().get_all_keys())
    return inst, h


def solve(inst, h, values):
    for k in h.get_all_keys():
        if k.type == unreal.RigElementType.CONTROL:
            h.set_control_value(k, h.make_control_value_from_vector(unreal.Vector(0, 0, 0)))
    for n, v in values.items():
        k = key(n, unreal.RigElementType.CONTROL)
        assert h.contains(k), n
        h.set_control_value(k, h.make_control_value_from_vector(unreal.Vector(*v)))
    assert inst.execute('Forwards Solve')


def pose(h):
    return {str(k.name): h.get_global_transform(k) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE}


def rotation_error(q, r):
    a, b = [q.x, q.y, q.z, q.w], [r.x, r.y, r.z, r.w]
    dot = abs(sum(x*y for x, y in zip(a, b))) / math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
    return math.degrees(2*math.acos(min(1, max(0, dot))))


def main():
    rig = _fm_load_asset(ASSET)
    assert rig is not None
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()
    model = rig.get_default_model()
    nodes_before = len(model.get_nodes())
    ctrl = rig.get_controller(model)
    params = json.loads((_fm_read(EVIDENCE / 'parameters.json')).read_text(encoding='utf-8'))
    for side in params['sides']:
        for b in side['bones']:
            assert h.contains(key(b))
            assert model.find_node_by_name('EYE_MAKE_' + b) is not None
    old_exec = exec_links(model)
    # 备份磁盘原件，再保存已有内存状态并备份该状态。
    backup = _fm_saved('Backup') / ('LowerLids_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    _fm_output(backup).mkdir(parents=True, exist_ok=False)
    disk_path = _fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk_path, backup / 'disk_before.uasset')
    assert _fm_save_asset(rig, False)
    shutil.copy2(disk_path, backup / 'memory_before.uasset')

    # 记录现有全部控制的单控姿势，验证增量修改不改变旧功能。
    before_inst, bh = instance(rig)
    cases = [{}]
    for k in bh.get_all_keys():
        n = str(k.name)
        if k.type != unreal.RigElementType.CONTROL or n in CONTROLS:
            continue
        if n.startswith('CTRL_EYE_LID_'):
            vectors = [(0, 0, z) for z in (-2.5, -5, -10)]
        elif n.endswith('_BEND'):
            vectors = [(0, 0, -2), (0, 0, 2)]
        else:
            vectors = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]
        cases.extend({n: v} for v in vectors)
    previous = []
    for values in cases:
        solve(before_inst, bh, values)
        previous.append(pose(bh))

    def unit(cls, name, x, y):
        node = ctrl.add_unit_node_from_struct_path(getattr(unreal, cls).static_struct().get_path_name(),
                                                   'Execute', unreal.Vector2D(x, y), PREFIX + name, False)
        assert node is not None, cls
        return str(node.get_name())

    def default(pin, value):
        assert ctrl.set_pin_default_value(pin, value, False, False), pin

    def link(a, b):
        assert ctrl.add_link(a, b, False), (a, b)

    def replace(a, b):
        ctrl.break_all_links(b, True, False, False)
        link(a, b)

    auto = rig.get_auto_vm_recompile()
    rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add XYP lower eyelids to diagnostic Rig'):
            for n in list(model.get_nodes()):
                if str(n.get_name()).startswith(PREFIX):
                    assert ctrl.remove_node(n, False)
            for c in CONTROLS:
                k = key(c, unreal.RigElementType.CONTROL)
                if h.contains(k):
                    assert hc.remove_element(k)
            for si, side in enumerate(params['sides']):
                c = CONTROLS[si]
                setting = unreal.RigControlSettings()
                setting.control_type = unreal.RigControlType.POSITION
                setting.display_name = '右下眼皮' if si == 0 else '左下眼皮'
                setting.shape_name = 'Box_Thick'
                setting.shape_color = unreal.LinearColor(0.15, 0.75, 1.0, 1.0)
                setting.primary_axis = unreal.RigControlAxis.Z
                setting.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
                setting.minimum_value = h.make_control_value_from_vector(unreal.Vector(0, 0, 0))
                setting.maximum_value = h.make_control_value_from_vector(unreal.Vector(0, 0, 10))
                setting.draw_limits = False
                ck = hc.add_control(c, key('Root'), setting, h.make_control_value_from_vector(unreal.Vector(0, 0, 0)), False, False)
                assert h.contains(ck)
                offset = unreal.Transform()
                offset.translation = unreal.Vector(*side['control_rest'])
                for initial in (True, False):
                    h.set_control_offset_transform(ck, offset, initial, True)
                    shape = unreal.Transform()
                    shape.scale3d = unreal.Vector(0.14, 0.10, 0.05)
                    h.set_control_shape_transform(ck, shape, initial)
                y = -22000 - si * 5000
                get = unit('RigUnit_GetControlVector', 'GET_' + c, 200, y)
                default(get + '.Control', c)
                default(get + '.Space', 'LocalSpace')
                dot = unit('RigVMFunction_MathVectorDot', 'Z_' + c, 440, y)
                link(get + '.Vector', dot + '.A')
                default(dot + '.B', vstr((0, 0, 1)))
                clamp = unit('RigVMFunction_MathFloatClamp', 'CLAMP_' + c, 680, y)
                link(dot + '.Result', clamp + '.Value')
                default(clamp + '.Minimum', '0.0')
                default(clamp + '.Maximum', '10.0')
                scalar = unit('RigVMFunction_MathFloatMul', 'S_' + c, 920, y)
                link(clamp + '.Result', scalar + '.A')
                default(scalar + '.B', '0.1')
                angle = unit('RigVMFunction_MathFloatMul', 'ANGLE_' + c, 1160, y)
                link(scalar + '.Result', angle + '.A')
                default(angle + '.B', '%.12f' % side['orbit_radians_full'])
                orbit = unit('RigVMFunction_MathQuaternionFromAxisAndAngle', 'ORBIT_' + c, 1400, y)
                default(orbit + '.Axis', vstr(side['orbit_axis']))
                link(angle + '.Result', orbit + '.Angle')
                for bi, (b, bc) in enumerate(side['bones'].items()):
                    by = y - 500 - bi * 1200
                    shift = unit('RigVMFunction_MathVectorScale', 'EXPR_' + b, 1160, by)
                    default(shift + '.Value', vstr(bc['pre_orbit_delta_full']))
                    link(scalar + '.Result', shift + '.Factor')
                    add = unit('RigVMFunction_MathVectorAdd', 'LOCAL_' + b, 1400, by)
                    link('EYE_VADD_' + b + '.Result', add + '.A')
                    link(shift + '.Result', add + '.B')
                    sub = unit('RigVMFunction_MathVectorSub', 'FROM_PIVOT_' + b, 1640, by)
                    link(add + '.Result', sub + '.A')
                    default(sub + '.B', vstr(side['pivot']))
                    rotate = unit('RigVMFunction_MathQuaternionRotateVector', 'ROTATE_' + b, 1880, by)
                    link(orbit + '.Result', rotate + '.Transform')
                    link(sub + '.Result', rotate + '.Vector')
                    position = unit('RigVMFunction_MathVectorAdd', 'POSITION_' + b, 2120, by)
                    link(rotate + '.Result', position + '.A')
                    default(position + '.B', vstr(side['pivot']))
                    replace(position + '.Result', 'EYE_MAKE_' + b + '.Translation')
                    extra_angle = unit('RigVMFunction_MathFloatMul', 'EXTRA_ANGLE_' + b, 1400, by - 350)
                    link(scalar + '.Result', extra_angle + '.A')
                    default(extra_angle + '.B', '%.12f' % bc['extra_radians_full'])
                    extra = unit('RigVMFunction_MathQuaternionFromAxisAndAngle', 'EXTRA_' + b, 1640, by - 350)
                    default(extra + '.Axis', vstr(bc['extra_axis']))
                    link(extra_angle + '.Result', extra + '.Angle')
                    delta = unit('RigVMFunction_MathQuaternionMul', 'DELTA_' + b, 1880, by - 350)
                    link(orbit + '.Result', delta + '.A')
                    link(extra + '.Result', delta + '.B')
                    rotation = unit('RigVMFunction_MathQuaternionMul', 'ROTATION_' + b, 2120, by - 350)
                    link(delta + '.Result', rotation + '.A')
                    link('EYE_BT_' + b + '.Transform.Rotation', rotation + '.B')
                    replace(rotation + '.Result', 'EYE_MAKE_' + b + '.Rotation')
            # 严格还原旧执行链，只给已有 SetTransform 改数据输入。
            for output in set(a for a, b in exec_links(model)) | set(a for a, b in old_exec):
                ctrl.break_all_links(output, False, False, False)
            for a, b in old_exec:
                link(a, b)
            assert sorted(exec_links(model)) == sorted(old_exec)
            rig.recompile_vm()
            assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR
    finally:
        rig.set_auto_vm_recompile(auto)

    inst, rh = instance(rig)
    max_dp = max_dq = 0.0
    for values, old in zip(cases, previous):
        solve(inst, rh, values)
        for b, tf in old.items():
            new = rh.get_global_transform(key(b))
            max_dp = max(max_dp, (new.translation - tf.translation).length())
            max_dq = max(max_dq, rotation_error(new.rotation, tf.rotation))
    assert max_dp < 1e-6 and max_dq < 1e-4, ('Existing control regression', max_dp, max_dq)
    assert _fm_save_asset(rig, False)
    report = {'asset': ASSET, 'backup': str(backup), 'nodes_before': nodes_before,
              'nodes_after': len(model.get_nodes()), 'controls_after': len([k for k in h.get_all_keys() if k.type == unreal.RigElementType.CONTROL]),
              'new_controls': CONTROLS, 'regression_cases': len(cases), 'regression_max_position_error_cm': max_dp,
              'regression_max_rotation_error_deg': max_dq, 'execution_links_preserved': sorted(exec_links(model)) == sorted(old_exec),
              'status': str(rig.get_editor_property('status')), 'saved': True}
    (_fm_output(EVIDENCE / 'build_report.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
