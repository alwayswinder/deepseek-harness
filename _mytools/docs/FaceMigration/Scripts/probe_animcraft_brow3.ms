-- 探测右眉两个控制器的完整结构 + 驱动链（约束/表达式）
(
	local out = ""
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)

	-- 控制器自身的变换控制器结构
	fn dumpCtrl o =
	(
		local s = ""
		s += "## " + o.name + " (" + ((classOf o) as string) + ")\n"
		local pc = o.position.controller
		s += "  posCtrl=" + ((classOf pc) as string) + "\n"
		try (
			s += "   count=" + ((pc.count) as string) + " active=" + ((pc.active) as string) + "\n"
			for i = 1 to pc.count do
			(
				local sc = "-"
				try ( sc = (classOf pc[i].controller) as string ) catch ( sc = (classOf pc[i]) as string )
				s += "   [" + (i as string) + "] " + sc + "\n"
				if (findString sc "Position_XYZ") == undefined do
				(
					local tgt = "-"
					try ( tgt = (pc[i].controller.target) as string ) catch ()
					s += "        target=" + tgt + "\n"
					local wt = "-"
					try ( wt = (pc[i].controller.weight) as string ) catch ()
					s += "        weight=" + wt + "\n"
				)
			)
		) catch ()
		local rc = o.rotation.controller
		s += "  rotCtrl=" + ((classOf rc) as string) + "\n"
		try (
			for i = 1 to rc.count do
			(
				local sc2 = "-"
				try ( sc2 = (classOf rc[i].controller) as string ) catch ( sc2 = (classOf rc[i]) as string )
				s += "   rot[" + (i as string) + "] " + sc2 + "\n"
			)
		) catch ()
		local w = "-"
		try ( w = (get_wired_params o) as string ) catch ()
		s += "  wire=" + w + "\n"
		s
	)

	for nm in #("Animcraft_Right_Brow_Z_Ctrl","Animcraft_Right_Brow_Ctrl","meibu_R","Bone010","Point471") do
	(
		local o = getNodeByName nm
		if o == undefined then out += "MISSING " + nm + "\n"
		else out += dumpCtrl o
	)

	-- 子控制器单独移动的影响
	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	if n != undefined do
	(
		local names = for o in objects collect o.name
		local base = for o in objects collect (getPos o)
		local sp = n.pos
		local sr = n.rotation
		fn testMove ax =
		(
			n.pos = sp
			n.rotation = sr
			case ax of
			(
				#x: ( n.pos += [10, 0, 0] )
				#y: ( n.pos += [0, 10, 0] )
				#z: ( n.pos += [0, 0, 10] )
				#rx: ( n.rotation = sr * ((eulerangles 10 0 0) as quat) )
				#ry: ( n.rotation = sr * ((eulerangles 0 10 0) as quat) )
				#rz: ( n.rotation = sr * ((eulerangles 0 0 10) as quat) )
			)
			local cur = for o in objects collect (getPos o)
			local s = "== CHILD " + (ax as string) + " +10 ==\n"
			local hits = 0
			for i = 1 to objects.count do
			(
				local d = cur[i] - base[i]
				if (length d) > 0.001 do
				(
					hits += 1
					if hits <= 40 do s += "   " + names[i] + " d=" + ((d as string)) + "\n"
				)
			)
			s += "   totalHits=" + (hits as string) + "\n"
			s
		)
		for ax in #(#x, #y, #z, #rx, #ry, #rz) do out += testMove ax
		n.pos = sp
		n.rotation = sr
	)

	out
)
