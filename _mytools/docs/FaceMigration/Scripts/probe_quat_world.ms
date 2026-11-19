-- 判断 delta 是局部还是世界：把轴用 base 旋转后再比较欧拉差
(
	local out = ""
	fn angdeg q = (2.0 * acos (amin 1.0 (amax -1.0 q.w)) * 180.0 / pi)
	fn eul o = ((o.transform).rotation as eulerangles)

	local nR = getNodeByName "SYP_R001"
	local saved = nR.transform
	local b = getNodeByName "Bone028"
	local q0 = b.transform.rotation
	local e0 = eul b

	nR.position.controller[2].value = [0,-1.75,0]
	local q1 = b.transform.rotation
	local e1 = eul b
	nR.transform = saved
	nR.position.controller[2].value = [0,0,0]

	local dA = q1 * (inverse q0)
	local dB = (inverse q0) * q1
	local de = [e1.x - e0.x, e1.y - e0.y, e1.z - e0.z]

	out += "euler base=" + ((e0) as string) + " end=" + ((e1) as string) + " diff=" + ((de) as string) + "\n"
	out += "dA ang=" + ((angdeg dA) as string) + " axisLocal=" + ((dA.axis) as string) + " axisWorlded=" + ((((q0 as matrix3) * dA.axis)) as string) + "\n"
	out += "dB ang=" + ((angdeg dB) as string) + " axisLocal=" + ((dB.axis) as string) + " axisWorlded=" + ((((q0 as matrix3) * dB.axis)) as string) + "\n"
	out
)

