"""按 TASK.md 第 1~3 节核对（或草拟）角色绑定表与采样脚本名单。

只读 TASK.md、`Characters/<角色>/face-controls.json`、任务配置和 `Scripts/*.ms`；
在 UE 内运行时额外读取目标骨架，用来把脚本里的字符串字面量分成“控制器名 / 骨骼名”。
输出 `Current/Evidence/task_sheet_check.json`。表缺失时只写草稿，不改包内文件。
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, project_root as _fm_project,
                        read_path as _fm_read, output_path as _fm_output,
                        asset_path as _fm_asset, load_asset as _fm_load_asset)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import re
from pathlib import Path
import unreal

from face_paths import PACKAGE_ROOT, context

TASK = PACKAGE_ROOT / 'TASK.md'
SCRIPTS = PACKAGE_ROOT / 'Scripts'
E = _fm_output(_fm_tool('Docs/Evidence'))
E.mkdir(parents=True, exist_ok=True)

# 采样脚本里除了 getNodeByName 还会用这些数组变量名列出控制器。
NAME_LISTS = ('names', 'TARGETS', 'targets', 'CTRLS', 'ctrls', 'CONTROLS', 'controls')

# TASK.md 不预填资产路径；括号占位（如「（对话中指定）」）表示该值由用户在开始任务的对话里给出。
PLACEHOLDER = re.compile(r'^[（(][^）)]*[）)]$')


def specified(value):
    """字段的可用值；空值或括号占位视为「对话中给出」，返回 None。"""
    value = (value or '').strip()
    return None if not value or PLACEHOLDER.match(value) else value


def parse_section(text, start, end):
    return text[text.index(start):text.index(end)]


def parse_task():
    text = TASK.read_text(encoding='utf-8')
    lines = parse_section(text, '## 1.', '## 2.').splitlines()
    fields = {}
    for line in lines:
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 2 and cells[0] not in ('字段', '---') and not set(cells[0]) <= set('-: '):
            fields[cells[0]] = cells[1].strip('`')
    rows = []
    for line in parse_section(text, '## 2.', '## 3.').splitlines():
        if not re.match(r'^\|\s*\d+\s*\|', line):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append({'role_id': cells[1], 'label': cells[2], 'ue_control': cells[3].strip('`'),
                     'max_name': cells[4].strip('`'), 'group': cells[5]})
    optional = {}
    for line in parse_section(text, '## 3.', '## 4.').splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 2 and cells[0] not in ('字段', '---') and not set(cells[0]) <= set('-: '):
            optional[cells[0]] = cells[1]
    return fields, rows, optional


def scan_scripts(control_names, bone_names):
    """Return every string literal the sampling scripts use, split by known controls/bones."""
    controls = set(control_names)
    bones = set(bone_names)
    per_file = {}
    unknown = {}
    for path in sorted(SCRIPTS.glob('*.ms')):
        content = path.read_text(encoding='utf-8-sig', errors='replace')
        found = set(re.findall(r'getNodeByName\s+"([^"]+)"', content))
        for name in NAME_LISTS:
            for block in re.findall(rf'(?:local\s+)?{name}\s*=\s*#\(([^)]*)\)', content):
                found.update(re.findall(r'"([^"]+)"', block))
        if not found:
            continue
        per_file[path.name] = sorted(found)
        extra = sorted(found - controls - bones)
        if extra:
            unknown[path.name] = extra
    used = set().union(*per_file.values()) if per_file else set()
    return {
        'scripts_scanned': len(per_file),
        'control_names_used': sorted(used & controls),
        'control_names_not_used': sorted(controls - used),
        'bone_names_in_scripts': sorted(used & bones),
        'literals_outside_sheet_and_skeleton': unknown,
    }


def skeleton_names():
    """Target skeleton bones (UE) so script literals can be classified; never fails the run."""
    try:
        catalog = json.loads((PACKAGE_ROOT / 'Characters' / context().character / 'face-controls.json')
                             .read_text(encoding='utf-8'))
        rig = _fm_load_asset(catalog['target']['control_rig'])
        hierarchy = rig.hierarchy if isinstance(rig, unreal.ControlRigRuntimeAsset) else rig.get_hierarchy()
        return [str(b.name) for b in hierarchy.get_bones()] if rig else []
    except Exception as exc:
        return ['ERR:' + str(exc)[:120]]


def main():
    fields, rows, optional = parse_task()
    character = context().character
    table_path = PACKAGE_ROOT / 'Characters' / character / 'face-controls.json'
    problems = []
    warnings = []
    character_field = fields.get('角色名')
    reference_field = specified(fields.get('示例 ControlRig'))
    target_field = specified(fields.get('目标 ControlRig'))
    catalog = json.loads(table_path.read_text(encoding='utf-8')) if table_path.is_file() else None
    reference = reference_field or (catalog or {}).get('reference', {}).get('control_rig')
    target = target_field or (catalog or {}).get('target', {}).get('control_rig')
    reference = reference or context().asset_overrides.get('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
    target = target or context().asset_overrides.get('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')
    report = {
        'task_sheet': {'character': character_field, 'reference': fields.get('示例 ControlRig'),
                       'target': fields.get('目标 ControlRig'), 'mesh': fields.get('目标网格'),
                       'max_scene': fields.get('Max 场景'), 'sample_frame': fields.get('采样帧'),
                       'control_rig_source': 'task_sheet' if reference_field and target_field else 'conversation',
                       'rows': len(rows), 'optional_fields': optional},
        'job': {'job_id': context().job_id, 'character': character,
                'asset_overrides': context().asset_overrides},
    }
    if not character_field:
        problems.append({'field': '角色名', 'problem': 'TASK.md 未填写'})
    if character_field and character_field != character:
        problems.append({'field': '角色名', 'task': character_field, 'job': character})
    report['resolved_assets'] = {'reference': reference, 'target': target}
    for label, value, legacy in (
            ('示例 ControlRig', reference, '/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'),
            ('目标 ControlRig', target, '/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')):
        if not value or not value.startswith('/Game/'):
            problems.append({'field': label, 'problem': '角色表或 job 缺少有效资产包路径'})
        elif _fm_asset(legacy) != _fm_asset(value):
            problems.append({'field': label, 'problem': '共用脚本路径映射与角色表不一致',
                             'table': value, 'script': _fm_asset(legacy)})
    if reference and target and _fm_asset(reference) == _fm_asset(target):
        problems.append({'problem': '示例与目标不能相同'})
    if target:
        mapped = _fm_asset(target)
        report['target_mapped'] = mapped
        if mapped == target and target not in context().asset_overrides:
            warnings.append({'field': '目标 ControlRig',
                             'problem': 'job 的 asset_overrides 未显式写出该目标（走脚本默认路径）', 'target': target})
        try:
            exists = unreal.load_asset(mapped) is not None
        except Exception:
            exists = None
        report['target_exists'] = exists
        if exists is False:
            problems.append({'field': '目标 ControlRig', 'problem': '映射后的资产加载不到', 'path': mapped})

    if catalog is not None:
        bindings = catalog['bindings']
        by_role = {b['role_id']: b for b in bindings}
        for row in rows:
            ref = by_role.get(row['role_id'])
            if ref is None:
                problems.append({'role_id': row['role_id'], 'problem': '表里缺少该功能'})
                continue
            for field in ('max_name', 'ue_control', 'label'):
                value = row['max_name'] if field == 'max_name' else row[field]
                if ref.get(field) != value:
                    problems.append({'role_id': row['role_id'], 'field': field, 'task': value, 'table': ref.get(field)})
        for role in sorted(set(by_role) - {r['role_id'] for r in rows}):
            problems.append({'role_id': role, 'problem': '表里有、任务单里没有'})
        if reference_field and catalog.get('reference', {}).get('control_rig') != reference_field:
            problems.append({'field': '示例 ControlRig', 'task': reference_field,
                             'table': catalog.get('reference', {}).get('control_rig')})
        if target_field and catalog.get('target', {}).get('control_rig') != target_field:
            problems.append({'field': '目标 ControlRig', 'task': target_field,
                             'table': catalog.get('target', {}).get('control_rig')})
        if catalog.get('source', {}).get('max_scene') != fields.get('Max 场景'):
            problems.append({'field': 'Max 场景', 'task': fields.get('Max 场景'),
                             'table': catalog.get('source', {}).get('max_scene')})
        duplicates = sorted({r['max_name'] for r in rows if [x['max_name'] for x in rows].count(r['max_name']) > 1})
        disabled = [b['role_id'] for b in bindings if not b.get('enabled', True)]
        report['binding_table'] = {'path': str(table_path.relative_to(PACKAGE_ROOT)), 'rows': len(bindings),
                                   'duplicate_max_names': duplicates, 'disabled': disabled}
        if duplicates:
            problems.append({'problem': '任务单里 Max 控制器名重复', 'names': duplicates})
    else:
        draft = {'schema_version': 1, 'character': character,
                 'source': {'max_scene': fields.get('Max 场景'), 'sample_frame': int(fields.get('采样帧') or 0),
                            'units': 'discover_from_scene'},
                 'target': {'skeletal_mesh': fields.get('目标网格'), 'control_rig': target,
                            'base_control_rig': reference},
                 'reference': {'character': character, 'control_rig': reference,
                               'implementation_reuse_allowed': True, 'reuse_numeric_parameters': False},
                 'bindings': [{'role_id': r['role_id'], 'group': r['group'], 'label': r['label'],
                               'side': 'L' if '_L' in r['role_id'] else ('R' if '_R' in r['role_id'] else 'C'),
                               'ue_control': r['ue_control'], 'max_name': r['max_name'],
                               'enabled': r['max_name'] != '-'} for r in rows]}
        draft_path = E / 'face-controls.draft.json'
        draft_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
        report['draft'] = {'path': str(draft_path),
                           'promote': f'copy "{draft_path}" to "Characters/{character}/face-controls.json" 后重跑本脚本'}
        problems.append({'problem': 'Characters/<角色>/face-controls.json 不存在，已写草稿', 'draft': str(draft_path)})

    control_names = [r['max_name'] for r in rows if r['max_name'] and r['max_name'] != '-']
    bones = skeleton_names()
    report['skeleton'] = {'bones': len(bones) if not any(b.startswith('ERR:') for b in bones) else bones}
    report['scripts'] = scan_scripts(control_names, [b for b in bones if not b.startswith('ERR:')])
    report['problems'] = problems
    report['warnings'] = warnings
    report['passed'] = not problems
    out = E / 'task_sheet_check.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'rows': len(rows), 'problems': len(problems),
                      'warnings': len(warnings),
                      'scripts_scanned': report['scripts']['scripts_scanned'],
                      'controls_used': len(report['scripts']['control_names_used']),
                      'controls_not_used': len(report['scripts']['control_names_not_used']),
                      'bones_matched': len(report['scripts']['bone_names_in_scripts']),
                      'unknown_literals': len(report['scripts']['literals_outside_sheet_and_skeleton']),
                      'report': str(out)}, ensure_ascii=False, indent=1))


main()
