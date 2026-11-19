"""Inspect the Seven character after the version migration (defensive)."""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

eal = unreal.EditorAssetLibrary


def show(label, fn):
    try:
        unreal.log("SEVINFO %s = %s" % (label, fn()))
    except Exception as e:  # noqa: BLE001
        unreal.log("SEVINFO %s : unavailable (%s)" % (label, e))


mesh = eal.load_asset(_fm_asset('/Game/SevGame/Art/Player/Seven/Mesh/Seven'))
skel = eal.load_asset(_fm_asset('/Game/SevGame/Art/Player/Seven/Mesh/Seven_Skeleton'))
unreal.log("SEVINFO mesh=%s" % mesh)
unreal.log("SEVINFO skel=%s" % skel)

if mesh:
    show("skeleton", lambda: mesh.get_editor_property("skeleton"))
    show("physics_asset", lambda: mesh.get_editor_property("physics_asset"))
    show("morph_targets", lambda: [str(m.get_name()) for m in mesh.get_editor_property("morph_targets")][:8])
    show("morph_count", lambda: len(mesh.get_editor_property("morph_targets")))
    show("materials", lambda: [(str(m.get_editor_property("material_slot_name")),
                                str(m.get_editor_property("material_interface")))
                               for m in mesh.get_editor_property("materials")])
    show("lod_count", lambda: len(mesh.get_editor_property("lod_info")))
    for prop in ("anim_class", "post_process_anim_blueprint"):
        show(prop, lambda p=prop: mesh.get_editor_property(p))

if skel:
    show("skel_bones", lambda: len(skel.get_editor_property("bone_tree")))

hair = eal.load_asset(_fm_asset('/Game/SevGame/Art/Player/Seven/Mesh/Seven_Hair_AnimBlueprint'))
unreal.log("SEVINFO hair_animbp=%s class=%s" % (hair, hair.get_class().get_name() if hair else None))
unreal.log("SEVINFO DONE")
