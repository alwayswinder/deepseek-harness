import json
import unreal

out = []
world = unreal.EditorLevelLibrary.get_editor_world()
out.append("world=" + world.get_name())
for a in unreal.EditorLevelLibrary.get_all_level_actors():
    comps = []
    try:
        comps = a.get_components_by_class(unreal.ControlRigComponent)
    except Exception:
        pass
    if comps:
        for c in comps:
            out.append("ACTOR %s (%s) comp=%s rigClass=%s" % (a.get_actor_label(), a.get_class().get_name(), c.get_name(), c.get_editor_property("control_rig_class")))
    elif a.get_class().get_name() in ("SkeletalMeshActor", "ControlRigActor"):
        out.append("SKM %s" % a.get_actor_label())
print("\n".join(out))
