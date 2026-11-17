import unreal, json
print("JSONSTART")
print(json.dumps({
 "skin_related": [n for n in dir(unreal) if ("Skin" in n or "skin" in n)],
 "mesh_editor": [n for n in dir(unreal) if "SkeletalMesh" in n and ("Editor" in n or "Subsystem" in n)],
}, ensure_ascii=False, indent=1))
print("JSONEND")
