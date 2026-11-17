"""校验、保存并重载嘴唇诊断 Rig，再做相同数值对照并打开编辑器。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/LipControls')


def main():
    module=types.ModuleType('lip_verify')
    exec(compile((_fm_read(_fm_tool('Scripts/verify_lip_controls.py'))).read_text(encoding='utf-8'),'verify_lip_controls.py','exec'),module.__dict__)
    before=module.main()
    asset=module.helpers.ASSET
    rig=_fm_load_asset(asset)
    model=rig.get_default_model()
    links=module.helpers.helper.exec_links(model)
    # Check that all execution nodes form one reachable chain from BeginExecution.
    adjacent={a.split('.')[0]: b.split('.')[0] for a,b in links}
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
    assert all('LIP_SET_'+b in visited for b in json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))['bones'])
    assert _fm_save_asset(rig,False)
    subsystem=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    subsystem.close_all_editors_for_asset(rig)
    result=unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
    assert result[0],str(result)
    rig=_fm_load_asset(asset)
    after=module.main()
    assert after['nodes']==before['nodes']
    assert after['controls']==before['controls']
    assert sorted(module.helpers.helper.exec_links(rig.get_default_model()))==sorted(links)
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=asset,
                reload_result=str(result),nodes=after['nodes'],controls=after['controls'],
                execution_nodes=len(visited),execution_chain=visited,
                status=after['status'],validation_after_reload_passed=after['passed'],
                max_position_error_cm=after['max_position_error_cm'],
                max_rotation_error_deg=after['max_rotation_error_deg'])
    (_fm_output(EVIDENCE/'reload_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    subsystem.open_editor_for_assets([rig])
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
