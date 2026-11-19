"""验证并保存鼻子控制，重载包后复核并恢复旧预览姿势。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/Nose')


def main():
    module=types.ModuleType('nose_verify')
    exec(compile((_fm_read(_fm_tool('Scripts/verify_nose_controls.py'))).read_text(encoding='utf-8'),'verify_nose_controls.py','exec'),module.__dict__)
    before=module.main()
    rig=_fm_load_asset(module.helpers.ASSET)
    live=rig.get_debugged_control_rig()
    values={}
    if live:
        h=live.get_hierarchy()
        for k in h.get_all_keys():
            if k.type==unreal.RigElementType.CONTROL:
                v=h.get_vector_from_control_value(h.get_control_value(k))
                values[str(k.name)]=[v.x,v.y,v.z]
    model=rig.get_default_model()
    links=module.helpers.base.helper.exec_links(model)
    build_path=EVIDENCE/'build_report.json'
    build=json.loads(_fm_read(build_path).read_text(encoding='utf-8'))
    assert all(tuple(l) in links for l in build['old_execution_links'])
    adjacent={a.split('.')[0]:b.split('.')[0] for a,b in links}
    assert len(adjacent)==len(links)
    starts=set(adjacent)-set(adjacent.values())
    assert len(starts)==1,starts
    cursor=starts.pop()
    assert cursor in (_fm_node('Begin'),'BeginExecution')
    visited=[]
    while cursor in adjacent:
        assert cursor not in visited
        visited.append(cursor)
        cursor=adjacent[cursor]
    visited.append(cursor)
    assert len(visited)==len(links)+1 and 'NOSE_SET_bijian' in visited
    assert _fm_save_asset(rig,False)
    subsystem=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    subsystem.close_all_editors_for_asset(rig)
    result=unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
    assert result[0],str(result)
    rig=_fm_load_asset(module.helpers.ASSET)
    after=module.main()
    assert after['nodes']==before['nodes'] and after['controls']==before['controls']
    assert sorted(module.helpers.base.helper.exec_links(rig.get_default_model()))==sorted(links)
    build.update(nodes_after=after['nodes'],controls_after=after['controls'],new_controls=['CTRL_NOSE'],
                 original_execution_links_preserved=True,added_setters=1,saved=True)
    _fm_output(build_path).write_text(json.dumps(build,ensure_ascii=False,indent=2),encoding='utf-8')
    subsystem.open_editor_for_assets([rig])
    live=rig.get_debugged_control_rig()
    restored=False
    if live:
        module.helpers.solve(live,live.get_hierarchy(),values)
        live.clear_control_selection()
        live.select_control('CTRL_NOSE',True)
        restored=True
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=module.helpers.ASSET,
                reload_result=str(result),nodes=after['nodes'],controls=after['controls'],execution_chain=visited,
                validation_after_reload_passed=after['passed'],status=after['status'],preview_restored=restored,
                selected_control='CTRL_NOSE',max_position_error_cm=after['max_position_error_cm'],
                max_rotation_error_deg=after['max_rotation_error_deg'])
    (_fm_output(EVIDENCE/'reload_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
