-- 探测左眉弯曲控制 Animcraft_Left_Brow_Ctrl
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn eulerOf o = ( try ( (o.transform).rotation as eulerangles ) catch ( [0,0,0] ) )

	local n = getNodeByName "Animcraft_Left_Brow_Ctrl"
	if n == undefined then out += "MISSING\n"
	else
	(
		local chain = ""
		local p = n
		for i = 1 to 6 while p != undefined do
		(
			chain += p.name + "(" + ((classOf p) as string) + ")"
			p = p.parent
			if p != undefined do chain += " <- "
		)
		out += "chain=" + chain + "\n"
		out += "wpos=" + (pstr (getPos n)) + " wscale=" + ((n.scale) as string) + "\n"
		local pc = n.position.controller
		out += "posCtrl=" + ((classOf pc) as string) + " count=" + (pc.count as string) + "\n"
		for i = 1 to pc.count do
		(
			local cls = "-"
			try ( cls = (classOf pc[i].controller) as string ) catch ( cls = (classOf pc[i]) as string )
			out += "  pos[" + (i as string) + "] " + cls + "\n"
			try ( out += "     expr=" + (pc[i].controller.getExpression()) + "\n" ) catch ()
		)
		local p2 = pc[2]
		if p2 != undefined do
		(
			for i = 1 to 3 do
			(
				local sa = p2[i]
				local cls2 = "-"
				try ( cls2 = (classOf sa.controller) as string ) catch ()
				out += "  axis" + (i as string) + "=" + cls2
				try ( out += " value=" + ((sa.value) as string) ) catch ()
				out += "\n"
			)
		)
		out += "rotCtrl=" + ((classOf n.rotation.controller) as string) + "\n"

		-- 基准三态
		local names = #("Bone007","Bone008","Bone009","meibu_L","meibu_R")
		fn dump tag =
		(
			local s = "== " + tag + "\n"
			for nm in names do
			(
				local o = getNodeByName nm
				s += "  " + nm + " p=" + (pstr (getPos o)) + " e=" + ((eulerOf o) as string) + "\n"
			)
			s
		)
		n.position.controller[2].value = [0,0,0]
		out += dump "base"
		n.position.controller[2].value = [0,2,-1]
		out += dump "y+2 z-1"
		n.position.controller[2].value = [0,-2,-1]
		out += dump "y-2 z-1"
		n.position.controller[2].value = [0,2,0]
		out += dump "y+2 z0"
		n.position.controller[2].value = [0,-2,0]
		out += dump "y-2 z0"
		n.position.controller[2].value = [0,0,0]
	)
	out
)
