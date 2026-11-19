"""从 Max 临时采样拟合六个唇控的全局平移增量；在普通 Python 运行。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import math
from pathlib import Path

ROOT = _fm_project()
OUT = _fm_tool('Docs/Evidence/LipControls')


def main():
    raw = (_fm_read(_fm_saved('lip_probe_output.txt'))).read_text(encoding='utf-8-sig')
    ref = json.loads(raw[raw.index('{'):])
    (_fm_output(OUT / 'max_samples.json')).write_text(json.dumps(ref, ensure_ascii=False, indent=2), encoding='utf-8')
    names = ['CTRL_LIP_UP_L', 'CTRL_LIP_UP_C', 'CTRL_LIP_UP_R',
             'CTRL_LIP_LOW_R', 'CTRL_LIP_LOW_C', 'CTRL_LIP_LOW_L']
    controls = []
    for name, c in zip(names, ref['controls']):
        delta = {}
        for b, rest in ref['baseline'].items():
            d = [v-r for v, r in zip(c['samples'][-1]['bones'][b]['p'], rest['p'])]
            if math.dist(d, [0, 0, 0]) > 1e-5:
                delta[b] = [d[0], -d[1], d[2]]
        p = c['rest']['p']
        controls.append(dict(control=name, source=c['source'], sign=c['sign'],
                             control_rest=[p[0], -p[1], p[2]], delta_full=delta))
    cases = [(sample, [sample['s'] if i == j else 0 for i in range(6)])
             for j, c in enumerate(ref['controls']) for sample in c['samples']]
    cases += [(s, s['s']) for s in ref['combinations']]
    residual = 0.0
    for sample, weights in cases:
        assert not sample['morph_changes'], sample['morph_changes']
        for b, rest in ref['baseline'].items():
            expected = [rest['p'][0], -rest['p'][1], rest['p'][2]]
            for c, s in zip(controls, weights):
                expected = [a+s*d for a, d in zip(expected, c['delta_full'].get(b, [0, 0, 0]))]
            got = sample['bones'][b]['p']
            residual = max(residual, math.dist(expected, [got[0], -got[1], got[2]]))
    assert residual < 0.001, residual
    params = dict(controls=controls, bones=list(ref['baseline']),
                  source_to_ue='position (x,-y,z), quaternion (x,-y,z,w)',
                  max_fit_position_error_cm=residual, sample_cases=len(cases),
                  morph_channels_checked=ref['morph_channels_checked'], morph_changes=0)
    (_fm_output(OUT / 'parameters.json')).write_text(json.dumps(params, ensure_ascii=False, indent=2), encoding='utf-8')
    print({k:v for k,v in params.items() if k not in ('controls', 'bones')})


if __name__ == '__main__':
    main()
