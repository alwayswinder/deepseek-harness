-- 完整映射：y ∈ [-2,2]（z=-1）时三根骨的位置与旋转
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)
	fn eulerOf o =
	(
		local e = [0,0,0]
		try ( e = (o.transform).rotation as eulerangles ) catch ( try ( e = o.rotation as eulerangles ) catch () )
		e
	)

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	local bones = #("Bone010","Bone011","Bone012")
	local kps = #("KPoint051","KPoint052","KPoint053")
	local savedN = n.transform

	local baseP = #()
	local baseE = #()
	for b in bones do
	(
		local o = getNodeByName b
		append baseP (getPos o)
		append baseE (eulerOf o)
	)

	out += "base:\n"
	for i = 1 to bones.count do
		out += "  " + bones[i] + " p=" + (pstr baseP[i]) + " e=" + ((baseE[i]) as string) + "\n"

	for y in #(2.0, 1.0, 0.5, 0.0, -0.5, -1.0, -2.0) do
	(
		n.transform = savedN
		n.position.controller[2].value = [0, y, -1]
		out += "y=" + (y as string) + "\n"
		for i = 1 to bones.count do
		(
			local o = getNodeByName bones[i]
			local d = (getPos o) - baseP[i]
			local e = eulerOf o
			local de = [e.x - baseE[i].x, e.y - baseE[i].y, e.z - baseE[i].z]
			out += "  " + bones[i] + " dP=" + (pstr d) + " dEuler=" + ((de) as string) + "\n"
		)
	)
	n.transform = savedN
	out
)

