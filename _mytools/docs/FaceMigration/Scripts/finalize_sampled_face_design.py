"""Save/reload an adapted sampled rig only after this job's current checks pass."""
import json,runpy
import unreal
from face_paths import runtime_path,read_path,output_path,tool_path
root=runtime_path('Evidence')
before=json.loads(read_path(root/'before_reload_validation.json').read_text())
layout=json.loads(read_path(root/'layout_validation.json').read_text())
assert before['passed'] and layout['passed']
plan=json.loads(read_path(root/'design_plan.json').read_text())
target=unreal.load_asset(plan['target']);assert target
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
sub.close_all_editors_for_asset(target)
assert unreal.EditorAssetLibrary.save_loaded_asset(target,False)
result=unreal.EditorLoadingAndSavingUtils.reload_packages([target.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
assert result[0],str(result)
output_path(runtime_path('Temp/verify_phase.txt')).write_text('after_reload')
runpy.run_path(str(tool_path('Scripts/verify_sampled_face_design.py')),run_name='__main__')
after=json.loads(read_path(root/'after_reload_validation.json').read_text());assert after['passed']
target=unreal.load_asset(plan['target']);sub.open_editor_for_assets([target])
report={'target':plan['target'],'saved':True,'reloaded':True,'passed':True,'target_editor_open':True,'after_reload_max_position_mm':after['max_position_mm'],'after_reload_max_rotation_degrees':after['max_rotation_degrees'],'reference_unchanged':after['reference_unchanged']}
output_path(root/'reload_report.json').write_text(json.dumps(report,indent=2))
adaptation=json.loads(read_path(root/'adaptation_report.json').read_text());adaptation['saved']=True
output_path(root/'adaptation_report.json').write_text(json.dumps(adaptation,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report))
