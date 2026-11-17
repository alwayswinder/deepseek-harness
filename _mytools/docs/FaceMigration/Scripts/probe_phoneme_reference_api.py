import unreal
print(unreal.ControlRigShapeActor.__doc__)
for obj in unreal.ObjectIterator(unreal.ControlRigShapeActor):
    comp=obj.get_component_by_class(unreal.StaticMeshComponent)
    if comp and comp.static_mesh and 'PhonemeReference' in comp.static_mesh.get_path_name():
        print('REFERENCE_ACTOR',obj.get_path_name(),obj.get_actor_transform(),obj.is_hidden_ed(),comp.get_editor_property('visible'),comp.static_mesh.get_path_name(),comp.get_material(0).get_path_name())
        print('MATERIAL',comp.get_material(0).get_base_material().get_path_name())
