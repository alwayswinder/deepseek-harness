"""修复执行流：把 BROW 链重新接回 Begin → EYE 链之间。

背景：重跑 build_eye_lid.py 删除 LID_* 节点时，ControlRig 把 Begin 直接接到了
EYE_SET_Bone043，BROW_SET_meibu_L 的 Execute 输入被丢掉，眉毛整条链不再执行。
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
HEAD = 'BROW_SET_meibu_L'
TAIL = 'BROW_SET_Bone012'
EYE_HEAD = 'EYE_SET_Bone043'


def exec_targets(rig):
    targets = {}
    for link in rig.get_default_model().get_links():
        try:
            if 'Execute' in str(link.get_target_pin().get_name()):
                targets[str(link.get_target_node().get_name())] = str(link.get_source_node().get_name())
        except Exception:
            pass
    return targets


def main():
    rig = _fm_load_asset(ASSET)
    ctrl = rig.get_controller(rig.get_default_model())
    report = {'before': exec_targets(rig)}

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Fix brow exec chain'):
        rig.set_auto_vm_recompile(False)
        try:
            targets = report['before']
            # 1. BROW 链首必须由 Begin 驱动
            if targets.get(HEAD) != _fm_node('Begin'):
                if targets.get(EYE_HEAD) == _fm_node('Begin'):
                    try:
                        ctrl.break_link('Begin.ExecutePin', '%s.ExecutePin' % EYE_HEAD)
                        report['break_begin_to_eye'] = True
                    except Exception as exc:
                        report['break_begin_to_eye'] = 'ERR %r' % exc
                try:
                    ctrl.add_link('Begin.ExecutePin', '%s.ExecutePin' % HEAD, False)
                    report['begin_to_brow'] = True
                except Exception as exc:
                    report['begin_to_brow'] = 'ERR %r' % exc
            else:
                report['begin_to_brow'] = 'already ok'

            # 2. BROW 链尾 -> EYE 链首
            if targets.get(EYE_HEAD) != TAIL:
                try:
                    ctrl.add_link('%s.ExecutePin' % TAIL, '%s.ExecutePin' % EYE_HEAD, False)
                    report['brow_to_eye'] = True
                except Exception as exc:
                    report['brow_to_eye'] = 'ERR %r' % exc
            else:
                report['brow_to_eye'] = 'already ok'
        finally:
            rig.set_auto_vm_recompile(old_auto)

    rig.recompile_vm()
    report['after'] = exec_targets(rig)
    report['status'] = str(rig.get_editor_property('status'))
    assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'

    # 自检：眉毛、眼周各给一次值
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()

    def ckey(n):
        return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)

    def bkey(n):
        return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)

    def pos(b):
        t = rh.get_global_transform(bkey(b)).translation
        return [round(t.x, 3), round(t.y, 3), round(t.z, 3)]

    def reset():
        for c in ('CTRL_BROW_L', 'CTRL_BROW_R', 'CTRL_BROW_L_IN', 'CTRL_BROW_L_MID', 'CTRL_BROW_L_OUT',
                  'CTRL_BROW_R_IN', 'CTRL_BROW_R_MID', 'CTRL_BROW_R_OUT', 'CTRL_BROW_L_BEND', 'CTRL_BROW_R_BEND',
                  'CTRL_EYE_L_UP_MID', 'CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
            try:
                rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))
            except Exception:
                pass
        inst.execute('Forwards Solve')

    reset()
    base = {b: pos(b) for b in ('Bone007', 'Bone008', 'Bone009', 'Bone010', 'Bone011', 'Bone012', 'Bone037')}

    rh.set_control_value(ckey('CTRL_BROW_L'), rh.make_control_value_from_vector(unreal.Vector(10.0, 0.0, 0.0)))
    inst.execute('Forwards Solve')
    brow = {b: pos(b) for b in ('Bone007', 'Bone008', 'Bone009', 'Bone010', 'Bone011', 'Bone012')}
    report['brow_L_10'] = {b: [round(brow[b][i] - base[b][i], 3) for i in range(3)] for b in brow}

    reset()
    rh.set_control_value(ckey('CTRL_EYE_LID_L'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
    inst.execute('Forwards Solve')
    report['lid_L_minus10_Bone037'] = [round(pos('Bone037')[i] - base['Bone037'][i], 3) for i in range(3)]

    reset()
    rh.set_control_value(ckey('CTRL_EYE_L_UP_MID'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 10.0)))
    inst.execute('Forwards Solve')
    report['eye_L_up_mid_10_Bone037'] = [round(pos('Bone037')[i] - base['Bone037'][i], 3) for i in range(3)]

    reset()
    _fm_save_asset(rig, False)
    report['saved'] = True

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[BrowExecFix] saved')
    except Exception:
        unreal.log_error('[BrowExecFix] FAILED\n' + traceback.format_exc())
        raise
