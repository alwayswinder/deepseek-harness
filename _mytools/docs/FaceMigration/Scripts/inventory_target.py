"""备份目标资产、盘点示例契约、独立探测目标绑定，并给出适配路线。

只读示例；目标先保存到磁盘再复制，保证磁盘与内存一致。输出：
`reference_inventory.json`、`binding_probe.json`、`adaptation_report.json`（均可重复运行覆盖）。
示例与目标来自 `Characters/<角色>/face-controls.json` 的 reference / target 段，经 asset_overrides 映射。
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, read_path as _fm_read, output_path as _fm_output,
                        asset_path as _fm_asset, asset_disk_path as _fm_disk,
                        load_asset as _fm_load_asset, save_asset as _fm_save_asset,
                        runtime_path as _fm_runtime)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime
import hashlib
import json
import shutil
from pathlib import Path
import unreal

from face_paths import PACKAGE_ROOT, context

E = _fm_output(_fm_tool('Docs/Evidence'))
E.mkdir(parents=True, exist_ok=True)
CATALOG = json.loads((PACKAGE_ROOT / 'Characters' / context().character / 'face-controls.json').read_text(encoding='utf-8'))
SOURCE = _fm_asset(CATALOG['reference']['control_rig'])
TARGET = _fm_asset(CATALOG['target']['control_rig'])
assert SOURCE != TARGET, '源和目标不能相同；检查任务配置与角色表'

EMPTY_NODE_LIMIT = 1
DRIFT_LIMIT_CM = 0.001


def hierarchy_of(asset):
    return asset.hierarchy if isinstance(asset, unreal.ControlRigRuntimeAsset) else asset.get_hierarchy()


def model_of(asset):
    editor = asset.get_editor_asset() if isinstance(asset, unreal.ControlRigRuntimeAsset) else asset
    return editor.get_default_model()


def settings_row(hierarchy, key):
    settings = hierarchy.get_control_settings(key)
    parent = hierarchy.get_first_parent(key)

    def safe(fn):
        try:
            return fn()
        except Exception as exc:
            return 'ERR:' + str(exc)

    return {
        'name': str(key.name),
        'display_name': str(settings.display_name),
        'animation_type': str(settings.animation_type),
        'control_type': str(settings.control_type),
        'parent': [str(parent.name), str(parent.type)],
        'shape_name': safe(lambda: str(settings.shape_name)),
        'shape_color': safe(lambda: [round(v, 6) for v in settings.shape_color.to_tuple()]),
        'shape_transform': safe(lambda: str(hierarchy.get_global_control_shape_transform(key, True))),
        'shape_visible': safe(lambda: bool(settings.shape_visible)),
        'draw_limits': safe(lambda: bool(settings.draw_limits)),
        'offset': safe(lambda: str(hierarchy.get_global_control_offset_transform(key, True))),
        'initial': safe(lambda: str(hierarchy.get_control_value(key, unreal.RigControlValueType.INITIAL))),
        'limits': safe(lambda: {'min': hierarchy.get_vector_from_control_value(settings.minimum_value).to_tuple(),
                                'max': hierarchy.get_vector_from_control_value(settings.maximum_value).to_tuple(),
                                'enabled': [[bool(settings.limit_enabled[i].minimum), bool(settings.limit_enabled[i].maximum)]
                                            for i in range(3)]}),
        'primary_axis': safe(lambda: str(settings.primary_axis)),
        'group_with_parent': safe(lambda: bool(settings.group_with_parent_control)),
        'transient': safe(lambda: bool(settings.is_transient_control)),
    }


def bone_transforms(hierarchy):
    out = {}
    for bone in hierarchy.get_bones():
        value = hierarchy.get_global_transform(bone, True)
        # 判定使用引擎原始精度；六位舍入会把约 6e-8 的四元数差放大到 1e-6。
        out[str(bone.name)] = {'pos': list(value.translation.to_tuple()),
                               'rot': list(value.rotation.to_tuple()),
                               'scale': list(value.scale3d.to_tuple())}
    return out


def summarize(asset, path, with_detail):
    hierarchy = hierarchy_of(asset)
    model = model_of(asset)
    rows = [settings_row(hierarchy, k) for k in hierarchy.get_controls()]
    try:
        preview = asset.get_editor_property('preview_skeletal_mesh') if isinstance(asset, unreal.ControlRigRuntimeAsset) \
            else asset.get_preview_mesh()
    except Exception as exc:
        preview = 'ERR:' + str(exc)
    return {'path': path, 'class': asset.get_class().get_name(), 'preview_mesh': str(preview),
            'bones': len(hierarchy.get_bones()), 'curves': len(hierarchy.get_curves()),
            'curve_names': [str(c.name) for c in hierarchy.get_curves()],
            'controls': len(hierarchy.get_controls()), 'nodes': len(model.get_nodes()),
            'links': len(model.get_links()),
            'shape_libraries': [lib.get_path_name() for lib in asset.get_editor_property('shape_libraries')],
            'controls_detail': rows if with_detail else []}, hierarchy


def main():
    source = _fm_load_asset(SOURCE)
    target = _fm_load_asset(TARGET)
    assert source and target, (SOURCE, TARGET)
    reference, source_hierarchy = summarize(source, SOURCE, True)
    target_before, target_hierarchy = summarize(target, TARGET, True)

    backup_dir = _fm_runtime('Backups') / ('Target_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    backup_dir.mkdir(parents=True, exist_ok=False)
    content = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())) / 'Content'
    target_disk = content / (TARGET.removeprefix('/Game/') + '.uasset')
    source_disk = content / (SOURCE.removeprefix('/Game/') + '.uasset')
    shutil.copy2(target_disk, backup_dir / 'disk_before.uasset')
    assert _fm_save_asset(target, False), '目标保存失败'
    shutil.copy2(target_disk, backup_dir / 'memory_before.uasset')
    reference['disk_sha256'] = hashlib.sha256(_fm_read(source_disk).read_bytes()).hexdigest()
    target_before['disk_sha256'] = hashlib.sha256(_fm_read(target_disk).read_bytes()).hexdigest()

    mesh = target.get_editor_property('preview_skeletal_mesh')
    morphs = [str(m) for m in mesh.get_all_morph_target_names()] if mesh else []
    mesh_morphs = len(morphs)
    source_bones = bone_transforms(source_hierarchy)
    target_bones = bone_transforms(target_hierarchy)
    drift = max(((max(abs(a - b) for a, b in zip(source_bones[n]['pos'], target_bones[n]['pos'])), n)
                 for n in source_bones if n in target_bones), default=(0.0, ''))
    # Binding equivalence is independent of the presence of authored controls.
    # An empty runtime shell is expected to have none of the reference controls.
    common = set(source_bones) & set(target_bones)
    rotation_drift = max((min(
        max(abs(a-b) for a,b in zip(source_bones[n]['rot'], target_bones[n]['rot'])),
        max(abs(a+b) for a,b in zip(source_bones[n]['rot'], target_bones[n]['rot'])))
        for n in common), default=0.0)
    scale_drift = max((max(abs(a-b) for a,b in zip(source_bones[n]['scale'], target_bones[n]['scale']))
                       for n in common), default=0.0)
    reference_mesh = source.get_preview_mesh()
    binding = {
        'bone_names_equal': [str(b.name) for b in source_hierarchy.get_bones()] == [str(b.name) for b in target_hierarchy.get_bones()],
        'bone_count_reference': reference['bones'], 'bone_count_target': target_before['bones'],
        'max_bone_position_drift_cm': round(float(drift[0]), 8), 'max_bone_position_drift_bone': drift[1],
        'mesh': str(mesh), 'mesh_morphs': mesh_morphs,
        'same_preview_mesh': mesh == reference_mesh,
        'max_bone_rotation_quaternion_drift': rotation_drift,
        'max_bone_scale_drift': scale_drift,
        'reference_curves_not_in_mesh': sorted(set(reference['curve_names']) - set(morphs)),
        'curves_only_in_reference': sorted(set(reference['curve_names']) - set(target_before['curve_names'])),
        'curves_only_in_target': sorted(set(target_before['curve_names']) - set(reference['curve_names'])),
        'target_has_solver': not (target_before['controls'] == 0 and target_before['nodes'] <= EMPTY_NODE_LIMIT),
        'target_controls': target_before['controls'], 'target_nodes': target_before['nodes'],
        'reference_controls_not_in_target': sorted({r['name'] for r in reference['controls_detail']} -
                                                   {r['name'] for r in target_before['controls_detail']}),
    }
    equivalent = (binding['bone_names_equal'] and binding['bone_count_reference'] == binding['bone_count_target']
                  and binding['max_bone_position_drift_cm'] < DRIFT_LIMIT_CM
                  and binding['same_preview_mesh']
                  and rotation_drift < 1e-6 and scale_drift < 1e-6
                  and not binding['reference_curves_not_in_mesh']
                  )
    if not equivalent:
        route = 'rebind_and_refit'
    elif not binding['target_has_solver']:
        route = 'derive_from_reference_equivalence_check'
    else:
        route = 'incremental_repair_existing_target'
    binding['verdict'] = 'equivalent' if equivalent else 'needs_rebinding'

    inventory = {
        'captured_at': datetime.datetime.now().astimezone().isoformat(),
        'engine': unreal.SystemLibrary.get_engine_version(),
        'character': context().character, 'job_id': context().job_id,
        'reference': reference, 'target_before': target_before, 'backup': str(backup_dir),
        'binding_check': binding,
    }
    (E / 'reference_inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
    (E / 'binding_probe.json').write_text(json.dumps({
        'captured_at': inventory['captured_at'], 'reference': {'path': SOURCE, 'bones': reference['bones'],
                                                               'controls': reference['controls'],
                                                               'curves': reference['curve_names']},
        'target': {'path': TARGET, 'bones': target_before['bones'], 'controls': target_before['controls'],
                   'curves': target_before['curve_names']},
        'verdict_inputs': binding,
        'bone_pair_sample': {n: {'reference': source_bones[n], 'target': target_bones[n]}
                             for n in list(source_bones)[:3]},
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    bindings = CATALOG['bindings']
    reference_controls = {r['name'] for r in reference['controls_detail']}
    groups = {}
    for row in bindings:
        groups.setdefault(row['group'], []).append(row['role_id'])
    adaptation = {
        'captured_at': inventory['captured_at'], 'character': CATALOG['character'],
        'reference': {k: reference[k] for k in ('path', 'class', 'controls', 'nodes', 'links')},
        'target': {k: target_before[k] for k in ('path', 'class', 'controls', 'nodes', 'curves')},
        'max_source': CATALOG.get('source', {}),
        'binding_probe': binding, 'route': route,
        'route_reason': {
            'rebind_and_refit': '骨架、参考姿势或 Morph 集与示例不一致，按主流程第 3 节逐项重新绑定和定参',
            'derive_from_reference_equivalence_check': '目标骨架/网格/Morph 与示例一致且尚无求解，继承示例控制设计与求解，只需重新核验 Max 动作',
            'incremental_repair_existing_target': '目标已有内容，先比较差异再增量修复；不得执行空目标构建器',
        }[route],
        'mapping': {'bindings': len(bindings), 'groups': groups,
                    'missing_in_reference': [b['ue_control'] for b in bindings if b['ue_control'] not in reference_controls],
                    'disabled': [b['role_id'] for b in bindings if not b.get('enabled', True)],
                    'reference_controls_not_in_table': sorted(reference_controls - {b['ue_control'] for b in bindings})},
        'curve_sets': {'reference': reference['curve_names'], 'target_before': target_before['curve_names'],
                       'curves_dropped_by_build': binding['curves_only_in_target']},
        'per_group': [{'group': g, 'roles': len(r), 'action': 'inherit_reference_design' if equivalent else 'rebind',
                       'refit': not equivalent} for g, r in groups.items()],
    }
    (E / 'adaptation_report.json').write_text(json.dumps(adaptation, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'route': route, 'verdict': binding['verdict'],
                      'reference': {'controls': reference['controls'], 'nodes': reference['nodes']},
                      'target': {'controls': target_before['controls'], 'nodes': target_before['nodes'],
                                 'curves': target_before['curves']},
                      'bone_drift_cm': binding['max_bone_position_drift_cm'],
                      'backup': str(backup_dir), 'evidence': str(E)}, ensure_ascii=False))


main()
