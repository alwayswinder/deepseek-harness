-- 深入探测 Animcraft_Right_Brow_Ctrl：逐轴控制器、骨骼驱动链、Z 轴线性度、morph
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
	fn dumpAxis ctrl label =
	(
		local s = ""
		local xs = #("X_axis","Y_axis","Z_axis")
		for an in xs do
		(
			local ax = undefined
			try ( ax = getProperty ctrl an ) catch ()
			if ax != undefined do
			(
				local cls = "-"
				try ( cls = (classOf ax.controller) as string ) catch ()
				local w = "-"
				try ( w = (get_wired_params ctrl) as string ) catch ()
				s += "    " + an + ".ctrl=" + cls + "\n"
				try ( s += "       expr=" + (ax.controller.getExpression()) + "\n" ) catch ()
			)
		)
		s
	)

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	if n == undefined then out += "MISSING\n"
	else
	(
		out += "== n.transform.controller=" + ((classOf n.transform.controller) as string) + "\n"
		local posList = n.position.controller
		out += "posList count=" + (posList.count as string) + "\n"
		for i = 1 to posList.count do
		(
			local item = posList[i]
			local cls = "-"
			try ( cls = (classOf item.controller) as string ) catch ( cls = (classOf item) as string )
			out += " pos[" + (i as string) + "] " + cls
			try ( out += " weight=" + (item.weight as string) ) catch ()
			try ( out += " active=" + ((posList.active == i) as string) ) catch ()
			out += "\n"
			try ( out += dumpAxis item.controller "pos" ) catch ()
		)

		local rotList = n.rotation.controller
		out += "rotList count=" + (rotList.count as string) + "\n"
		for i = 1 to rotList.count do
		(
			local item = rotList[i]
			local cls = "-"
			try ( cls = (classOf item.controller) as string ) catch ( cls = (classOf item) as string )
			out += " rot[" + (i as string) + "] " + cls + "\n"
			try ( out += dumpAxis item.controller "rot" ) catch ()
		)

		-- 骨骼/点上的表达式是否引用了本控制
		out += "== references ==\n"
		for o in objects do
		(
			try (
				local pc2 = o.position.controller
				for i = 1 to pc2.count do
				(
					local e = "-"
					try ( e = (pc2[i].controller.getExpression()) ) catch ()
					if (e != "-" and (findString e "Animcraft_Right_Brow_Ctrl") != undefined) do
						out += "  " + o.name + ".pos[" + (i as string) + "] expr=" + e + "\n"
				)
			) catch ()
			try (
				local rc2 = o.rotation.controller
				for i = 1 to rc2.count do
				(
					local e2 = "-"
					try ( e2 = (rc2[i].controller.getExpression()) ) catch ()
					if (e2 != "-" and (findString e2 "Animcraft_Right_Brow_Ctrl") != undefined) do
						out += "  " + o.name + ".rot[" + (i as string) + "] expr=" + e2 + "\n"
				)
			) catch ()
		)

		-- Z 轴线性度 + 骨骼旋转
		out += "== Z sweep ==\n"
		local saved = n.transform
		local baseP = for o in objects collect (getPos o)
		for z in #(5, 10, 20, -10, -20) do
		(
			n.transform = saved
			move n [0, 0, z]
			out += "  Z=" + (z as string) + "\n"
			for bn in #("Bone010","Bone011","Bone012") do
			(
				local b = getNodeByName bn
				local cur = getPos b
				local d = cur - baseP[(findItem (for o in objects collect o.name) bn)]
				local e = eulerOf b
				out += "   " + bn + " dP=" + ((d as string)) + " wEuler=" + ((e as string)) + "\n"
			)
		)
		n.transform = saved

		-- morph 修改器
		out += "== morpher ==\n"
		for o in objects do
		(
			try (
				for m in o.modifiers where (classOf m == Morpher) do
					out += "  " + o.name + " morpher ch=" + (m.numChannels() as string) + "\n"
			) catch ()
		)
	)
	out
)
