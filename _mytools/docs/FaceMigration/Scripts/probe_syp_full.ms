-- SYP_L001 完整驱动链：所有变化对象 + 网格顶点变化
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )

	local n = getNodeByName "SYP_L001"
	local names = for o in objects collect o.name
	local types = for o in objects collect ((classOf o) as string)
	local base = for o in objects collect (getPos o)

	local saved = n.transform
	move n [0,10,0]

	out += "== all changed objects (Y+10) ==\n"
	local hits = 0
	for i = 1 to objects.count do
	(
		local d = (getPos objects[i]) - base[i]
		if (length d) > 0.0005 do
		(
			hits += 1
			out += "  " + names[i] + " (" + types[i] + ") d=" + (pstr d) + "\n"
		)
	)
	out += "  totalHits=" + (hits as string) + "\n"

	-- 只统计 Bone 类
	local boneHits = 0
	local boneList = ""
	for i = 1 to objects.count do
	(
		local d = (getPos objects[i]) - base[i]
		if (length d) > 0.0005 and (findString types[i] "Bone") != undefined do
		(
			boneHits += 1
			boneList += "  " + names[i] + " d=" + (pstr d) + "\n"
		)
	)
	out += "== bone changes = " + (boneHits as string) + "\n" + boneList

	-- 头部网格顶点变化（snapshot 应用修改器）
	local mesh = getNodeByName "Seven_Head"
	if mesh != undefined do
	(
		local s1 = snapshot mesh
		local v1 = for v = 1 to s1.numVerts collect (getVert s1 v)
		n.transform = saved
		local s0 = snapshot mesh
		local v0 = for v = 1 to s0.numVerts collect (getVert s0 v)
		n.transform = saved
		move n [0,10,0]
		local s2 = snapshot mesh
		local v2 = for v = 1 to s2.numVerts collect (getVert s2 v)
		local maxd = 0.0
		local changed = 0
		for v = 1 to v0.count do
		(
			local d = (v2[v] - v0[v])
			local len = length d
			if len > 0.0005 do
			(
				changed += 1
				if len > maxd do maxd = len
			)
		)
		out += "== mesh verts: total=" + (v0.count as string) + " changed=" + (changed as string) + " maxDelta=" + (maxd as string) + "\n"
		delete s1
		delete s2
		delete s0
	)
	n.transform = saved
	out
)
