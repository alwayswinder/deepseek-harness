"""新建 CR_Seven_MorphSliders：7 个 0..1 滑块 -> 7 条同名曲线 -> 驱动 Seven 的 morph。

和 CR_Seven_FaceMorphs 是两份独立资产（那份我没再动）。
脚本自己做三件事：建资产/控件/曲线、连 RigVM 图、跑一遍自检（控件->曲线数值）。
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

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
MORPHS = ['1_happy', '1_happy_l_es', '1_happy_r_es', '1_hellow',
          '1_hou', '1_jian', '1_jing']
COLORS = [(1, .65, .06), (.2, .75, 1), (1, .25, .4), (.3, 1, .65),
          (.8, .4, 1), (1, .5, .1), (.6, .85, 1)]


def log(m):
    unreal.log('[MineRig] ' + str(m))


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def fval(x):
    return unreal.RigHierarchy.make_control_value_from_float(x)


def build():
    if unreal.EditorAssetLibrary.does_asset_exist(ASSET):
        raise RuntimeError('已存在，先删掉再跑: ' + ASSET)

    mesh = _fm_load_asset(MESH)
    names = {str(m.get_name()) for m in mesh.get_editor_property('morph_targets')}
    missing = set(MORPHS) - names
    if missing:
        raise RuntimeError('mesh 上没有这些 morph: %s' % missing)

    bp = unreal.ControlRigBlueprintFactory.create_new_control_rig_asset(ASSET)
    log('created %s' % bp.get_path_name())
    bp.set_auto_vm_recompile(False)
    bp.set_preview_mesh(mesh)
    bp.set_editor_property('blueprint_description',
                           'Seven: 7 unified 0..1 morph sliders (curve only, no bone output).')

    lib = _fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
    bp.set_editor_property('shape_libraries', [lib])
    shapes = [str(s.shape_name) for s in lib.get_editor_property('shapes')]
    shape = 'Sphere_Solid' if 'Sphere_Solid' in shapes else 'Default'

    h = bp.get_hierarchy()
    hc = bp.get_hierarchy_controller()

    # 面板摆在头骨旁边
    ref = unreal.new_object(unreal.RigHierarchy)
    ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
    head = ref.get_global_transform(key('head', unreal.RigElementType.BONE), True).translation
    x, y, top = head.x - 30.0, head.y + 18.0, head.z + 12.0
    step = 4.0

    board = hc.add_null('MorphBoard', unreal.RigElementKey(), unreal.Transform())
    log('board=%s' % board.name)

    ctrl = bp.get_controller(bp.get_default_model())
    for node in list(bp.get_default_model().get_nodes()):
        ctrl.remove_node(node, False)
    begin = ctrl.add_unit_node_from_struct_path(
        '/Script/ControlRig.RigUnit_BeginExecution', 'Execute', unreal.Vector2D(0, 0), _fm_node('Begin'), False)
    prev_exec = begin.get_name() + '.ExecutePin'

    for i, morph in enumerate(MORPHS):
        cname = 'CTRL_' + morph
        s = unreal.RigControlSettings()
        s.control_type = unreal.RigControlType.FLOAT
        s.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
        s.display_name = morph
        s.primary_axis = unreal.RigControlAxis.X
        s.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
        s.minimum_value = fval(0.0)
        s.maximum_value = fval(1.0)
        s.draw_limits = False
        s.shape_name = shape
        r, g, b = COLORS[i]
        s.shape_color = unreal.LinearColor(r, g, b, 1.0)

        c = hc.add_control(cname, board, s, fval(0.0), False)
        off = unreal.Transform(location=unreal.Vector(x, y, top - i * step),
                               scale=unreal.Vector(10, 10, 10))
        h.set_control_offset_transform(c, off, True, True)
        h.set_control_offset_transform(c, off, False, True)

        hc.add_curve(morph, 0, False)

        ypos = i * 220
        getn = ctrl.add_unit_node_from_struct_path(
            '/Script/ControlRig.RigUnit_GetControlFloat', 'Execute',
            unreal.Vector2D(0, ypos), 'Get_' + morph, False)
        setn = ctrl.add_unit_node_from_struct_path(
            '/Script/ControlRig.RigUnit_SetCurveValue', 'Execute',
            unreal.Vector2D(320, ypos), 'Set_' + morph, False)
        ok = ctrl.set_pin_default_value(getn.get_name() + '.Control', cname, False, False)
        ok = ok and ctrl.set_pin_default_value(setn.get_name() + '.Curve', morph, False, False)
        if not ok:
            raise RuntimeError('pin default 设置失败: ' + morph)
        ctrl.add_link(prev_exec, setn.get_name() + '.ExecutePin', False)
        ctrl.add_link(getn.get_name() + '.FloatValue', setn.get_name() + '.Value', False)
        prev_exec = setn.get_name() + '.ExecutePin'
        log('wired %s -> curve %s' % (cname, morph))

    bp.recompile_vm()
    status = bp.get_editor_property('status')
    log('compile status = %s' % status)
    if status == unreal.BlueprintStatus.BS_ERROR:
        raise RuntimeError('rig 编译报错')

    # ---- 自检：控件 -> 曲线 ----
    inst = bp.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()
    inst.execute('Forwards Solve')

    def curve_of(m):
        return rh.get_curve_value(key(m, unreal.RigElementType.CURVE))

    report = []
    for target in MORPHS:
        for v in (0.0, 1.0):
            for m in MORPHS:
                rh.set_control_value(key('CTRL_' + m), fval(v if m == target else 0.0))
            inst.execute('Forwards Solve')
            got = {m: curve_of(m) for m in MORPHS}
            for m, val in got.items():
                want = v if m == target else 0.0
                if abs(val - want) > 1e-5:
                    raise RuntimeError('自检失败 %s=%s 期望 %s 实得 %s' % (m, target, want, val))
            report.append('%s=%s ok' % (target, v))
    log('自检通过: %s' % ', '.join(report[:4]) + ' ...')

    bp.set_auto_vm_recompile(True)
    if not _fm_save_asset(bp, False):
        raise RuntimeError('保存失败')
    log('saved %s' % ASSET)
    return bp


bp = build()

# ---- 曲线必须被标成 Morph Target，否则曲线不会驱动 morph ----
skel = _fm_load_asset(MESH).get_editor_property('Skeleton')
for m in MORPHS:
    n = unreal.Name(m)
    try:
        skel.add_curve_meta_data(n, True)
    except Exception:
        pass
    skel.set_curve_meta_data_morph_target(n, True)
_fm_save_asset(skel, False)
log('骨架曲线 morph_target: %s' % [skel.get_curve_meta_data_morph_target(unreal.Name(m)) for m in MORPHS])
log('DONE')
