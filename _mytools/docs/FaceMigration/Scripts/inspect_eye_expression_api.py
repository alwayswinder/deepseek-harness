import unreal
print('COMP',[n for n in dir(unreal.SkeletalMeshComponent) if 'tick' in n or 'refresh' in n or 'update_anim' in n or 'pause' in n])
print('LIVE',[n for n in dir(unreal.ControlRig) if 'evaluate' in n or 'request' in n or 'control' in n and 'set' in n])
print('ANIM',[n for n in dir(unreal.AnimInstance) if 'update' in n or 'curve' in n])
