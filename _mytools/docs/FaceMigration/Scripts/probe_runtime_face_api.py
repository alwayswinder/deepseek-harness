"""只读检查新版资产暴露的 Python 接口。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import unreal
target=unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
source=unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))
editor=target.get_editor_asset()
print('EDITOR',editor)
print('EDITOR_METHODS', [n for n in dir(editor) if not n.startswith('_')])
for obj,names in ((editor,('get_default_model','get_controller','create_rig_vm_host','recompile_vm','get_hierarchy','get_editor_property')), (source.get_controller(),('export_nodes_to_text','import_nodes_from_text')), (unreal.ControlRigBlueprintLibrary,('create_control_rig_asset_from_blueprint',)), (unreal.ControlRig,('set_rig_vm_asset','initialize','request_init'))):
    for name in names:
        print(name, getattr(getattr(obj,name,None),'__doc__',None))
for name in ('hierarchy','preview_skeletal_mesh','shape_libraries','vm','editor_only_data'):
    try: print('TARGET_PROP',name,str(target.get_editor_property(name)))
    except Exception as exc: print('MISSING_PROP',name,str(exc))
if hasattr(editor,'get_default_model'):
    print('TARGET_NODES',len(editor.get_default_model().get_nodes()))
print('TARGET_COUNTS',len(target.hierarchy.get_bones()),len(target.hierarchy.get_controls()))
print('HOST_METHODS',[n for n in dir(unreal.ControlRig) if any(s in n for s in ('asset','init','vm'))])
