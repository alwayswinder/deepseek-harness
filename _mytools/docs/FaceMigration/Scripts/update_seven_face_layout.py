"""Reposition Seven's morph board and size its handles in centimeters.

In the open test project's console:
py "Tools/FaceMigration/Scripts/update_seven_face_layout.py"
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

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_FaceMorphs')
MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
MORPHS = ['1_happy', '1_happy_l_es', '1_happy_r_es', '1_hellow',
          '1_hou', '1_jian', '1_jing']
WIDTH_CM = 14.0
ROW_CM = 4.0
HANDLE_DIAMETER_CM = 1.2


def control_key(morph):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='CTRL_' + morph)


def apply_layout(save=True, sync_live=True):
    b = _fm_load_asset(ASSET)
    assert b, ASSET
    h = b.get_hierarchy()
    mesh = _fm_load_asset(MESH)
    ref = unreal.new_object(unreal.RigHierarchy)
    ref.get_controller(True).import_bones_from_skeletal_mesh(mesh, 'None', True, True, False, False, False)
    head = ref.get_global_transform(
        unreal.RigElementKey(type=unreal.RigElementType.BONE, name='head'), True).translation

    # Seven's nose and eyes face +Y. The board occupies the XZ plane,
    # to the character's side and slightly forward of the nose.
    x, y, top = head.x - 38.0, head.y + 16.0, head.z + 14.0
    library = _fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized')
    definition = next(s for s in library.get_editor_property('shapes') if str(s.shape_name) == 'Sphere_Solid')
    bounds = definition.get_editor_property('shape_proxy').get_bounds()
    ds = definition.get_editor_property('transform').scale3d
    unit_diameter = 2 * max(bounds.box_extent.x * abs(ds.x),
                            bounds.box_extent.y * abs(ds.y), bounds.box_extent.z * abs(ds.z))
    shape_scale = HANDLE_DIAMETER_CM / (unit_diameter * WIDTH_CM)

    def update_hierarchy(hierarchy):
        controller = hierarchy.get_controller(True)
        for i, morph in enumerate(MORPHS):
            k = control_key(morph)
            assert hierarchy.contains(k), str(k)
            current = hierarchy.get_control_value(k)
            settings = hierarchy.get_control_settings(k)
            settings.primary_axis = unreal.RigControlAxis.X
            assert controller.set_control_settings(k, settings, False)
            offset = unreal.Transform(location=unreal.Vector(x, y, top - i * ROW_CM),
                                      scale=unreal.Vector(WIDTH_CM, WIDTH_CM, WIDTH_CM))
            shape = unreal.Transform(scale=unreal.Vector(shape_scale, shape_scale, shape_scale))
            hierarchy.set_control_offset_transform(k, offset, True, True)
            hierarchy.set_control_offset_transform(k, offset, False, True)
            hierarchy.set_control_shape_transform(k, shape, True)
            hierarchy.set_control_shape_transform(k, shape, False)
            hierarchy.set_control_value(k, current)

    old_auto = b.get_auto_vm_recompile()
    with unreal.ScopedEditorTransaction('Resize and reposition Seven face sliders'):
        b.modify()
        b.set_auto_vm_recompile(False)
        try:
            update_hierarchy(h)
            c = b.get_controller(b.get_default_model())
            for i, morph in enumerate(MORPHS):
                z = top - i * ROW_CM
                points = [(x,y,z-.55), (x,y,z+.55), (x,y,z),
                          (x+WIDTH_CM,y,z), (x+WIDTH_CM,y,z+.55), (x+WIDTH_CM,y,z-.55)]
                text = '(' + ','.join('(X=%f,Y=%f,Z=%f)' % p for p in points) + ')'
                assert c.set_pin_default_value('Rail_'+morph+'.Points', text, True, False)
                assert c.set_pin_default_value('Rail_'+morph+'.Thickness', '0.8', False, False)
            b.recompile_vm()
            assert b.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR
        finally:
            b.set_auto_vm_recompile(old_auto)

    # Update an already active Sequencer rig as well as the blueprint preview.
    live = []
    warnings = []
    if sync_live:
        try:
            preview = b.get_debugged_control_rig()
            if preview:
                live.append(preview)
            sequence = unreal.LevelSequenceEditorBlueprintLibrary.get_current_level_sequence()
            if sequence:
                for proxy in unreal.ControlRigSequencerLibrary.get_control_rigs(sequence):
                    rig = proxy.control_rig
                    if rig and rig.get_class() == b.generated_class() and rig not in live:
                        live.append(rig)
        except Exception as e:
            warnings.append(str(e))
        for rig in live:
            update_hierarchy(rig.get_hierarchy())
        try:
            unreal.LevelSequenceEditorBlueprintLibrary.refresh_current_level_sequence()
        except Exception as e:
            warnings.append(str(e))

    rig = b.create_control_rig()
    rig.request_init()
    rh = rig.get_hierarchy()
    # Check the output and the physical positions at both slider endpoints.
    output = {}
    endpoint_error = 0.0
    for i, morph in enumerate(MORPHS):
        k = control_key(morph)
        for value in (0.0, 1.0):
            rh.set_control_value(k, rh.make_control_value_from_float(value))
            actual = rh.get_global_transform(k).translation
            expected = unreal.Vector(x + WIDTH_CM * value, y, top - i * ROW_CM)
            endpoint_error = max(endpoint_error, (actual - expected).length())
        rh.set_control_value(k, rh.make_control_value_from_float((i + 1) / 8))
    rig.execute('Forwards Solve')
    for i, morph in enumerate(MORPHS):
        output[morph] = rh.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE, name=morph))
        assert abs(output[morph] - (i + 1) / 8) < 1e-6
    assert endpoint_error < 1e-3, endpoint_error
    report = {'asset': ASSET, 'saved': False, 'board_start': [x,y,top],
              'rail_width_cm': WIDTH_CM, 'row_spacing_cm': ROW_CM,
              'handle_diameter_cm': HANDLE_DIAMETER_CM, 'local_shape_scale': shape_scale,
              'endpoint_max_error_cm': endpoint_error, 'curve_values': output,
              'updated_live_instances': len(live), 'live_refresh_notes': warnings}
    if save:
        assert _fm_save_asset(b, False)
        report['saved'] = True
    return report


if __name__ == '__main__':
    root = _fm_saved('SevenFace')
    _fm_output(root).mkdir(parents=True, exist_ok=True)
    try:
        report = apply_layout()
        (_fm_output(root / 'layout_report.json')).write_text(json.dumps(report, indent=2))
        unreal.log('CODEX_SEVEN_FACE_LAYOUT_DONE: 1.2 cm handles, face-forward board')
    except Exception:
        (_fm_output(root / 'layout_error.txt')).write_text(traceback.format_exc())
        raise
