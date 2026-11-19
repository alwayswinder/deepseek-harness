"""在运行中的 UE 执行：只读资产，在独立临时实例求解，写同目录复核快照。

项目根目录运行：python Scripts/ue_run.py Docs/Evidence/recheck_control_rig.py
不编译、不保存资产，不修改编辑器预览实例；Max 对照使用归档数据。
"""
import datetime
import json
import math
from pathlib import Path

import unreal

ROOT = Path(unreal.Paths.project_dir()) / 'Docs' / 'Evidence'
ASSET = '/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'
rig = unreal.load_asset(ASSET)
assert rig is not None
model = rig.get_default_model()
controller = rig.get_controller(model)
source = rig.get_hierarchy()
keys = source.get_all_keys()
nodes = [str(n.get_name()) for n in model.get_nodes()]
prefixes = ('BROW_', 'BPT_', 'BB_', 'BBL_', 'EYE_', 'LID_')
report = {
    'captured_at': datetime.datetime.now().astimezone().isoformat(),
    'asset': ASSET,
    'scope': 'In-memory editor asset; isolated instance. No save/reload or visual validation.',
    'status': str(rig.get_editor_property('status')),
    'bones': sum(k.type == unreal.RigElementType.BONE for k in keys),
    'controls': sum(k.type == unreal.RigElementType.CONTROL for k in keys),
    'nodes': len(nodes),
    'prefix_counts': {p: sum(n.startswith(p) for n in nodes) for p in prefixes},
    'break_link_doc': str(controller.break_link.__doc__),
    'break_all_links_doc': str(controller.break_all_links.__doc__),
}
edges = []
for link in model.get_links():
    if 'Execute' in str(link.get_target_pin().get_name()):
        edges.append([str(link.get_source_node().get_name()), str(link.get_target_node().get_name())])
reached = {'Begin'}
for _ in nodes:
    previous = len(reached)
    reached.update(b for a, b in edges if a in reached)
    if len(reached) == previous:
        break
sets = [n for n in nodes if n.startswith(('BROW_SET_', 'EYE_SET_'))]
report['execution'] = {'edges': edges, 'set_count': len(sets), 'unreachable_sets': [n for n in sets if n not in reached]}
report['lid_parameters'] = {
    b: {p: controller.get_pin_default_value('LID_' + p + '_' + b + suffix)
        for p, suffix in [('SQUAT', '.Axis'), ('SANG', '.B')]}
    for b in ('Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038')
}

def key(name, kind=unreal.RigElementType.BONE):
    return unreal.RigElementKey(type=kind, name=name)

inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()
if not rh.get_all_keys():
    rh.copy_hierarchy(source)
    inst.request_init()
controls = [k for k in keys if k.type == unreal.RigElementType.CONTROL]
assert all(rh.contains(k) for k in keys)
report['instance_keys'] = len(rh.get_all_keys())

def sample(values):
    for k in controls:
        rh.set_control_value(k, rh.make_control_value_from_vector(unreal.Vector(0, 0, 0)))
    for name, v in values.items():
        rh.set_control_value(key(name, unreal.RigElementType.CONTROL), rh.make_control_value_from_vector(unreal.Vector(*v)))
    assert inst.execute('Forwards Solve')

sample({})
brow_bones = ['meibu_L', 'Bone007', 'Bone008', 'Bone009', 'meibu_R', 'Bone010', 'Bone011', 'Bone012']
baseline = {b: rh.get_global_transform(key(b)).translation for b in brow_bones}
report['brow_samples'] = []
for side in ('L', 'R'):
    for axis in range(3):
        for value in (-10, 10):
            v = [0, 0, 0]
            v[axis] = value
            sample({'CTRL_BROW_' + side: v})
            error = 0.0
            for b in brow_bones:
                actual = rh.get_global_transform(key(b)).translation - baseline[b]
                expected = [0, 0, 0]
                if (b in brow_bones[:4]) == (side == 'L') and axis != 1:
                    expected[axis] = value * 0.5
                error = max(error, (actual - unreal.Vector(*expected)).length())
            report['brow_samples'].append({'side': side, 'input': v, 'max_position_error_cm': error})

max_samples = json.loads((ROOT / 'SYP_R001/lid_max_samples.json').read_text(encoding='utf-8'))['samples']
report['lid_samples'] = []
for i in range(9):
    sample({n: (0, 0, -10 * i / 8) for n in ('CTRL_EYE_LID_R', 'CTRL_EYE_LID_L')})
    for r in (r for r in max_samples if r['sample'] == i):
        tf = rh.get_global_transform(key(r['bone']))
        q = tf.rotation
        actual_q = [q.x, q.y, q.z, q.w]
        expected_q = [r['q'][0], -r['q'][1], r['q'][2], r['q'][3]]
        dot = abs(sum(a*b for a, b in zip(actual_q, expected_q)))
        dot /= math.sqrt(sum(a*a for a in actual_q) * sum(b*b for b in expected_q))
        report['lid_samples'].append({
            's': i/8, 'bone': r['bone'],
            'position_error_cm': math.dist([tf.translation.x, tf.translation.y, tf.translation.z], [r['p'][0], -r['p'][1], r['p'][2]]),
            'rotation_error_deg': math.degrees(2 * math.acos(min(1, max(0, dot))))})
report['max_brow_position_error_cm'] = max(r['max_position_error_cm'] for r in report['brow_samples'])
report['max_lid_position_error_cm'] = max(r['position_error_cm'] for r in report['lid_samples'])
report['max_lid_rotation_error_deg'] = max(r['rotation_error_deg'] for r in report['lid_samples'])
path = ROOT / 'control_rig_recheck_2026-11-06.json'
path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k not in ('brow_samples', 'lid_samples', 'execution')}, ensure_ascii=False))
print('Unreachable SetTransform nodes:', report['execution']['unreachable_sets'])
