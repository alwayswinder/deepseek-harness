
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal
rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'))
ctrl = rig.get_controller(rig.get_default_model())

for n in ("RigUnit_GetControlVector2D", "RigVMFunction_MathVector2DGetX", "RigVMFunction_MathVector2DToVector",
          "RigVMFunction_MathVector2DAdd", "RigVMFunction_MathVector2DMake", "RigUnit_SetTranslation",
          "RigVMFunction_MathVectorMake"):
    print(("HAS " if getattr(unreal, n, None) else "NO  ") + n)

for n in ("RigUnit_GetControlVector2D",):
    cls = getattr(unreal, n, None)
    if cls:
        node = ctrl.add_unit_node_from_struct_path(cls.static_struct().get_path_name(), "Execute",
                                                   unreal.Vector2D(0, 3000), "ZZ_probe", False)
        print(n, [ (p.get_name() if hasattr(p, "get_name") else str(p)) for p in node.get_pins() ])
        ctrl.remove_node(node, False)

lib = _fm_load_asset("/ControlRig/Controls/DefaultGizmoLibraryNormalized")
shapes = {str(s.shape_name): s for s in lib.get_editor_property("shapes")}
for nm in ("Sphere_Solid", "Circle_Thick", "Box_Solid"):
    if nm in shapes:
        d = shapes[nm]
        b = d.get_editor_property("shape_proxy").get_bounds()
        ds = d.get_editor_property("transform").scale3d
        unit = 2 * max(b.box_extent.x*abs(ds.x), b.box_extent.y*abs(ds.y), b.box_extent.z*abs(ds.z))
        print(nm, "unit_diameter=", round(unit, 3))
print("SHAPES:", sorted(shapes)[:60])
