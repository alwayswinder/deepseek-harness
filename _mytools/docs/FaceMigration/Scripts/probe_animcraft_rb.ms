-- 探测 Animcraft_Right_Brow_Ctrl：结构 + 世界移动/旋转/缩放响应
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)
	fn getRot o =
	(
		local q = quat 0 0 0 1
		try ( q = (o.transform).rotation ) catch ( try ( q = o.rotation ) catch () )
		q
	)
	fn getScl o =
	(
		local s = [1,1,1]
		try ( s = (o.transform).scale ) catch ( try ( s = o.scale ) catch () )
		s
	)
	fn snapPos = ( for o in objects collect (getPos o) )
	fn snapRot = ( for o in objects collect (getRot o) )
	fn snapScl = ( for o in objects collect (getScl o) )
	fn diffReport baseP baseR baseS tag =
	(
		local s = ""
		local hits = 0
		for i = 1 to objects.count do
		(
			local dp = (getPos objects[i]) - baseP[i]
			local q1 = getRot objects[i]; local q0 = baseR[i]; local qd = (abs(q1.x-q0.x) + abs(q1.y-q0.y) + abs(q1.z-q0.z) + abs(q1.w-q0.w))
			local ds = (getScl objects[i]) - baseS[i]
			local moved = (length dp) > 0.001
			local roted = qd > 0.001
			local scld = (length ds) > 0.001
			if (moved or roted or scld) do
			(
				hits += 1
				if hits <= 30 do
				(
					s += "   " + objects[i].name
					if moved do s += " dP=" + ((dp as string))
					if roted do s += " dR=" + ((qd as string))
					if scld do s += " dS=" + ((ds as string))
					s += "\n"
				)
			)
		)
		"  " + tag + " hits=" + (hits as string) + "\n" + s
	)

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	if n == undefined then out += "MISSING Animcraft_Right_Brow_Ctrl\n"
	else
	(
		-- 结构
		local chain = ""
		local p = n
		for i = 1 to 8 while p != undefined do
		(
			chain += p.name + "(" + ((classOf p) as string) + ")"
			p = p.parent
			if p != undefined do chain += " <- "
		)
		out += "== " + n.name + " (" + ((classOf n) as string) + ") ==\n  chain=" + chain + "\n"
		out += "  wpos=" + (pstr (getPos n)) + " wscale=" + ((getScl n) as string) + "\n"

		local pc = n.position.controller
		out += "  posCtrl=" + ((classOf pc) as string) + "\n"
		try (
			for i = 1 to pc.count do
			(
				local sc = "-"
				try ( sc = (classOf pc[i].controller) as string ) catch ( sc = (classOf pc[i]) as string )
				out += "   pos[" + (i as string) + "] " + sc + "\n"
				try ( out += "       expr=" + (pc[i].controller.getExpression()) + "\n" ) catch ()
				try ( out += "       target=" + ((pc[i].controller.target) as string) + "\n" ) catch ()
			)
		) catch ()
		try ( out += "  posCtrl count=" + (pc.count as string) + " active=" + (pc.active as string) + "\n" ) catch ()

		local rc = n.rotation.controller
		out += "  rotCtrl=" + ((classOf rc) as string) + "\n"
		try (
			for i = 1 to rc.count do
			(
				local sc2 = "-"
				try ( sc2 = (classOf rc[i].controller) as string ) catch ( sc2 = (classOf rc[i]) as string )
				out += "   rot[" + (i as string) + "] " + sc2 + "\n"
				try ( out += "       expr=" + (rc[i].controller.getExpression()) + "\n" ) catch ()
			)
		) catch ()

		local sclc = n.scale.controller
		try ( out += "  sclCtrl=" + ((classOf sclc) as string) + "\n" ) catch ()

		try ( out += "  wire=" + ((get_wired_params n) as string) + "\n" ) catch ()
		try (
			local cons = for c in n.transform.controller do c
			out += "  transformCtrl=" + ((classOf n.transform.controller) as string) + "\n"
		) catch ()

		-- 响应
		local baseP = snapPos()
		local baseR = snapRot()
		local baseS = snapScl()
		local saved = n.transform

		move n [10,0,0]
		out += diffReport baseP baseR baseS "MOVE +10X"
		n.transform = saved

		move n [0,10,0]
		out += diffReport baseP baseR baseS "MOVE +10Y"
		n.transform = saved

		move n [0,0,10]
		out += diffReport baseP baseR baseS "MOVE +10Z"
		n.transform = saved

		rotate n (eulerangles 10 0 0)
		out += diffReport baseP baseR baseS "ROT +10X"
		n.transform = saved

		rotate n (eulerangles 0 10 0)
		out += diffReport baseP baseR baseS "ROT +10Y"
		n.transform = saved

		rotate n (eulerangles 0 0 10)
		out += diffReport baseP baseR baseS "ROT +10Z"
		n.transform = saved

		local sc0 = n.scale
		n.scale = sc0 * 1.1
		out += diffReport baseP baseR baseS "SCALE 1.1"
		n.transform = saved
	)

	out
)

