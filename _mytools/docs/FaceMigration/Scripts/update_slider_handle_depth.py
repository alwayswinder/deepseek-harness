"""增量修复 Blueprint / RuntimeAsset 布局，备份、验证、保存重载并恢复预览。"""
import datetime
import hashlib
import json
import shutil
import unreal
from face_paths import asset_path, asset_disk_path, context, output_path, save_asset, rig_dependency_folder
from slider_handle_layout import (slider_keys, apply_slider_layout, validate_handle_depth,
                                 validate_rail_geometry, HANDLE_FORWARD_CM, RAIL_CONTROL, rail_nodes,
                                 validate_reference_depth, repair_owned_shape_names)
import verify_runtime_face_controls as verify

TARGET = asset_path(context().layout.get('target', '/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
READONLY = asset_path(context().layout.get('readonly_asset', '/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))


def editor_asset(asset):
    return asset.get_editor_asset() if isinstance(asset, unreal.ControlRigRuntimeAsset) else asset


def hierarchy_of(asset):
    return asset.hierarchy if isinstance(asset, unreal.ControlRigRuntimeAsset) else asset.get_hierarchy()


def values(h):
    return {str(k.name): list(h.get_vector_from_control_value(h.get_control_value(k)).to_tuple())
            for k in h.get_controls()}


def restore(h, saved):
    for k in h.get_controls():
        if str(k.name) not in saved:
            assert str(k.name) == RAIL_CONTROL
            continue
        h.set_control_value(k, h.make_control_value_from_vector(unreal.Vector(*saved[str(k.name)])))
    got = values(h)
    assert {name: got[name] for name in saved} == saved, '输入恢复读回不一致'


def live_hosts(asset):
    if isinstance(asset, unreal.ControlRigBlueprint):
        host = asset.get_debugged_control_rig()
        return [host] if host else []
    result = []
    for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
        if 'AnimationEditorPreviewActor' not in comp.get_path_name() or not comp.get_anim_instance():
            continue
        for host in unreal.RigVMHost.find_rig_vm_hosts(comp.get_anim_instance(), unreal.ControlRig):
            if host.get_vm().get_outer() == asset:
                result.append(host)
    return result


def graph_text(asset):
    editor = editor_asset(asset)
    model = editor.get_default_model()
    return editor.get_controller(model).export_nodes_to_text([n.get_fname() for n in model.get_nodes()])


def graph_defaults(asset):
    return {str(n.get_name()): {str(p.get_name()): p.get_default_value() for p in n.get_pins()}
            for n in editor_asset(asset).get_default_model().get_nodes()}


def main():
    target = unreal.load_asset(TARGET)
    assert isinstance(target, (unreal.ControlRigRuntimeAsset, unreal.ControlRigBlueprint)), TARGET
    assert TARGET != READONLY and TARGET.startswith('/Game/') and READONLY.startswith('/Game/')
    editor = editor_asset(target)
    hierarchy = hierarchy_of(target)
    keys = slider_keys(hierarchy, editor.get_default_model())
    assert keys, '目标没有可识别的滑轨，停止修改'
    disk = asset_disk_path('Content/' + TARGET[len('/Game/'):] + '.uasset')
    source_disk = asset_disk_path('Content/' + READONLY[len('/Game/'):] + '.uasset')
    source_hash = hashlib.sha256(source_disk.read_bytes()).hexdigest()
    target_before_hash = hashlib.sha256(disk.read_bytes()).hexdigest()
    backup = output_path(context().current/'Backups'/('SliderHandleDepth_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')))
    backup.mkdir()
    shutil.copy2(disk, backup/'disk_before.uasset')
    ui_disk = asset_disk_path('Content/' + rig_dependency_folder(TARGET)[len('/Game/'):])
    if ui_disk.is_dir():
        for dependency in ui_disk.rglob('*.uasset'):
            relative = dependency.relative_to(ui_disk)
            destination = backup/'ui_before'/relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dependency, destination)
    saved = values(hierarchy)
    hosts = live_hosts(target)
    assert len(hosts) <= 1, '存在多个目标预览，请先消除预览歧义'
    preview = values(hosts[0].get_hierarchy()) if hosts else None
    # 空壳编辑器可能仍持有构建前的零控制层级；它没有可恢复的控制输入。
    preview_uninitialized = preview == {}
    if preview_uninitialized:
        preview = None
    inputs = dict(asset=saved, preview=preview)
    (backup/'inputs.json').write_text(json.dumps(inputs, ensure_ascii=False, indent=2), encoding='utf-8')
    assert save_asset(target, False)
    shutil.copy2(disk, backup/'memory_before.uasset')
    before_graph = graph_text(target)
    (backup/'graph_before.txt').write_text(before_graph, encoding='utf-8')
    expected_defaults = graph_defaults(target)
    for node in rail_nodes(editor.get_default_model()):
        expected_defaults[str(node.get_name())]['bEnabled'] = 'False'
    offsets = {str(k.name): (hierarchy.get_global_control_offset_transform(k, True).to_tuple(),
                              hierarchy.get_global_control_offset_transform(k, False).to_tuple())
               for k in hierarchy.get_controls()}
    verify.structural_and_transfer('handle_depth_before')
    with unreal.ScopedEditorTransaction('Replace foreground slider rails with depth-tested visual geometry'):
        target.modify()
        editor.modify()
        repaired_shapes = repair_owned_shape_names(target, unreal.load_asset(READONLY))
        apply_slider_layout(target)
        editor.recompile_vm()
        if isinstance(target, unreal.ControlRigBlueprint):
            assert target.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR
    assert graph_defaults(target) == expected_defaults, '除轨道绘制开关外，图默认值发生意外变化'
    for k in hierarchy.get_controls():
        if str(k.name) not in offsets:
            assert str(k.name) == RAIL_CONTROL
            continue
        assert offsets[str(k.name)] == (hierarchy.get_global_control_offset_transform(k, True).to_tuple(),
                                       hierarchy.get_global_control_offset_transform(k, False).to_tuple())
    restore(hierarchy, saved)
    assert verify.display_contract('handle_depth_before_reload')['passed']
    assert save_asset(target, False)
    sub = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    sub.close_all_editors_for_asset(target)
    result = unreal.EditorLoadingAndSavingUtils.reload_packages([target.get_outer()], unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
    assert result[0], str(result)
    target = unreal.load_asset(TARGET)
    assert graph_defaults(target) == expected_defaults
    hierarchy = hierarchy_of(target)
    editor = editor_asset(target)
    got = values(hierarchy)
    assert {name: got[name] for name in saved} == saved
    rows = validate_handle_depth(hierarchy, slider_keys(hierarchy, editor.get_default_model()))
    rail_geometry = validate_rail_geometry(target)
    reference_depth = validate_reference_depth(hierarchy, editor.get_default_model())
    regression = verify.structural_and_transfer('handle_depth_after_reload')
    display = verify.display_contract('handle_depth_after_reload')
    assert display['passed']
    assert hashlib.sha256(source_disk.read_bytes()).hexdigest() == source_hash
    assert sub.open_editor_for_assets([target])
    current_hosts = live_hosts(target)
    if preview is not None:
        fresh = [host for host in current_hosts if host not in hosts]
        assert len(fresh) == 1, '重开后未找到唯一的新预览实例'
        restore(fresh[0].get_hierarchy(), preview)
        fresh[0].request_run_once_event('Forwards Solve')
    report = dict(captured_at=datetime.datetime.now().astimezone().isoformat(), target=TARGET,
                  passed=True, handle_count=len(keys), handle_forward_cm=HANDLE_FORWARD_CM,
                  backup=str(backup), saved=True, reloaded=True,
                  copied_shape_names_repaired=repaired_shapes,
                  graph_change='only existing rail bEnabled=False; nodes and links preserved', rail_geometry=rail_geometry,
                  phoneme_reference_depth=reference_depth,
                  control_offsets_unchanged=True, readonly_asset_unchanged=True, readonly_asset=READONLY,
                  reference_disk_unchanged=(READONLY == verify.SOURCE), reference_updated=(TARGET == verify.SOURCE),
                  target_before_disk_sha256=target_before_hash,
                  asset_inputs_restored=True, preview_inputs_restored=preview is not None,
                  preview_uninitialized_before_reopen=preview_uninitialized,
                  regression_cases=regression['cases'], regression_worst=regression['worst'],
                  sliders=rows, disk_sha256=hashlib.sha256(disk.read_bytes()).hexdigest(),
                  visual_and_picking_acceptance='pending_user')
    output_path(context().current/'Evidence/slider_handle_depth.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'sliders'}, ensure_ascii=False))


if __name__ == '__main__':
    main()

