-- 只读探测：六个 zCircle 三轴世界移动响应
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
	fn diffReport base cur =
	(
		local s = ""
		local hits = 0
		for i = 1 to objects.count do
		(
			local d = cur[i] - base[i]
			if (length d) > 0.002 do
			(
				hits += 1
				if hits <= 15 do s += "   " + objects[i].name + " d=" + ((d as string)) + "\n"
			)
		)
		"   hits=" + (hits as string) + "\n" + s
	)

	local names = #("zCircle051","zCircle052","zCircle053","zCircle049","zCircle050","zCircle048")
	for nm in names do
	(
		local n = getNodeByName nm
		local base = snapAll()
		local saved = n.transform
		out += "== " + nm + " base wpos=" + (pstr (getPos n)) + "\n"
		for ax in #([10,0,0],[0,10,0],[0,0,10]) do
		(
			move n ax
			local cur = snapAll()
			out += "  +" + (pstr ax) + "\n" + (diffReport base cur)
			n.transform = saved
		)
	)
	out
)
