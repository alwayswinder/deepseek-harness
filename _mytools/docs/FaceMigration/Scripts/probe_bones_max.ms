-- 读骨骼与眉毛相关点世界坐标
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)
	for nm in #("Bone007","Bone008","Bone009","Bone010","Bone011","Bone012","meibu_L","meibu_R","Bone006","Bone013","head","Root") do
	(
		local o = getNodeByName nm
		if o == undefined then out += nm + " MISSING\n"
		else
		(
			local par = "-"
			try ( par = o.parent.name ) catch ()
			out += nm + " (" + ((classOf o) as string) + ") parent=" + par + " wpos=" + (pstr (getPos o)) + "\n"
		)
	)
	out
)
