"""仅对指定新资产保存、包重载，并重复完整验证。

保存前的门禁按段判断（迁移对照 + 显示契约必需；旧控回归仅在基线同谱系时才算必过），
保存后写 `reload_report.json` 与 `final_state.json`（结构、持久化证据、输入恢复）。
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
import types
import unreal
from face_paths import rig_dependency_folder

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
E=_fm_tool('Docs/Evidence/SevenRuntime')
EB=_fm_tool('Docs/Evidence')
TARGET=_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')
before=json.loads((_fm_read(E/'before_reload/summary.json')).read_text(encoding='utf-8'))
assert before.get('passed'), {'phase':'before_reload','transfer':before.get('transfer_passed'),
                              'display':before.get('display_passed'),'legacy_status':before.get('legacy_status'),
                              'legacy_reason':before.get('legacy_reason')}
target=unreal.load_asset(TARGET)
hierarchy=target.hierarchy
preview={str(k.name):list(hierarchy.get_vector_from_control_value(hierarchy.get_control_value(k)).to_tuple()) for k in hierarchy.get_controls()}
assert _fm_save_asset(target,False)
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
sub.close_all_editors_for_asset(target)
panel_assets=[unreal.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(rig_dependency_folder(TARGET),True,False)]
assert all(a and unreal.EditorAssetLibrary.save_loaded_asset(a,False) for a in panel_assets)
reload_result=unreal.EditorLoadingAndSavingUtils.reload_packages(
    [a.get_outer() for a in panel_assets]+[target.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
assert reload_result[0],str(reload_result)
target=unreal.load_asset(TARGET)
verify=types.ModuleType('runtime_verify')
exec(compile((_fm_read(_fm_tool('Scripts/verify_runtime_face_controls.py'))).read_text(encoding='utf-8'),'runtime_verify','exec'),verify.__dict__)
after=verify.main('after_reload')
assert after['passed'],after
try:
    build=json.loads((_fm_read(E/'build_report.json')).read_text(encoding='utf-8'))
    expected_sha=build['source_disk_sha256'];sha_source='build_report';has_build=True
except FileNotFoundError:
    # 增量路线（目标已有内容）不会产生 build_report；用本轮盘点时的示例摘要作对照。
    try:
        inventory=json.loads((_fm_read(EB/'reference_inventory.json')).read_text(encoding='utf-8'))
    except FileNotFoundError:
        raise FileNotFoundError('本任务既没有 build_report.json 也没有 reference_inventory.json；先运行 inventory_target.py')
    expected_sha=inventory['reference']['disk_sha256'];sha_source='reference_inventory';has_build=False
source_disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
assert hashlib.sha256(_fm_read(source_disk).read_bytes()).hexdigest()==expected_sha,('示例包在运行期间被改动',sha_source)
dependency_hashes=build.get('panel_dependencies',{}).get('source_disk_sha256',{}) if has_build else {}
for package,expected in dependency_hashes.items():
    disk=_fm_disk('Content/'+package[len('/Game/'):]+'.uasset')
    assert hashlib.sha256(_fm_read(disk).read_bytes()).hexdigest()==expected,('示例依赖在运行期间被改动',package)
sub.open_editor_for_assets([target])
if has_build:
    build['saved']=True
    (_fm_output(E/'build_report.json')).write_text(json.dumps(build,ensure_ascii=False,indent=2),encoding='utf-8')
report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),target=TARGET,passed=True,
            saved=True,reloaded=True,reload_result=str(reload_result),validation_after_reload=after,
            source_disk_unchanged=True,source_sha_basis=sha_source,target_editor_open=True,
            source_dependencies_unchanged=True,source_dependency_packages=list(dependency_hashes),
            panel_dependencies_reloaded=True,
            panel_dependency_count=len(panel_assets),
            authored_inputs_before_reload=preview,
            legacy_verifier_policy=('applicable' if before.get('legacy_status')=='applicable'
                                    else 'not replayed: '+str(before.get('legacy_reason'))))
for target_path in (_fm_output(EB/'reload_report.json'),_fm_output(E/'reload_report.json')):
    target_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

hierarchy=target.hierarchy
mesh=target.get_editor_property('preview_skeletal_mesh')
target_disk=_fm_disk('Content/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset.uasset')
dirty=None
try:
    packages=unreal.EditorLoadingAndSavingUtils.get_dirty_content_packages()
    dirty=any(p.get_path_name()==target.get_outer().get_path_name() for p in packages)
    dirty_count=len(packages)
except Exception as exc:
    dirty='ERR:'+str(exc)[:120];dirty_count=None
inputs_delta=max((hierarchy.get_vector_from_control_value(hierarchy.get_control_value(k))-
                  hierarchy.get_vector_from_control_value(hierarchy.get_control_value(k,unreal.RigControlValueType.INITIAL))).length()
                 for k in hierarchy.get_controls())
state=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),target=TARGET,
           target_class=target.get_class().get_name(),controls=len(hierarchy.get_controls()),
           animation_controls=sum(1 for k in hierarchy.get_controls() if hierarchy.get_control_settings(k).animation_type!=unreal.RigControlAnimationType.VISUAL_CUE),
           visual_cues=sum(1 for k in hierarchy.get_controls() if hierarchy.get_control_settings(k).animation_type==unreal.RigControlAnimationType.VISUAL_CUE),
           bones=len(hierarchy.get_bones()),curves=len(hierarchy.get_curves()),
           curve_names=[str(c.name) for c in hierarchy.get_curves()],
           nodes=len(target.get_editor_asset().get_default_model().get_nodes()),
           links=len(target.get_editor_asset().get_default_model().get_links()),
           preview_mesh=str(mesh),
           target_disk_mtime=datetime.datetime.fromtimestamp(target_disk.stat().st_mtime).astimezone().isoformat(),
           target_disk_sha256=hashlib.sha256(target_disk.read_bytes()).hexdigest(),
           reference_disk_sha256=hashlib.sha256(_fm_read(source_disk).read_bytes()).hexdigest(),
           dirty_target_package=dirty,dirty_package_count=dirty_count,
           shape_actor_count=sum(1 for a in unreal.ObjectIterator(unreal.Actor) if 'Shape' in a.get_class().get_name()),
           max_control_input_delta_vs_initial=inputs_delta,
           control_inputs_restored=inputs_delta<1e-6)
(_fm_output(EB/'final_state.json')).write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='authored_inputs_before_reload'},ensure_ascii=False))
print(json.dumps({k:state[k] for k in ('controls','animation_controls','visual_cues','bones','curves','nodes','links',
                                       'dirty_target_package','dirty_package_count','shape_actor_count',
                                       'control_inputs_restored')},ensure_ascii=False))
