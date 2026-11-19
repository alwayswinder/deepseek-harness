-- 比较基础顶点与 Skin 评估后顶点（判断 bind 是否等于当前姿势）
(
	local out = ""
	local mesh = getNodeByName "Seven_Head"
	local base = for v = 1 to mesh.numVerts collect (polyop.getVert mesh v)
	local snap = snapshot mesh
	local maxd = 0.0
	local changed = 0
	local n = amin mesh.numVerts snap.numVerts
	for v = 1 to n do
	(
		local d = (getVert snap v) - base[v]
		local len = length d
		if len > 0.0005 do changed += 1
		if len > maxd do maxd = len
	)
	out += "verts=" + (mesh.numVerts as string) + " snapVerts=" + (snap.numVerts as string) + " changed=" + (changed as string) + " maxDelta=" + (maxd as string) + "\n"
	delete snap
	out
)
