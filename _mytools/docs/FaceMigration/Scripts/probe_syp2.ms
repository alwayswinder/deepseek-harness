-- SYP_R001 结构 + 拖动量扫描 + 骨骼旋转
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn eulerOf o = ( try ( (o.transform).rotation as eulerangles ) catch ( [0,0,0] ) )

	local n = getNodeByName "SYP_R001"
	out += "== " + n.name + " (" + ((classOf n) as string) + ")\n"
	local chain = ""
	local p = n
	for i = 1 to 6 while p != undefined do
	(
		chain += p.name + "(" + ((classOf p) as string) + ")"
		p = p.parent
		if p != undefined do chain += " <- "
	)
	out += "chain=" + chain + "\n"
	out += "wpos=" + (pstr (getPos n)) + " scale=" + ((n.scale) as string) + "\n"
	out += "transformCtrl=" + ((classOf n.transform.controller) as string) + "\n"

	local pc = n.position.controller
	out += "posCtrl=" + ((classOf pc) as string) + " count=" + (pc.count as string) + " active=" + (pc.active as string) + "\n"
	for i = 1 to pc.count do
	(
		local c = pc[i]
		local cls = "-"
		try ( cls = (classOf c.controller) as string ) catch ( cls = (classOf c) as string )
		out += "  pos[" + (i as string) + "] " + cls + "\n"
		try ( out += "    expr=" + (c.controller.getExpression()) + "\n" ) catch ()
		try ( out += "    target=" + ((c.controller.target) as string) + "\n" ) catch ()
		try ( out += "    weight=" + (c.weight as string) + "\n" ) catch ()
	)

	local rc = n.rotation.controller
	out += "rotCtrl=" + ((classOf rc) as string) + " count=" + (rc.count as string) + "\n"
	for i = 1 to rc.count do
	(
		local c2 = rc[i]
		local cls2 = "-"
		try ( cls2 = (classOf c2.controller) as string ) catch ( cls2 = (classOf c2) as string )
		out += "  rot[" + (i as string) + "] " + cls2 + "\n"
	)

	-- 拖动量扫描（世界 Y）
	local names = #("Bone027","Bone028","Bone029")
	local baseP = #()
	local baseE = #()
	for nm in names do
	(
		local o = getNodeByName nm
		append baseP (getPos o)
		append baseE (eulerOf o)
	)
	local saved = n.transform
	for dy in #(1,2,5,10,20,-5,-10) do
	(
		n.transform = saved
		move n [0, dy, 0]
		out += "== move Y " + (dy as string) + "  self=" + (pstr (getPos n)) + " selfPos=" + ((n.position) as string) + "\n"
		for i = 1 to names.count do
		(
			local o = getNodeByName names[i]
			local d = (getPos o) - baseP[i]
			local e = eulerOf o
			local de = [e.x - baseE[i].x, e.y - baseE[i].y, e.z - baseE[i].z]
			out += "  " + names[i] + " dP=" + (pstr d) + " dE=" + ((de) as string) + "\n"
		)
	)
	n.transform = saved
	out
)
