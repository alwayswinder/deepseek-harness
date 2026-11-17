import unreal
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
for a in actors:
    if a.get_actor_label() == "CR_Seven_MorphSliders":
        print("actor:", a.get_class().get_name(), a.get_actor_location())
        for c in a.get_components_by_class(unreal.ActorComponent):
            print("  comp", c.get_name(), c.get_class().get_name())
        for c in a.get_components_by_class(unreal.ControlRigComponent):
            print("  CR comp:", c.get_name(), "rigClass=", c.get_editor_property("control_rig_class"))
