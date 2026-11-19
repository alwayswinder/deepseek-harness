"""保存脸颊诊断 Rig，重载包并复核全部数值与执行链。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime
import json
from pathlib import Path
import types
import unreal

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE=_fm_tool('Docs/Evidence/Cheeks')


def main():
    module=types.ModuleType('cheek_verify')
    exec(compile((_fm_read(_fm_tool('Scripts/verify_cheek_controls.py'))).read_text(encoding='utf-8'),'verify_cheek_controls.py','exec'),module.__dict__)
    before=module.main()
    asset=module.helpers.ASSET
    rig=_fm_load_asset(asset)
    model=rig.get_default_model()
    links=module.helpers.base.helper.exec_links(model)
    adjacent={a.split('.')[0]:b.split('.')[0] for a,b in links}
    assert len(adjacent)==len(links)
    starts=set(adjacent)-set(adjacent.values())
    assert len(starts)==1,starts
    cursor=starts.pop()
    assert cursor in (_fm_node('Begin'),'BeginExecution'),cursor
    visited=[]
    while cursor in adjacent:
        assert cursor not in visited
        visited.append(cursor)
        cursor=adjacent[cursor]
    visited.append(cursor)
    assert len(visited)==len(links)+1
    build_path=EVIDENCE/'build_report.json'
    build=json.loads(_fm_read(build_path).read_text(encoding='utf-8'))
    assert all(tuple(l) in links for l in build['old_execution_links'])
    setters=[str(n.get_name()) for n in model.get_nodes() if str(n.get_name()).startswith('CHEEK_SET_')]
    assert len(setters)==10 and all(n in visited for n in setters)
    assert _fm_save_asset(rig,False)
    subsystem=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    subsystem.close_all_editors_for_asset(rig)
    result=unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
    assert result[0],str(result)
    rig=_fm_load_asset(asset)
    after=module.main()
    assert after['nodes']==before['nodes'] and after['controls']==before['controls']
    assert sorted(module.helpers.base.helper.exec_links(rig.get_default_model()))==sorted(links)
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    build.update(nodes_after=after['nodes'],controls_after=after['controls'],
                 new_controls=[c['control'] for c in params['controls']],original_execution_links_preserved=True,
                 added_setters=len(setters),saved=True)
    _fm_output(build_path).write_text(json.dumps(build,ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=asset,
                reload_result=str(result),nodes=after['nodes'],controls=after['controls'],
                execution_nodes=len(visited),execution_chain=visited,status=after['status'],
                validation_after_reload_passed=after['passed'],
                max_position_delta_error_cm=after['max_position_delta_error_cm'],
                max_rotation_delta_error_deg=after['max_rotation_delta_error_deg'])
    (_fm_output(EVIDENCE/'reload_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    subsystem.open_editor_for_assets([rig])
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
