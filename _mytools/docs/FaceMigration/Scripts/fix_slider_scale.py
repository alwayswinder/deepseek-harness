"""把 CR_Seven_MorphSliders 的滑块改小：保持面板位置/间距，只缩手柄尺寸。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

RIG = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
MORPHS = ['1_happy', '1_happy_l_es', '1_happy_r_es', '1_hellow',
          '1_hou', '1_jian', '1_jing']

WIDTH = 8.0       # 控制偏移 scale（创建时我给的是 10）
HANDLE_CM = 2.5   # 目标直径
STEP = 6.0


def log(m):
    unreal.log('[Scale] ' + str(m))


mesh = _fm_load_asset(MESH)
bp = _fm_load_asset(RIG)
h = bp.get_hierarchy()

lib = _fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
definition = next(s for s in lib.get_editor_property('shapes') if str(s.shape_name) == 'Sphere_Solid')
bounds = definition.get_editor_property('shape_proxy').get_bounds()
ds = definition.get_editor_property('transform').scale3d
unit = 2 * max(bounds.box_extent.x * abs(ds.x),
               bounds.box_extent.y * abs(ds.y),
               bounds.box_extent.z * abs(ds.z))
handle_scale = HANDLE_CM / (unit * WIDTH)
log('unit=%.3f handle_scale=%.6f' % (unit, handle_scale))

# 和创建时同一套坐标
ref = unreal.new_object(unreal.RigHierarchy)
ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
head = ref.get_global_transform(
    unreal.RigElementKey(type=unreal.RigElementType.BONE, name='head'), True).translation
x, y, top = head.x - 30.0, head.y + 18.0, head.z + 12.0
log('anchor = (%.1f, %.1f, %.1f)' % (x, y, top))

for i, m in enumerate(MORPHS):
    k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='CTRL_' + m)
    off = unreal.Transform(location=unreal.Vector(x, y, top - i * STEP),
                           scale=unreal.Vector(WIDTH, WIDTH, WIDTH))
    h.set_control_offset_transform(k, off, True, True)
    h.set_control_offset_transform(k, off, False, True)
    shp = unreal.Transform(scale=unreal.Vector(handle_scale, handle_scale, handle_scale))
    h.set_control_shape_transform(k, shp, True)
    h.set_control_shape_transform(k, shp, False)
log('7 个控件已缩放')

bp.recompile_vm()
_fm_save_asset(bp, False)
log('saved, status=%s' % bp.get_editor_property('status'))
