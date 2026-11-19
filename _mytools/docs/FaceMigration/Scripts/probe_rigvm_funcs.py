import unreal, json
print("JSONSTART")
print(json.dumps({
  "quat_rotate": [n for n in dir(unreal) if "Quaternion" in n and ("Rotate" in n or "Vector" in n)],
  "vector_ops": [n for n in dir(unreal) if n.startswith("RigVMFunction_MathVector")],
  "float_ops": [n for n in dir(unreal) if n in ("RigVMFunction_MathFloatAdd","RigVMFunction_MathFloatMul","RigVMFunction_MathFloatDiv")],
  "quat_from": [n for n in dir(unreal) if n.startswith("RigVMFunction_MathQuaternionFrom")],
}, ensure_ascii=False, indent=1))
print("JSONEND")
