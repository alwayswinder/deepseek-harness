"""验证、保存、包重载、再次验证；恢复旧预览并选中总嘴控。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,types
from pathlib import Path
import unreal
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE=_fm_tool('Docs/Evidence/MouthControls')


def main():
    module=types.ModuleType('mouth_verify')
    exec(compile((_fm_read(_fm_tool('Scripts/verify_mouth_controls.py'))).read_text(encoding='utf-8'),'verify_mouth_controls.py','exec'),module.__dict__)
    before=module.main();rig=_fm_load_asset(module.helpers.ASSET)
    build=json.loads((_fm_read(EVIDENCE/'build_report.json')).read_text(encoding='utf-8'))
    links=module.helpers.base.helper.exec_links(rig.get_default_model())
    assert sorted(links)==sorted(tuple(x) for x in build['old_execution_links'])
    adjacent={a.split('.')[0]:b.split('.')[0] for a,b in links}
    starts=set(adjacent)-set(adjacent.values());assert len(starts)==1
    cursor=starts.pop();assert cursor in (_fm_node('Begin'),'BeginExecution');visited=[]
    while cursor in adjacent:
        assert cursor not in visited;visited.append(cursor);cursor=adjacent[cursor]
    visited.append(cursor);assert len(visited)==len(links)+1
    assert _fm_save_asset(rig,False)
    sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    sub.close_all_editors_for_asset(rig)
    result=unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
    assert result[0],str(result)
    rig=_fm_load_asset(module.helpers.ASSET)
    after=module.main()
    assert before['nodes']==after['nodes'] and before['controls']==after['controls']
    assert sorted(module.helpers.base.helper.exec_links(rig.get_default_model()))==sorted(links)
    build.update(saved=True,new_controls=['CTRL_MOUTH_L','CTRL_MOUTH_R','CTRL_MOUTH'])
    (_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(build,ensure_ascii=False,indent=2),encoding='utf-8')
    sub.open_editor_for_assets([rig]);live=rig.get_debugged_control_rig();restored=False
    if live:
        module.helpers.solve(live,live.get_hierarchy(),build['preview_values'])
        live.clear_control_selection();live.select_control('CTRL_MOUTH',True);restored=True
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),reload_result=str(result),status=after['status'],nodes=after['nodes'],controls=after['controls'],execution_chain=visited,validation_after_reload_passed=after['passed'],preview_restored=restored,selected_control='CTRL_MOUTH')
    (_fm_output(EVIDENCE/'reload_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':main()
