"""验证诊断 Rig 左右下眼睑：Max 对照、交叉、组合、限位和回零。

只求解独立实例，写报告；不保存 Rig 或改变预览。
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import importlib.util
import json
import math
from pathlib import Path
import datetime
import sys
import unreal

ROOT = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
spec = importlib.util.spec_from_file_location('lower_lid_helpers', _fm_tool('Scripts/build_lower_lids.py'))
helpers = importlib.util.module_from_spec(spec)
old_bytecode_setting = sys.dont_write_bytecode
try:
    sys.dont_write_bytecode = True
    spec.loader.exec_module(helpers)
finally:
    sys.dont_write_bytecode = old_bytecode_setting


def main():
    rig = _fm_load_asset(helpers.ASSET)
    inst, h = helpers.instance(rig)
    ref = json.loads((_fm_read(_fm_tool('Docs/Evidence/XYP/max_samples.json'))).read_text(encoding='utf-8'))
    report = {'captured_at': datetime.datetime.now().astimezone().isoformat(), 'asset': helpers.ASSET,
              'instance_elements': len(h.get_all_keys()), 'status': str(rig.get_editor_property('status')),
              'samples': [], 'independent_side_max_position_cm': 0.0, 'independent_side_max_rotation_deg': 0.0}
    helpers.solve(inst, h, {})
    neutral = helpers.pose(h)
    for si, side in enumerate(ref['sides']):
        ctrl = helpers.CONTROLS[si]
        moving = set(side['samples'][0]['bones'])
        for sample in side['samples']:
            helpers.solve(inst, h, {ctrl: (0, 0, 10 * sample['s'])})
            for b, t in sample['bones'].items():
                tf = h.get_global_transform(helpers.key(b))
                expected_p = unreal.Vector(t['p'][0], -t['p'][1], t['p'][2])
                expected_q = unreal.Quat(t['q'][0], -t['q'][1], t['q'][2], t['q'][3])
                report['samples'].append({'control': ctrl, 's': sample['s'], 'bone': b,
                                          'position_error_cm': (tf.translation - expected_p).length(),
                                          'rotation_error_deg': helpers.rotation_error(tf.rotation, expected_q)})
            for b, old in neutral.items():
                if b in moving:
                    continue
                tf = h.get_global_transform(helpers.key(b))
                report['independent_side_max_position_cm'] = max(report['independent_side_max_position_cm'], (tf.translation-old.translation).length())
                report['independent_side_max_rotation_deg'] = max(report['independent_side_max_rotation_deg'], helpers.rotation_error(tf.rotation, old.rotation))
    report['max_position_error_cm'] = max(r['position_error_cm'] for r in report['samples'])
    report['max_rotation_error_deg'] = max(r['rotation_error_deg'] for r in report['samples'])
    assert report['max_position_error_cm'] < 0.001
    assert report['max_rotation_error_deg'] < 0.01
    assert report['independent_side_max_position_cm'] < 1e-6
    assert report['independent_side_max_rotation_deg'] < 1e-4

    report['limits'] = []
    for c in helpers.CONTROLS:
        for v, expected in [((3, -4, -10), (0, 0, 0)), ((3, -4, 20), (0, 0, 10))]:
            helpers.solve(inst, h, {c: v})
            got = h.get_vector_from_control_value(h.get_control_value(helpers.key(c, unreal.RigElementType.CONTROL)))
            actual = [got.x, got.y, got.z]
            assert math.dist(actual, expected) < 1e-6, (c, actual, expected)
            report['limits'].append({'control': c, 'input': list(v), 'actual': actual})

    report['upper_lower_combinations'] = []
    for sample in ref['combo']:
        s = sample['s']
        values = {c: (0, 0, 10*s) for c in helpers.CONTROLS}
        values.update({c: (0, 0, -10*s) for c in ('CTRL_EYE_LID_R', 'CTRL_EYE_LID_L')})
        helpers.solve(inst, h, values)
        for b, t in sample['bones'].items():
            tf = h.get_global_transform(helpers.key(b))
            dp = (tf.translation - unreal.Vector(t['p'][0], -t['p'][1], t['p'][2])).length()
            dq = helpers.rotation_error(tf.rotation, unreal.Quat(t['q'][0], -t['q'][1], t['q'][2], t['q'][3]))
            report['upper_lower_combinations'].append({'s': s, 'bone': b, 'position_error_cm': dp, 'rotation_error_deg': dq})
    # 现有上眼皮约 0.34 mm / 0.394° 的历史残差不由本任务改变。
    assert max(r['position_error_cm'] for r in report['upper_lower_combinations']) < 0.04
    assert max(r['rotation_error_deg'] for r in report['upper_lower_combinations']) < 0.5

    helpers.solve(inst, h, {})
    report['return_neutral_max_position_cm'] = max((h.get_global_transform(helpers.key(b)).translation-t.translation).length() for b, t in neutral.items())
    assert report['return_neutral_max_position_cm'] < 1e-6
    report['nodes'] = len(rig.get_default_model().get_nodes())
    report['controls'] = len([k for k in h.get_all_keys() if k.type == unreal.RigElementType.CONTROL])
    report['passed'] = True
    (_fm_output(_fm_tool('Docs/Evidence/XYP/validation.json'))).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('samples', 'upper_lower_combinations')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
