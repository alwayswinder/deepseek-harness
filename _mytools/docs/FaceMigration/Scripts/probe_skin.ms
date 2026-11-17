-- 检查头部网格的 Skin 骨骼与眼皮区域权重来源
(
	local out = ""
	local cands = for o in objects where (classOf o == PolyMeshObject or classOf o == Editable_mesh or classOf o == Editable_Poly) collect o
	out += "== mesh objects ==\n"
	for o in cands do out += "  " + o.name + " (" + ((classOf o) as string) + ")\n"

	local mesh = undefined
	for o in cands where (findString (toLower o.name) "head") != undefined do mesh = o
	if mesh == undefined do mesh = getNodeByName "Seven_Head01"
	if mesh == undefined then out += "NO HEAD MESH\n"
	else
	(
		out += "== head=" + mesh.name + " verts=" + (mesh.numVerts as string) + "\n"
		local skinMod = undefined
		for m in mesh.modifiers where (classOf m == Skin) do skinMod = m
		if skinMod == undefined then out += "NO SKIN\n"
		else
		(
			local nb = skinOps.GetNumberBones skinMod
			out += "bones=" + (nb as string) + "\n"
			for i = 1 to nb do out += "  [" + (i as string) + "] " + (skinOps.GetBoneName skinMod i 0) + "\n"

			-- 眼皮区域顶点权重（右眼：X -6..-1.5, Y -9..-6.5, Z 158..162）
			local idx = #{}
			for v = 1 to mesh.numVerts do
			(
				local p = undefined
				try ( p = polyop.getVert mesh v ) catch ( try ( p = getVert mesh v ) catch () )
				if p != undefined and p.x < -1.2 and p.x > -7.2 and p.y < -6.0 and p.y > -10.2 and p.z > 157.5 and p.z < 162.2 do idx[v] = true
			)
			out += "eyelid verts=" + (idx.numberSet as string) + "\n"
			-- 统计每骨在这些顶点上的权重和
			local wsum = #()
			for i = 1 to nb do wsum[i] = 0.0
			for v in idx do
			(
				local nw = skinOps.GetVertexWeightCount skinMod v
				for k = 1 to nw do
				(
					local bi = skinOps.GetVertexWeightBoneID skinMod v k
					local w = skinOps.GetVertexWeight skinMod v k
					if bi >= 1 and bi <= nb do wsum[bi] += w
				)
			)
			out += "== weight sums (eyelid) ==\n"
			for i = 1 to nb where wsum[i] > 0.05 do out += "  " + (skinOps.GetBoneName skinMod i 0) + " = " + (wsum[i] as string) + "\n"
		)
	)
	out
)

