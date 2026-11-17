"""把 Seven 完整面部图迁入用户指定的新式资产，保留目标路径和类型。

只允许空目标；已有输出不会被重复覆盖。源 Blueprint 仅读取。
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
import hashlib
import json
from pathlib import Path
import shutil
import unreal
from slider_handle_layout import apply_slider_layout, RAIL_CONTROL, OWNER_TAG
from face_paths import rig_dependency_folder, context

ROOT = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
SOURCE = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
TARGET = _fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')
E = _fm_tool('Docs/Evidence/SevenRuntime')

def digest(path):
    return hashlib.sha256(_fm_read(path).read_bytes()).hexdigest()


def migrate_panel_dependencies(source, target, backup):
    """复制示例面板并显式重绑定库、网格、材质和贴图；示例只读。"""
    source_folder = rig_dependency_folder(SOURCE)
    folder = rig_dependency_folder(TARGET)
    assert source_folder != folder, '示例与目标依赖目录不能相同'
    source_assets = [unreal.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(source_folder, True, False)]
    source_assets = [a for a in source_assets if a and a.get_class().get_name() != 'ObjectRedirector']
    assert source_assets, '示例 ToolsPanel 为空，需要先盘点实际依赖'
    supported = {'Texture2D', 'Material', 'StaticMesh', 'ControlRigShapeLibrary'}
    assert all(a.get_class().get_name() in supported for a in source_assets), '面板包含尚未适配的依赖类型'
    assert len({a.get_name() for a in source_assets}) == len(source_assets), '依赖功能名冲突'
    owner_tag = 'FaceMigration.Delivery.Owner'
    copies, hashes = {}, {}
    # 所有拒绝覆盖检查和备份先于复制；不接受他人资产或静默覆盖。
    for asset in source_assets:
        original = asset.get_path_name().split('.')[0]
        hashes[original] = digest(_fm_disk('Content/' + original[len('/Game/'):] + '.uasset'))
        existing = unreal.load_asset(folder + '/' + asset.get_name())
        if existing:
            assert unreal.EditorAssetLibrary.get_metadata_tag(existing, owner_tag) == TARGET, '拒绝覆盖非本工具依赖'
            disk = _fm_disk('Content/' + folder[len('/Game/'):] + '/' + asset.get_name() + '.uasset')
            destination = _fm_output(backup/'panel_before'/disk.name)
            shutil.copy2(disk, destination)
    for asset in source_assets:
        original = asset.get_path_name().split('.')[0]
        destination = folder + '/' + asset.get_name()
        copied = unreal.load_asset(destination)
        if not copied:
            copied = unreal.EditorAssetLibrary.duplicate_asset(original, destination)
        assert copied, destination
        copies[original] = copied
        unreal.EditorAssetLibrary.set_metadata_tag(copied, owner_tag, TARGET)
        if unreal.EditorAssetLibrary.get_metadata_tag(asset, OWNER_TAG):
            unreal.EditorAssetLibrary.set_metadata_tag(copied, OWNER_TAG, TARGET)

    def mapped(asset):
        return copies.get(asset.get_path_name().split('.')[0], asset) if asset else None

    for copied in copies.values():
        if isinstance(copied, unreal.ControlRigShapeLibrary):
            shapes = list(copied.get_editor_property('shapes'))
            for shape in shapes:
                shape.set_editor_property('shape_proxy', mapped(shape.shape_proxy))
            # PostEditChangeProperty 会把与 default_shape 同名的数组项改为 *_1。
            # 这里只重绑定引用，保留原始形状接口名；保存重载验证真实解析。
            copied.set_editor_property('shapes', shapes, notify_mode=unreal.PropertyAccessChangeNotifyMode.NEVER)
            default = copied.get_editor_property('default_shape')
            default.set_editor_property('shape_proxy', mapped(default.shape_proxy))
            copied.set_editor_property('default_shape', default, notify_mode=unreal.PropertyAccessChangeNotifyMode.NEVER)
            for name in ('default_material', 'x_ray_material'):
                copied.set_editor_property(name, mapped(copied.get_editor_property(name)),
                                           notify_mode=unreal.PropertyAccessChangeNotifyMode.NEVER)
        elif isinstance(copied, unreal.StaticMesh):
            for i, slot in enumerate(copied.get_editor_property('static_materials')):
                copied.set_material(i, mapped(slot.material_interface))
        elif isinstance(copied, unreal.Material):
            for expression in unreal.MaterialEditingLibrary.get_material_expressions(copied):
                if isinstance(expression, unreal.MaterialExpressionTextureSample):
                    expression.set_editor_property('texture', mapped(expression.get_editor_property('texture')))
            unreal.MaterialEditingLibrary.recompile_material(copied)
        assert unreal.EditorAssetLibrary.save_loaded_asset(copied, False)
    target.set_editor_property('shape_libraries', [mapped(lib) for lib in source.get_editor_property('shape_libraries')])
    for original, expected in hashes.items():
        assert digest(_fm_disk('Content/' + original[len('/Game/'):] + '.uasset')) == expected, original
    return {'folder': folder, 'mapping': {p: a.get_path_name().split('.')[0] for p, a in copies.items()},
            'source_disk_sha256': hashes, 'source_dependencies_unchanged': True}

def migrate_member_variables(source, editor):
    """Import typed member storage before importing nodes that reference it."""
    rows = []
    assert not editor.get_asset_variables(), '空目标包含成员变量，需增量适配'
    for variable in source.get_member_variables():
        assert not variable.exposed_on_spawn and not variable.expose_to_cinematics, \
            '公开动画变量需要额外迁移元数据，停止而非静默丢弃'
        cpp_type = (variable.cpp_type_object.get_path_name()
                    if variable.cpp_type_object else variable.cpp_type)
        name = editor.add_member_variable(variable.name, cpp_type, variable.public,
                                          False, variable.default_value)
        assert str(name) == str(variable.name), (name, variable.name)
        copied = next(v for v in editor.get_asset_variables() if v.name == name)
        assert copied.cpp_type == variable.cpp_type
        assert copied.cpp_type_object == variable.cpp_type_object
        assert copied.default_value == variable.default_value
        assert copied.public == variable.public and copied.private == variable.private
        rows.append(dict(name=str(name), cpp_type=copied.cpp_type,
                         type_object=str(copied.cpp_type_object),
                         default_value=copied.default_value, public=copied.public,
                         private=copied.private,
                         source_expose_to_cinematics=variable.expose_to_cinematics,
                         target_expose_to_cinematics=copied.expose_to_cinematics,
                         metadata_warning=('UE RuntimeAsset adds CPF_Interp even when source exposure is false'
                                           if copied.expose_to_cinematics != variable.expose_to_cinematics else None)))
    return rows

def main():
    assert SOURCE != TARGET, '源和目标不能相同；检查任务资产映射'
    source, target = unreal.load_asset(SOURCE), unreal.load_asset(TARGET)
    assert source and target
    assert target.get_class().get_name() == 'ControlRigRuntimeAsset'
    assert TARGET.rsplit('/', 1)[-1] == 'CR_' + context().character + '_Expression'
    assert TARGET.rsplit('/', 2)[-2] == context().character + 'ECR'
    assert target.get_editor_property('preview_skeletal_mesh') == source.get_preview_mesh()
    editor = target.get_editor_asset()
    sh, th = source.get_hierarchy(), target.hierarchy
    sm, tm = source.get_default_model(), editor.get_default_model()
    assert len(th.get_controls()) == 0 and len(tm.get_nodes()) <= 1, '目标已有内容，停止覆盖'
    assert len(sh.get_bones()) == 149 and len(sh.get_curves()) == 28
    assert len({str(k.name) for k in sh.get_controls()} - {RAIL_CONTROL}) == 73
    assert not source.get_local_function_library().get_nodes(), '存在本地函数，需额外迁移'
    _fm_output(E).mkdir(parents=True, exist_ok=True)
    backup = _fm_saved('Backup') / ('SevenRuntime_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    _fm_output(backup).mkdir(parents=True)
    disk = _fm_disk('Content/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset.uasset')
    source_disk = _fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk, backup / 'disk_before.uasset')
    assert _fm_save_asset(target, False)
    shutil.copy2(disk, backup / 'memory_before.uasset')
    source_hash = digest(source_disk)
    text = source.get_controller(sm).export_nodes_to_text([n.get_fname() for n in sm.get_nodes()])
    (_fm_output(E / 'graph_export.txt')).write_text(text, encoding='utf-8')
    report = dict(captured_at=datetime.datetime.now().astimezone().isoformat(), source=SOURCE, target=TARGET,
                  engine=unreal.SystemLibrary.get_engine_version(), backup=str(backup),
                  source_disk_sha256=source_hash, graph_export_sha256=hashlib.sha256(text.encode()).hexdigest(),
                  source_nodes=len(sm.get_nodes()), source_links=len(sm.get_links()), passed=False)
    (_fm_output(E / 'build_report.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    auto = editor.get_auto_vm_recompile()
    try:
        editor.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Populate Seven facial controls in runtime asset'):
            target.modify()
            editor.modify()
            th.copy_hierarchy(sh)
            for prop in ('hierarchy_settings', 'shape_libraries', 'source_hierarchy_import', 'source_curve_import'):
                target.set_editor_property(prop, source.get_editor_property(prop))
            report['panel_dependencies'] = migrate_panel_dependencies(source, target, backup)
            editor.set_preview_mesh(source.get_preview_mesh(), True)
            report['member_variables'] = migrate_member_variables(source, editor)
            controller = editor.get_controller(tm)
            for node in list(tm.get_nodes()):
                assert controller.remove_node(node, False)
            imported = controller.import_nodes_from_text(text, False, False)
            assert len(imported) == len(sm.get_nodes()), (len(imported), len(sm.get_nodes()))
            # 新资产以作者设定的 Initial 值启动，不继承参考资产的当前预览姿势。
            th.reset_pose_to_initial(unreal.RigElementType.CONTROL)
            # 示例轨道可能穿过手柄；目标统一应用拾取间距，不改写示例资产。
            apply_slider_layout(target)
            editor.recompile_vm()
            assert len(tm.get_nodes()) == len(sm.get_nodes())
            def links(model):
                return sorted((str(l.get_source_pin().get_pin_path()), str(l.get_target_pin().get_pin_path())) for l in model.get_links())
            assert links(tm) == links(sm), '迁移后的连接与源不一致'
    finally:
        editor.set_auto_vm_recompile(auto)
    assert digest(source_disk) == source_hash
    report.update(passed=True, target_nodes=len(tm.get_nodes()), target_links=len(tm.get_links()),
                  bones=len(th.get_bones()), controls=len(th.get_controls()), curves=len(th.get_curves()),
                  source_disk_unchanged=True, saved=False)
    (_fm_output(E / 'build_report.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main()
