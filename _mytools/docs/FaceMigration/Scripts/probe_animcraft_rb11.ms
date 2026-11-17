-- 干净三态测量：base / 正极限 / 负极限
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn eulerOf o = ( try ( (o.transform).rotation as eulerangles ) catch ( [0,0,0] ) )

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	local names = #("Bone010","Bone011","Bone012","KPoint051","KPoint052","KPoint053","meibu_R","meibu_L")

	fn dump state =
	(
		local s = "== " + state + "\n"
		for nm in names do
		(
			local o = getNodeByName nm
			s += "  " + nm + " p=" + (pstr (getPos o)) + " e=" + ((eulerOf o) as string) + "\n"
		)
		s
	)

	n.position.controller[2].value = [0,0,0]
	out += dump "base (0,0,0)"
	n.position.controller[2].value = [0,2,-1]
	out += dump "pos (0,2,-1)"
	n.position.controller[2].value = [0,-2,-1]
	out += dump "neg (0,-2,-1)"
	n.position.controller[2].value = [0,2,0]
	out += dump "y+2 z0"
	n.position.controller[2].value = [0,-2,0]
	out += dump "y-2 z0"
	n.position.controller[2].value = [0,0,0]
	out
)
