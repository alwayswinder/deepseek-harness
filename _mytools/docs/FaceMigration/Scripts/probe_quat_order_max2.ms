-- 验证 MaxScript 四元数乘法顺序：哪个乘积是世界 delta
(
	local out = ""
	fn angdeg q = (2.0 * acos (amin 1.0 (amax -1.0 q.w)) * 180.0 / pi)

	local nR = getNodeByName "SYP_R001"
	local saved = nR.transform
	local bones = #("Bone027","Bone028","Bone029")

	local q0 = #()
	for b in bones do append q0 ((getNodeByName b).transform.rotation)

	nR.position.controller[2].value = [0,-1.75,0]

	for i = 1 to bones.count do
	(
		local b = bones[i]
		local q1 = (getNodeByName b).transform.rotation
		local dA = q1 * (inverse q0[i])
		local dB = (inverse q0[i]) * q1
		out += "== " + b + "\n"
		out += "  q1*inv(q0): ang=" + ((angdeg dA) as string) + " axis=" + ((dA.axis) as string) + "\n"
		out += "  inv(q0)*q1: ang=" + ((angdeg dB) as string) + " axis=" + ((dB.axis) as string) + "\n"
	)
	nR.transform = saved
	nR.position.controller[2].value = [0,0,0]
	out
)
