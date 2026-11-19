-- 统计眼皮区域顶点的骨骼权重数量（检查是否超过 4）
(
	local out = ""
	local mesh = getNodeByName "Seven_Head"
	local skinMod = undefined
	for m in mesh.modifiers where (classOf m == Skin) do skinMod = m
	if skinMod == undefined then out += "NO SKIN\n"
	else
	(
		local hist = #(0,0,0,0,0,0,0,0,0,0)
		local total = 0
		local maxw = 0
		for v = 1 to mesh.numVerts do
		(
			local p = polyop.getVert mesh v
			if p.x < -1.2 and p.x > -7.2 and p.y < -6.0 and p.y > -10.2 and p.z > 157.5 and p.z < 162.2 do
			(
				total += 1
				local n = skinOps.GetVertexWeightCount skinMod v
				if n >= 1 and n <= 10 then hist[n] += 1
				if n > maxw do maxw = n
			)
		)
		out += "verts=" + (total as string) + " maxWeights=" + (maxw as string) + "\n"
		for i = 1 to 10 do out += "  weights=" + (i as string) + " : " + (hist[i] as string) + "\n"
	)
	out
)
