"""下巴整体：保存重载、复验执行链与数值，恢复预览并选中控制。"""

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

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/Chin')

def main(preview_values=None):
    v=types.ModuleType('chin_verify');exec(compile((_fm_read(_fm_tool('Scripts/verify_chin_control.py'))).read_text(encoding='utf-8'),'verify_chin_control','exec'),v.__dict__)
    rig=_fm_load_asset(v.b.ASSET);build=json.loads((_fm_read(E/'build_report.json')).read_text(encoding='utf-8'))
    before=json.loads((_fm_read(E/'validation.json')).read_text(encoding='utf-8'));assert before['passed']
    helper=v.b.base.base.helper
    preview=v.b.base.preview_values(rig) if preview_values is None else preview_values
    # 第一次编译后预览实例可能尚未更新；保留构建前已经记录的输入。
    if not preview:preview=build['preview_values']
    links=helper.exec_links(rig.get_default_model())
    assert sorted(links)==sorted(tuple(x) for x in build['expected_execution_links'])
    adj={a.split('.')[0]:b.split('.')[0] for a,b in links};assert len(adj)==len(links)
    starts=set(adj)-set(adj.values());assert len(starts)==1
    cursor=starts.pop();assert cursor in (_fm_node('Begin'),'BeginExecution');visited=[]
    while cursor in adj:
        assert cursor not in visited;visited.append(cursor);cursor=adj[cursor]
    visited.append(cursor);assert len(visited)==len(links)+1
    assert _fm_save_asset(rig,False)
    sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem);sub.close_all_editors_for_asset(rig)
    result=unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE);assert result[0],str(result)
    rig=_fm_load_asset(v.b.ASSET);after=v.main()
    assert (before['nodes'],before['controls'])==(after['nodes'],after['controls'])
    assert sorted(helper.exec_links(rig.get_default_model()))==sorted(links)
    build['saved']=True;(_fm_output(E/'build_report.json')).write_text(json.dumps(build,ensure_ascii=False,indent=2),encoding='utf-8')
    sub.open_editor_for_assets([rig]);live=rig.get_debugged_control_rig();assert live,'Preview rig unavailable'
    lh=live.get_hierarchy();v.b.solve(live,lh,preview);preview_error=0
    for n,value in preview.items():
        ck=v.b.key(n,unreal.RigElementType.CONTROL);got=lh.get_vector_from_control_value(lh.get_control_value(ck));preview_error=max(preview_error,(got-unreal.Vector(*value)).length())
    assert preview_error<1e-5
    live.clear_control_selection();live.select_control('CTRL_CHIN',True)
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=v.b.ASSET,reload_result=str(result),nodes=after['nodes'],controls=after['controls'],status=str(rig.get_editor_property('status')),execution_chain=visited,validation_after_reload_passed=after['passed'],preview_restored=True,preview_values=preview,preview_input_error=preview_error,selected_control='CTRL_CHIN')
    (_fm_output(E/'reload_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:val for k,val in report.items() if k not in ('execution_chain','preview_values')},ensure_ascii=False))

if __name__=='__main__':main()
