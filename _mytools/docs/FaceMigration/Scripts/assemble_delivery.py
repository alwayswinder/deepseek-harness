"""把本轮固定报告汇总成 validation.json 与 delivery_check.json。

离线入口：`python Tools/FaceMigration/migrate.py run assemble_delivery.py --job <任务> --offline`。
只读同一任务 `Current/Evidence/` 下已生成的报告，不连接 UE、不改资产；缺哪一段就写 `skipped` 与原因，
不沿用别的任务或历史批次的通过状态。
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
import face_paths

E = face_paths.runtime_path('Evidence')
E.mkdir(parents=True, exist_ok=True)


def load(name, required=False):
    path = E / name
    if not path.is_file():
        if required:
            raise FileNotFoundError(f'缺少报告 {name}；先运行对应步骤')
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def segment(name, passed, detail, skipped=False, reason=''):
    item = {'name': name, 'passed': None if skipped else bool(passed), 'detail': detail}
    if skipped:
        item['skipped'] = True
        item['reason'] = reason
    return item


def main():
    sheet = load('task_sheet_check.json')
    inventory = load('reference_inventory.json')
    adaptation = load('adaptation_report.json')
    summary = load('SevenRuntime/before_reload/summary.json')
    transfer = load('SevenRuntime/before_reload/transfer_validation.json')
    layout = load('layout_validation.json') or load('SevenRuntime/layout_validation.json')
    reload_report = load('reload_report.json') or load('SevenRuntime/reload_report.json')
    preview = load('SevenRuntime/preview_morph_check.json')
    pie_preview = load('pie_preview_check.json')
    final = load('final_state.json')
    animated_before = load('SevenRuntime/before_reload/animated_space_validation.json')
    animated_after = load('SevenRuntime/after_reload/animated_space_validation.json')
    asset_layout = load('asset_layout_after_reload.json')
    crosschecks = {}
    ignored = []
    for path in sorted(E.glob('max_crosscheck_*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        if 'config' not in data or 'pairs' not in data:
            ignored.append(path.name)
            continue
        crosschecks[path.stem.replace('max_crosscheck_', '')] = data
    if not crosschecks:
        raise FileNotFoundError('没有可用的 max_crosscheck_*.json；先运行 crosscheck_max_control.py')

    segments = []
    segments.append(segment('asset_layout', asset_layout and asset_layout.get('passed'),
                            asset_layout or {}, skipped=not asset_layout,
                            reason='缺少保存重载后的角色目录与依赖引用检查'))
    segments.append(segment('task_sheet', sheet and sheet['passed'],
                            {'rows': sheet['task_sheet']['rows'] if sheet else 0,
                             'problems': len(sheet['problems']) if sheet else None,
                             'warnings': len(sheet.get('warnings', [])) if sheet else 0}) if sheet
                    else segment('task_sheet', False, {}, skipped=True, reason='未运行 check_character_task_sheet.py'))
    if final and inventory:
        expected = inventory['reference']
        expected_animation_controls = expected['animation_controls']
        segments.append(segment('structure',
                                final['animation_controls'] == expected_animation_controls
                                and final['controls'] == expected['controls']
                                and final['bones'] == expected['bones'] and final['curves'] == expected['curves'],
                                {k: final[k] for k in ('controls', 'animation_controls', 'visual_cues', 'bones',
                                                       'curves', 'nodes', 'links')}))
    else:
        segments.append(segment('structure', False, {}, skipped=True,
                                reason='没有 final_state.json；先运行 finalize_runtime_face_controls.py'))
    if adaptation:
        segments.append(segment('binding_probe', adaptation['binding_probe']['verdict'] in ('equivalent', 'head_frame_rebind'),
                                {'verdict': adaptation['binding_probe']['verdict'], 'route': adaptation['route'],
                                 'bone_drift_cm': adaptation['binding_probe']['max_bone_position_drift_cm'],
                                 'curves_dropped_by_build': adaptation['curve_sets']['curves_dropped_by_build']}))
    else:
        segments.append(segment('binding_probe', False, {}, skipped=True, reason='未运行 inventory_target.py'))
    segments.append(segment('reference_to_target', transfer and transfer['passed'] and
                            transfer['worst']['position_cm'] == 0,
                            {'cases': transfer['cases'], 'worst': transfer['worst'], 'bones': transfer['bones'],
                             'curves': transfer['curves'], 'nodes': transfer['nodes'],
                             'links': transfer['links']} if transfer else {},
                            skipped=not transfer, reason='未运行 verify_runtime_face_controls.py'))
    segments.append(segment('display_contract', layout and layout['passed'],
                            {'differences': len(layout['display_differences']) if layout else None,
                             'rails': layout['rail_nodes_target'] if layout else None,
                             'unresolved_shapes': layout.get('shape_names_unresolved') if layout else None},
                            skipped=not layout, reason='未运行 verify_runtime_face_controls.py'))
    for name, data in crosschecks.items():
        segments.append(segment(f'max_to_target:{name}', data.get('passed'),
                                {'control': data['config']['control'], 'primary': data.get('primary_bone'),
                                 'secondary': data.get('secondary_differences'),
                                 'restore': data.get('source_restore'), 'scope': data.get('scope')},
                                skipped=bool(data.get('skipped')), reason=data.get('reason', '')))
    reload_worst = ((reload_report or {}).get('transfer_after_reload')
                    or ((reload_report or {}).get('validation_after_reload') or {}).get('worst'))
    segments.append(segment('save_reload', reload_report and reload_report['passed'],
                            {'reloaded': reload_report['reloaded'],
                             'worst_after_reload': reload_worst,
                             'reload_phase_passed': ((reload_report.get('validation_after_reload') or {}).get('passed')),
                             'source_disk_unchanged': reload_report['source_disk_unchanged'],
                             'source_sha_basis': reload_report.get('source_sha_basis')} if reload_report else {},
                            skipped=not reload_report,
                            reason='未运行 finalize_runtime_face_controls.py'))
    segments.append(segment('normal_frame_preview', bool(preview and preview.get('passed')),
                            {'rig_absolute_time': preview.get('rig_absolute_time') if preview else None,
                             'half_error': preview.get('half_error') if preview else None,
                             'stall_diagnosis': preview.get('stall_diagnosis') if preview else None},
                            skipped=not preview, reason='未运行 probe_runtime_face_morph_preview.py'))
    if pie_preview:
        segments.append(segment('normal_frame_preview_pie', pie_preview.get('passed'),
                                {'host': pie_preview.get('host'), 'controls_set': pie_preview.get('controls_set'),
                                 'mesh_curves_equal_rig': pie_preview.get('mesh_curves_equal_rig'),
                                 'rig_clock_advancing': pie_preview.get('rig_clock_advancing'),
                             'head_space_cases': pie_preview.get('head_space_cases'),
                             'head_space_normal_frame_passed': pie_preview.get('head_space_normal_frame_passed'),
                             'animation_sequence_host_tested': pie_preview.get('animation_sequence_host_tested'),
                                 'result': pie_preview.get('result')}))
    else:
        segments.append(segment('normal_frame_preview_pie', False, {}, skipped=True,
                                reason='没有 PIE 预览证据；资产编辑器预览不 tick 时用关卡网格 + AnimBlueprint + PIE 另验'))
    if summary:
        status = summary.get('legacy_status', 'not_applicable')
        segments.append(segment('legacy_part_verifiers', status == 'applicable' and summary['passed'],
                                {'passed': summary['source_verifiers_passed'],
                                 'total': summary['source_verifiers_total'], 'status': status,
                                 'reason': summary.get('legacy_reason', '')},
                                skipped=status != 'applicable',
                                reason=summary.get('legacy_reason', '旧控回归基线不属于本谱系')))
    else:
        segments.append(segment('legacy_part_verifiers', False, {}, skipped=True, reason='未运行 verify_runtime_face_controls.py'))

    for name, field in (('animated_head_space', 'animated_head_space_passed'),
                         ('control_head_follow', 'control_head_follow_passed')):
        segments.append(segment(name,
            bool(animated_before and animated_after and animated_before.get(field) and animated_after.get(field)),
            {'before_reload_cases': (animated_before or {}).get('cases'),
             'after_reload_cases': (animated_after or {}).get('cases'),
             'animation': (animated_after or {}).get('animation'),
             'worst': (animated_after or {}).get('worst'),
             'variable_metadata_differences': (animated_after or {}).get('variable_metadata_differences'),
             'scope': 'independent instances; normal-frame animated host and Sequencer are separate'}))
    numeric_names = ('asset_layout', 'task_sheet', 'structure', 'binding_probe', 'reference_to_target', 'display_contract',
                     'save_reload', 'animated_head_space', 'control_head_follow')
    numeric = [s for s in segments if s['name'] in numeric_names or s['name'].startswith('max_to_target:')]
    validation = {
        'captured_at': (final or {}).get('captured_at') or (adaptation or {}).get('captured_at'),
        'job_id': face_paths.context().job_id,
        'character': face_paths.context().character,
        'target': (inventory or {}).get('target_before', {}).get('path'),
        'segments': segments,
        'passed_segments': [s['name'] for s in segments if s['passed'] is True],
        'failed_segments': [s['name'] for s in segments if s['passed'] is False],
        'skipped_segments': [s['name'] for s in segments if s.get('skipped')],
        'numeric_passed': all(s['passed'] is True for s in numeric),
        'preview_passed': bool(preview and preview.get('passed')),
        'preview_pie_passed': bool(pie_preview and pie_preview.get('passed')),
        'notes': ['数值/结构/显示/重载通过不等于画面验收通过',
                  '资产编辑器预览世界与 PIE 宿主分开记录；前者不 tick 时用后者取证',
                  '被跳过的段写原因，不伪造同谱系基线，也不把跳过算作通过'],
        'ignored_crosscheck_files': ignored,
    }
    (E / 'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding='utf-8')

    delivery = {
        'captured_at': validation['captured_at'],
        'job_id': validation['job_id'],
        'target': validation['target'],
        'reference': (inventory or {}).get('reference', {}).get('path'),
        'asset_layout': asset_layout,
        'migrated': ({'animation_controls': final['animation_controls'], 'visual_cues': final['visual_cues'],
                      'bones': final['bones'], 'curves': final['curves'], 'nodes': final['nodes'],
                      'links': final['links']} if final else None),
        'numeric': {'passed': validation['numeric_passed'],
                    'reference_to_target': (transfer or {}).get('worst'),
                    'max_crosscheck': {name: data.get('primary_bone') for name, data in crosschecks.items()},
                    'reload_transfer': reload_worst},
        'persistence': ({'saved': reload_report['saved'], 'reloaded': reload_report['reloaded'],
                         'source_disk_unchanged': reload_report['source_disk_unchanged']} if reload_report else {'skipped': True}),
        'preview': {'passed': validation['preview_passed'],
                    'rig_absolute_time': (preview or {}).get('rig_absolute_time'),
                    'half_error': (preview or {}).get('half_error'),
                    'reason': (preview or {}).get('stall_diagnosis'),
                    'pie': {'passed': validation['preview_pie_passed'],
                            'host': (pie_preview or {}).get('host'),
                            'mesh_curves_equal_rig': (pie_preview or {}).get('mesh_curves_equal_rig')}},
        'appearance_operation': {'display_contract_passed': bool(layout and layout['passed']),
                                 'shape_actor_count': (final or {}).get('shape_actor_count'),
                                 'visual_acceptance': (layout or {}).get('visual_acceptance', 'pending_user')},
        'skipped': {s['name']: s.get('reason') for s in segments if s.get('skipped')},
        'overall_passed': bool(validation['numeric_passed'] and
                               (validation['preview_passed'] or validation['preview_pie_passed']) and
                               (layout or {}).get('visual_acceptance') == 'passed' and
                               (pie_preview or {}).get('animation_sequence_host_tested') and
                               (pie_preview or {}).get('sequencer_tested')),
        'animation_sequence_host_tested': bool((pie_preview or {}).get('animation_sequence_host_tested')),
        'sequencer_tested': bool((pie_preview or {}).get('sequencer_tested')),
        'variable_metadata_differences': (animated_after or {}).get('variable_metadata_differences', []),
        'conclusion': ('technical_checks_passed_pending_acceptance' if validation['numeric_passed'] and (validation['preview_passed'] or validation['preview_pie_passed'])
                       else 'not_overall_passed'),
        'conclusion_reason': ('numeric/display/reload passed and a ticking PIE host confirmed the mesh curves; '
                              + ('asset-editor preview was not requested in this job; ' if preview is None else
                                 'the asset-editor preview check did not pass; ')
                              + 'user visual acceptance is still pending'
                              if validation['preview_pie_passed'] and not validation['preview_passed'] else
                              'numeric/display/reload and normal-frame preview both required for an overall pass'),
    }
    (E / 'delivery_check.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'segments': [(s['name'], s['passed']) for s in segments],
                      'numeric_passed': validation['numeric_passed'],
                      'preview_passed': validation['preview_passed'],
                      'conclusion': delivery['conclusion']}, ensure_ascii=False, indent=1))


main()
