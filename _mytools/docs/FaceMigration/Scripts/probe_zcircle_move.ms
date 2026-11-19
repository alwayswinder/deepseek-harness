-- 只读探测：拖动 zCircle / KPoint 的世界移动响应
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)
	fn snapAll = ( for o in objects collect (getPos o) )
	fn diffReport base cur tag =
	(
		local s = ""
		local hits = 0
		for i = 1 to objects.count do
		(
			local d = cur[i] - base[i]
			if (length d) > 0.002 do
			(
				hits += 1
				if hits <= 25 do s += "   " + objects[i].name + " d=" + ((d as string)) + "\n"
			)
		)
		s += "   totalHits=" + (hits as string) + "\n"
		s
	)

	out += "scene=" + maxFileName + " path=" + maxFilePath + "\n"

	local tests = #("zCircle051","KPoint051","zCircle049","KPoint049")
	for nm in tests do
	(
		local n = getNodeByName nm
		if n == undefined then out += "MISSING " + nm + "\n"
		else
		(
			local base = snapAll()
			local sp = n.pos
			local w0 = getPos n
			move n [10,0,0]
			local cur = snapAll()
			out += "== MOVE " + nm + " world +10X == self " + (pstr w0) + " -> " + (pstr (getPos n)) + "\n"
			out += diffReport base cur nm
			n.pos = sp
			local back = snapAll()
			out += "   after reset self=" + (pstr (getPos n)) + "\n"
		)
	)
	out
)


