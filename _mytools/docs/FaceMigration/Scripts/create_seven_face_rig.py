"""Create Seven's seven independent 0..1 morph sliders in a new Control Rig.

Run using UE's PythonScript commandlet. Refuses to overwrite an existing asset.
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import pathlib
import traceback

import unreal

ROOT = _fm_saved('SevenFace')
_fm_output(ROOT).mkdir(parents=True, exist_ok=True)
ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_FaceMorphs')
MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
MORPHS = ['1_happy', '1_happy_l_es', '1_happy_r_es', '1_hellow',
          '1_hou', '1_jian', '1_jing']


def key(name, kind=unreal.RigElementType.CONTROL):
    return unreal.RigElementKey(type=kind, name=name)


def make_value(number):
    return unreal.RigHierarchy.make_control_value_from_float(number)


def create():
    assert not unreal.EditorAssetLibrary.does_asset_exist(ASSET), ASSET
    mesh = _fm_load_asset(MESH)
    available = {str(m.get_name()) for m in mesh.get_editor_property('morph_targets')}
    assert set(MORPHS) <= available, set(MORPHS) - available
    blueprint = unreal.ControlRigBlueprintFactory.create_new_control_rig_asset(ASSET)
    assert blueprint.get_path_name() == ASSET + '.CR_Seven_FaceMorphs'
    blueprint.set_auto_vm_recompile(False)
    blueprint.set_preview_mesh(mesh)
    blueprint.set_editor_property('blueprint_description',
        'Seven: seven independent 0..1 morph sliders. Morph curves only; no body bone output.')
    library = _fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
    assert library
    blueprint.set_editor_property('shape_libraries', [library])
    shapes = [str(s.shape_name) for s in library.get_editor_property('shapes')]
    (_fm_output(ROOT / 'shape_names.json')).write_text(json.dumps(shapes, indent=2))
    shape = next((s for s in shapes if s == 'Sphere_Solid'), 'Default')
    hierarchy = blueprint.get_hierarchy()
    hc = blueprint.get_hierarchy_controller()

    # Obtain the face position without adding bones to the facial rig's output.
    reference = unreal.new_object(unreal.RigHierarchy)
    reference.get_controller(True).import_bones_from_skeletal_mesh(
        mesh, 'None', True, True, False, False, False)
    head = reference.get_global_transform(key('head', unreal.RigElementType.BONE), True).translation
    # Seven faces +Y. Keep this XZ board alongside the face, slightly forward.
    x, y, top = head.x - 38, head.y + 16, head.z + 14
    width, spacing, handle_diameter = 14.0, 4.0, 1.2
    definition = next(s for s in library.get_editor_property('shapes') if str(s.shape_name) == shape)
    bounds = definition.get_editor_property('shape_proxy').get_bounds()
    ds = definition.get_editor_property('transform').scale3d
    unit_diameter = 2 * max(bounds.box_extent.x * abs(ds.x),
                            bounds.box_extent.y * abs(ds.y), bounds.box_extent.z * abs(ds.z))
    handle_scale = handle_diameter / (unit_diameter * width)
    parent = hc.add_null('FaceMorphBoard', unreal.RigElementKey(), unreal.Transform())
    colors = [unreal.LinearColor(1, .65, .06, 1), unreal.LinearColor(.2, .75, 1, 1),
              unreal.LinearColor(1, .25, .4, 1), unreal.LinearColor(.3, 1, .65, 1),
              unreal.LinearColor(.8, .4, 1, 1), unreal.LinearColor(1, .5, .1, 1),
              unreal.LinearColor(.6, .85, 1, 1)]
    c = blueprint.get_controller(blueprint.get_default_model())
    for node in list(blueprint.get_default_model().get_nodes()):
        c.remove_node(node, False)
    begin = c.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_BeginExecution',
        'Execute', unreal.Vector2D(0, 0), 'Forward', False)
    previous = begin.get_name() + '.ExecutePin'
    for i, morph in enumerate(MORPHS):
        name = 'CTRL_' + morph
        settings = unreal.RigControlSettings()
        settings.control_type = unreal.RigControlType.FLOAT
        settings.animation_type = unreal.RigControlAnimationType.ANIMATION_CONTROL
        settings.display_name = morph
        settings.primary_axis = unreal.RigControlAxis.X
        settings.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)]
        settings.minimum_value = make_value(0)
        settings.maximum_value = make_value(1)
        settings.draw_limits = False
        settings.shape_name = shape
        settings.shape_color = colors[i]
        control = hc.add_control(name, parent, settings, make_value(0), False)
        assert str(control.name) == name
        offset = unreal.Transform(location=unreal.Vector(x, y, top - i * spacing),
                                  scale=unreal.Vector(width, width, width))
        hierarchy.set_control_offset_transform(control, offset, True, True)
        hierarchy.set_control_offset_transform(control, offset, False, True)
        hierarchy.set_control_shape_transform(control,
            unreal.Transform(scale=unreal.Vector(handle_scale, handle_scale, handle_scale)), True)
        hierarchy.set_control_shape_transform(control,
            unreal.Transform(scale=unreal.Vector(handle_scale, handle_scale, handle_scale)), False)
        hc.add_curve(morph, 0, False)
        z = top - i * spacing
        ypos = i * 240
        get = c.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_GetControlFloat',
            'Execute', unreal.Vector2D(0, ypos + 100), 'Read_' + morph, False)
        clamp = c.add_unit_node_from_struct_path('/Script/RigVM.RigVMFunction_MathFloatClamp',
            'Execute', unreal.Vector2D(280, ypos + 100), 'Clamp_' + morph, False)
        writer = c.add_unit_node_from_struct_path('/Script/ControlRig.RigUnit_SetCurveValue',
            'Execute', unreal.Vector2D(550, ypos), 'Morph_' + morph, False)
        for pin, value in [(get.get_name()+'.Control', name),
                           (writer.get_name()+'.Curve', morph),
                           (clamp.get_name()+'.Minimum', '0'),
                           (clamp.get_name()+'.Maximum', '1')]:
            assert c.set_pin_default_value(pin, value, False, False), pin
        for src, dst in [(previous, writer.get_name()+'.ExecutePin'),
                         (get.get_name()+'.FloatValue', clamp.get_name()+'.Value'),
                         (clamp.get_name()+'.Result', writer.get_name()+'.Value')]:
            assert c.add_link(src, dst, False), (src, dst)
        previous = writer.get_name()+'.ExecutePin'
        # Draw rails through supported RigVM nodes rather than legacy DrawContainer.
        rail = c.add_unit_node_from_struct_path('/Script/RigVM.RigVMFunction_DebugLineStripNoSpace',
            'Execute', unreal.Vector2D(850, ypos), 'Rail_' + morph, False)
        pts = [(x,y,z-.55), (x,y,z+.55), (x,y,z), (x+width,y,z),
               (x+width,y,z+.55), (x+width,y,z-.55)]
        points_text = '(' + ','.join('(X=%f,Y=%f,Z=%f)' % p for p in pts) + ')'
        assert c.set_pin_default_value(rail.get_name()+'.Points', points_text, True, False)
        assert c.set_pin_default_value(rail.get_name()+'.Color',
            '(R=0.35,G=0.5,B=0.6,A=1)', False, False)
        assert c.set_pin_default_value(rail.get_name()+'.Thickness', '0.8', False, False)
        assert c.add_link(previous, rail.get_name()+'.ExecutePin', False)
        previous = rail.get_name()+'.ExecutePin'
    blueprint.recompile_vm()
    assert blueprint.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR

    # Evaluate individual and mixed poses; prove that controls do not cross-drive.
    rig = blueprint.create_control_rig()
    rig.request_init()
    rh = rig.get_hierarchy()
    rig.execute('Forwards Solve')
    tests = []
    for selected in MORPHS:
        for value in (0.0, .5, 1.0):
            for morph in MORPHS:
                rh.set_control_value(key('CTRL_' + morph), make_value(value if morph == selected else 0))
            rig.execute('Forwards Solve')
            outputs = {m: rh.get_curve_value(key(m, unreal.RigElementType.CURVE)) for m in MORPHS}
            assert all(abs(v - (value if m == selected else 0)) < 1e-6 for m,v in outputs.items()), outputs
            tests.append({'control': selected, 'input': value, 'outputs': outputs})
    mixed = {m: (i+1)/8 for i,m in enumerate(MORPHS)}
    for m,v in mixed.items(): rh.set_control_value(key('CTRL_' + m), make_value(v))
    rig.execute('Forwards Solve')
    assert all(abs(rh.get_curve_value(key(m, unreal.RigElementType.CURVE)) - v) < 1e-6 for m,v in mixed.items())
    assert not any(k.type == unreal.RigElementType.BONE for k in rh.get_all_keys())
    blueprint.set_auto_vm_recompile(True)
    assert _fm_save_asset(blueprint, False)
    return {'asset': ASSET, 'mesh': MESH, 'morphs': MORPHS, 'status':str(blueprint.get_editor_property('status')),
            'bone_count': 0, 'shape':shape, 'individual_tests':tests, 'mixed_test':mixed,
            'body_rig_modified':False}


if __name__ == '__main__':
    try:
        report = create()
        (_fm_output(ROOT / 'creation_report.json')).write_text(json.dumps(report, indent=2))
        unreal.log('CODEX_SEVEN_FACE_CREATED')
    except Exception:
        (_fm_output(ROOT / 'creation_error.txt')).write_text(traceback.format_exc())
        raise




