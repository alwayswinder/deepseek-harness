import unreal, json
print("JSONSTART")
print(json.dumps({
 "subsystem": [n for n in dir(unreal.SkeletalMeshEditorSubsystem) if not n.startswith("_")],
 "editor_lib": [n for n in dir(unreal.EditorSkeletalMeshLibrary) if not n.startswith("_")],
 "skel_mesh_info": [n for n in dir(unreal.SkelMeshSkinWeightInfo) if not n.startswith("_")],
}, ensure_ascii=False, indent=1))
print("JSONEND")
