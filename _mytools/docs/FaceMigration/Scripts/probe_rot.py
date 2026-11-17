import unreal
print(unreal.Rotator(roll=90.0))
q = unreal.Rotator(roll=90.0).quaternion()
print("quat:", q)
print("has quaternion:", hasattr(unreal.Rotator(0,0,90), "quaternion"))
t = unreal.Transform(location=unreal.Vector(1,2,3), rotation=q, scale=unreal.Vector(1,1,1))
print("transform ok", t.rotation)
