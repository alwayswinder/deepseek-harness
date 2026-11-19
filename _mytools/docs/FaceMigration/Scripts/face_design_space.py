"""Shared space conversion for reference panel drawing on head-following rigs."""
import unreal

def attach_face_control_space(editor, head_name, space_name='FACE_SPACE'):
    """Move root controls into head space, retaining values and nested parents.

    Placement is converted from reference offsets, never from an animated pose.
    The caller owns backup, compilation, regression and saving.
    """
    h = editor.get_hierarchy()
    hc = editor.get_hierarchy_controller()
    head = unreal.RigElementKey(name=head_name, type=unreal.RigElementType.BONE)
    space = unreal.RigElementKey(name=space_name, type=unreal.RigElementType.NULL)
    assert h.contains(head), head_name
    assert not h.contains(space), 'Face space already installed; verify instead of reinstalling'
    reference_head = h.get_global_transform(head, True)
    roots = []
    for control in h.get_controls():
        parent = h.get_first_parent(control)
        if parent.type == unreal.RigElementType.CONTROL:
            continue
        assert parent.type == unreal.RigElementType.BONE, 'Review existing null spaces first'
        assert len(h.get_parents(control)) == 1, 'Multiple-parent controls require explicit space migration'
        offsets = []
        for initial in (True, False):
            local = unreal.MathLibrary.make_relative_transform(
                h.get_global_control_offset_transform(control, initial),
                h.get_global_transform(parent, initial))
            reference = unreal.MathLibrary.compose_transforms(local, h.get_global_transform(parent, True))
            offsets.append(unreal.MathLibrary.make_relative_transform(reference, reference_head))
        roots.append((control, offsets))
    values = [(control, h.get_control_value(control, unreal.RigControlValueType.INITIAL),
               h.get_control_value(control), h.get_control_settings(control)) for control in h.get_controls()]
    added = hc.add_null(space_name, head, reference_head, True, False, False)
    assert h.contains(added) and str(added.name) == space_name
    for control, offsets in roots:
        assert hc.set_parent(control, added, False, False, False)
        for initial, offset in zip((True, False), offsets):
            h.set_control_offset_transform(control, offset, initial, True)
    # Explicit offsets own the placement; reparenting must not change channels.
    for control, initial, current, settings in values:
        h.set_control_value(control, initial, unreal.RigControlValueType.INITIAL)
        h.set_control_value(control, current, unreal.RigControlValueType.CURRENT)
        # SetParent sanitizes display-name punctuation as a side effect.
        assert hc.set_control_settings(control, settings, False)
    return dict(space=space_name, head=head_name, reparented=[str(c.name) for c, _ in roots],
                controls=len(values))


def attach_head_relative_rails(editor,head_name):
 graph=editor.get_default_model();controller=editor.get_controller(graph)
 rails=[n for n in graph.get_nodes() if str(n.get_name()).endswith('_RAIL')]
 assert rails and all(n.find_pin('WorldOffset') for n in rails)
 assert not graph.find_node_by_name('DESIGN_HEAD_DELTA'),'Head drawing space already installed'
 def node(path,name):
  result=controller.add_unit_node_from_struct_path(path,position=unreal.Vector2D(-4000,-1000),node_name=name,setup_undo_redo=False)
  assert result
  return str(result.get_name())
 def default(pin,value):assert controller.set_pin_default_value(pin,str(value),True,False)
 def link(a,b):assert controller.add_link(a,b,False,create_cast_node=True)
 for initial,label in ((True,'INITIAL'),(False,'CURRENT')):
  n=node('/Script/ControlRig.RigUnit_GetTransform','DESIGN_HEAD_'+label)
  default(n+'.Item.Type','Bone');default(n+'.Item.Name',head_name);default(n+'.Space','GlobalSpace');default(n+'.bInitial','True' if initial else 'False')
 inv=node('/Script/RigVM.RigVMFunction_MathTransformInverse','DESIGN_HEAD_INV_INITIAL');link('DESIGN_HEAD_INITIAL.Transform',inv+'.Value')
 delta=node('/Script/RigVM.RigVMFunction_MathTransformMul','DESIGN_HEAD_DELTA');link(inv+'.Result',delta+'.A');link('DESIGN_HEAD_CURRENT.Transform',delta+'.B')
 for rail in rails:link(delta+'.Result',str(rail.get_name())+'.WorldOffset')
 return len(rails)
