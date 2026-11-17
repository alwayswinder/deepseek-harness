-- 探测 Animcraft_Right_Brow_Ctrl 的逐轴值、骨骼控制器与 wire
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	if n != undefined do
	(
		out += "== n ==\n"
		out += "  pos.value=" + ((n.position.controller[2].value) as string) + "\n"
		local p2 = n.position.controller[2]
		out += "  p2 class=" + ((classOf p2) as string) + "\n"
		out += "  p2 props=" + ((getPropNames p2) as string) + "\n"
		try ( out += "  p2.x.ctrl=" + ((classOf p2.x.controller) as string) + "\n" ) catch ( out += "  p2.x.ctrl ERR\n" )
		try ( out += "  p2.y.ctrl=" + ((classOf p2.y.controller) as string) + "\n" ) catch ( out += "  p2.y.ctrl ERR\n" )
		try ( out += "  p2.z.ctrl=" + ((classOf p2.z.controller) as string) + "\n" ) catch ( out += "  p2.z.ctrl ERR\n" )

		local r2 = n.rotation.controller[2]
		out += "  r2 class=" + ((classOf r2) as string) + " props=" + ((getPropNames r2) as string) + "\n"

		out += "  wire=" + ((get_wired_params n) as string) + "\n"

		-- 拖 Z 后实际值
		local saved = n.transform
		move n [0,0,10]
		out += "  after move Z+10 pos=" + (pstr (n.position.controller[2].value)) + " wpos=" + (pstr ((n.transform).row4)) + "\n"
		move n [0,0,-20]
		out += "  after move Z-20 pos=" + (pstr (n.position.controller[2].value)) + " wpos=" + (pstr ((n.transform).row4)) + "\n"
		n.transform = saved
	)

	-- 骨骼与 K 点控制器
	for nm in #("Bone010","Bone011","Bone012","KPoint051","KPoint052","KPoint053") do
	(
		local b = getNodeByName nm
		if b == undefined then out += nm + " MISSING\n"
		else
		(
			out += "== " + nm + " (" + ((classOf b) as string) + ") ==\n"
			out += "  posCtrl=" + ((classOf b.position.controller) as string)
			try ( out += " count=" + (b.position.controller.count as string) ) catch ()
			out += "\n"
			try (
				for i = 1 to b.position.controller.count do
				(
					local c = b.position.controller[i]
					local cls = "-"
					try ( cls = (classOf c.controller) as string ) catch ( cls = (classOf c) as string )
					out += "    [" + (i as string) + "] " + cls
					try ( out += " active=" + ((b.position.controller.active == i) as string) ) catch ()
					out += "\n"
					try ( out += "       expr=" + (c.controller.getExpression()) + "\n" ) catch ()
				)
			) catch ()
			out += "  rotCtrl=" + ((classOf b.rotation.controller) as string) + "\n"
			try ( out += "  wire=" + ((get_wired_params b) as string) + "\n" ) catch ()
		)
	)
	out
)
