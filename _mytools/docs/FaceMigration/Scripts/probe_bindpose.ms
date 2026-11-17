-- 比较 Skin 的 Bind TM 与骨骼当前世界变换
(
	local out = ""
	local mesh = getNodeByName "Seven_Head"
	local skinMod = undefined
	for m in mesh.modifiers where (classOf m == Skin) do skinMod = m
	if skinMod == undefined then out += "NO SKIN\n"
	else
	(
		local nb = skinOps.GetNumberBones skinMod
		out += "bones=" + (nb as string) + "\n"
		for target in #("Bone027","Bone028","Bone029","Bone036","Bone037","Bone038") do
		(
			local id = 0
			for i = 1 to nb do
			(
				local nm = skinOps.GetBoneName skinMod i 0
				if nm == target do id = i
			)
			if id == 0 then out += target + " not in skin\n"
			else
			(
				local bindTM = undefined
				try ( bindTM = skinOps.GetBoneBindTM skinMod id ) catch ( out += target + " bindTM ERR\n" )
				if bindTM != undefined do
				(
					local bone = getNodeByName target
					local cur = bone.transform
					local bp = bindTM.row4
					local cp = cur.row4
					local bq = bindTM.rotation
					local cq = cur.rotation
					local dq = cq * (inverse bq)
					local ang = 2.0 * acos (amin 1.0 (amax -1.0 (dot bq cq)))
					out += "  " + target + " bindPos=" + ((bp) as string) + " curPos=" + ((cp) as string) + " posDiff=" + ((length (cp - bp)) as string) + " rotDiffDeg=" + ((ang * 180.0 / pi) as string) + "\n"
				)
			)
		)
	)
	out
)
