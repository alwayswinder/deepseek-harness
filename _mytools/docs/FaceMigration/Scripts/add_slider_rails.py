"""给 CR_Seven_MorphSliders 的 7 个滑块各加一条"轨道"（Box_Thin 视觉控件）。
轨道沿 +X 长 12cm，手柄停在轨道起点；拖动时沿 X 就是 0..1。
"""

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
COLORS = [(1, .65, .06), (.2, .75, 1), (1, .25, .4), (.3, 1, .65),
          (.8, .4, 1), (1, .5, .1), (.6, .85, 1)]

LENGTH = 14.0     # 轨道长度 cm
THICK = 2.2       # 轨道粗细 cm
STEP = 6.0


def log(m):
    unreal.log('[Rail] ' + str(m))


mesh = _fm_load_asset(MESH)
bp = _fm_load_asset(RIG)
h = bp.get_hierarchy()
hc = bp.get_hierarchy_controller()

lib = _fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
if not bp.get_editor_property('shape_libraries'):
    bp.set_editor_property('shape_libraries', [lib])

defs = {str(s.shape_name): s for s in lib.get_editor_property('shapes')}
rail_def = defs['Box_Solid']
b = rail_def.get_editor_property('shape_proxy').get_bounds()
ds = rail_def.get_editor_property('transform').scale3d
unit = (2 * b.box_extent.x * abs(ds.x),
        2 * b.box_extent.y * abs(ds.y),
        2 * b.box_extent.z * abs(ds.z))
log('Box_Solid unit = %.2f, %.2f, %.2f' % unit)

# 动画类型：视觉提示
anim_types = [n for n in dir(unreal.RigControlAnimationType)]
log('anim types = %s' % anim_types)
cue = None
for cand in ('VISUAL_CUE', 'VisualCue'):
    if cand in anim_types:
        cue = getattr(unreal.RigControlAnimationType, cand)
log('using anim type = %s' % cue)

# 锚点：与手柄同一套坐标
ref = unreal.new_object(unreal.RigHierarchy)
ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
head = ref.get_global_transform(
    unreal.RigElementKey(type=unreal.RigElementType.BONE, name='head'), True).translation
x, y, top = head.x - 30.0, head.y + 18.0, head.z + 12.0
log('anchor = (%.1f, %.1f, %.1f)' % (x, y, top))

board = unreal.RigElementKey(type=unreal.RigElementType.NULL, name='MorphBoard')

# 先清掉旧的轨道（可重复执行）
for m in MORPHS:
    k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='RAIL_' + m)
    try:
        hc.remove_element(k, True, True)
        log('removed old RAIL_%s' % m)
    except Exception:
        pass

for i, m in enumerate(MORPHS):
    s = unreal.RigControlSettings()
    s.control_type = unreal.RigControlType.FLOAT
    if cue is not None:
        s.animation_type = cue
    s.display_name = 'rail_' + m
    s.primary_axis = unreal.RigControlAxis.X
    s.shape_name = 'Box_Solid'
    r, g, bb = COLORS[i]
    s.shape_color = unreal.LinearColor(r * 0.55, g * 0.55, bb * 0.55, 1.0)
    c = hc.add_control('RAIL_' + m, board, s,
                       unreal.RigHierarchy.make_control_value_from_float(0.0), False)

    z = top - i * STEP
    off = unreal.Transform(location=unreal.Vector(x + LENGTH * 0.5, y, z),
                           scale=unreal.Vector(8.0, 8.0, 8.0))
    h.set_control_offset_transform(c, off, True, True)
    h.set_control_offset_transform(c, off, False, True)

    shp = unreal.Transform(scale=unreal.Vector(LENGTH / (unit[0] * 8.0), THICK / (unit[1] * 8.0), THICK / (unit[2] * 8.0)))
    h.set_control_shape_transform(c, shp, True)
    h.set_control_shape_transform(c, shp, False)
    log('RAIL_%s ok' % m)

bp.recompile_vm()
_fm_save_asset(bp, False)
log('saved, status=%s' % bp.get_editor_property('status'))
