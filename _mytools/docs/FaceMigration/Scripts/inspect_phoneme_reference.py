
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json,unreal
tex=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/口型单列竖排12个_去背景_1'))
assert tex
print('TEXTURE',tex.get_path_name(),tex.blueprint_get_size_x(),tex.blueprint_get_size_y())
try:print('SOURCES',tex.get_editor_property('asset_import_data').extract_filenames())
except Exception as exc:print(str(exc))
lib=_fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
print('LIB',lib.get_class().get_name(),[n for n in dir(unreal) if 'ShapeLibrary' in n])
print('PLANE',_fm_load_asset('/Engine/BasicShapes/Plane').get_bounding_box())
print('LIB_MATERIAL',lib.get_editor_property('default_material').get_path_name())
