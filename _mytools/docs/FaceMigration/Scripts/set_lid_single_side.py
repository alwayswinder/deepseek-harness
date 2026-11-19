"""把上眼皮控制 CTRL_EYE_LID_L/R 的限值改成单侧：X/Y 锁 0，Z ∈ [-10, 0]。

对应 3ds Max 的 limiter（SYP position 的 Y 只允许 [-1.75, 0]），向上拖不再反向翻转眼皮。
幂等，可重复执行。
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
CONTROLS = ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R')
Z_MIN = -10.0
Z_MAX = 0.0


def key(name):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)


def vec(v):
    return [round(v.x, 3), round(v.y, 3), round(v.z, 3)]


def describe(st):
    return {
        'type': str(st.control_type),
        'min': str(st.minimum_value),
        'max': str(st.maximum_value),
        'limit_enabled': [(l.minimum, l.maximum) for l in st.limit_enabled],
    }


def main():
    report = {'controls': {}}
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    hc = rig.get_hierarchy_controller()

    old_auto = rig.get_auto_vm_recompile()
    rig.modify()
    with unreal.ScopedEditorTransaction('Eye lid control: single-sided limits'):
        rig.set_auto_vm_recompile(False)
        try:
            for name in CONTROLS:
                k = key(name)
                st = h.get_control_settings(k)
                before = describe(st)

                st.control_type = unreal.RigControlType.POSITION
                st.limit_enabled = [
                    unreal.RigControlLimitEnabled(minimum=True, maximum=True) for _ in range(3)
                ]
                st.minimum_value = h.make_control_value_from_vector(
                    unreal.Vector(0.0, 0.0, Z_MIN))
                st.maximum_value = h.make_control_value_from_vector(
                    unreal.Vector(0.0, 0.0, Z_MAX))

                try:
                    hc.set_control_settings(k, st)
                    via = 'hierarchy_controller'
                except Exception:
                    h.set_control_settings(k, st)
                    via = 'hierarchy'

                after = describe(h.get_control_settings(k))
                report['controls'][name] = {'before': before, 'after': after, 'via': via}
        finally:
            rig.set_auto_vm_recompile(old_auto)

    try:
        rig.recompile_vm()
    except Exception as exc:
        report['recompile_note'] = repr(exc)
    report['status'] = str(rig.get_editor_property('status'))
    assert rig.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR, 'compile error'

    _fm_save_asset(rig, False)
    report['saved'] = True

    # 实例自检：设成越界值，看编辑器是否回夹
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()
    probe = {}
    for name in CONTROLS:
        rh.set_control_value(key(name), rh.make_control_value_from_vector(unreal.Vector(10.0, 10.0, 10.0)))
        v = rh.get_vector_from_control_value(rh.get_control_value(key(name)))
        probe[name] = [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
    report['probe_set_out_of_range'] = probe

    print('JSONSTART')
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('JSONEND')
    return report


if __name__ == '__main__':
    try:
        main()
        unreal.log('[EyeLidLimit] saved')
    except Exception:
        unreal.log_error('[EyeLidLimit] FAILED\n' + traceback.format_exc())
        raise
