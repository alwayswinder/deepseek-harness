-- 逐轴子控制器 + 骨骼控制器探测
(
	local out = ""
	fn axisInfo sa label =
	(
		local s = ""
		local cls = "-"
		try ( cls = (classOf sa.controller) as string ) catch ()
		s += "   " + label + " ctrl=" + cls
		try ( s += " value=" + ((sa.value) as string) ) catch ()
		s += "\n"
		try ( s += "     expr=" + (sa.controller.getExpression()) + "\n" ) catch ()
		try ( s += "     wire=" + ((getWiredParams sa) as string) + "\n" ) catch ()
		s
	)

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	if n != undefined do
	(
		local p2 = n.position.controller[2]
		out += "== n pos XYZ ==\n"
		for i = 1 to 3 do
			try ( out += axisInfo p2[i] ("axis" + (i as string)) ) catch ()
		out += "  p2.value now=" + ((p2.value) as string) + "\n"

		local saved = n.transform
		move n [0,0,10]
		out += "  after Z+10 p2.value=" + ((p2.value) as string) + " wpos=" + (((n.transform).row4) as string) + "\n"
		move n [10,0,0]
		out += "  after X+10 (stacked) p2.value=" + ((p2.value) as string) + " wpos=" + (((n.transform).row4) as string) + "\n"
		n.transform = saved
	)

	for nm in #("Bone010","Bone011","Bone012","KPoint051","KPoint052","KPoint053") do
	(
		local b = getNodeByName nm
		if b == undefined then out += nm + " MISSING\n"
		else
		(
			out += "== " + nm + " (" + ((classOf b) as string) + ") ==\n"
			try (
				local pc = b.position.controller
				out += "  posCtrl=" + ((classOf pc) as string) + " count=" + (pc.count as string) + " active=" + (pc.active as string) + "\n"
				for i = 1 to pc.count do
				(
					local item = pc[i]
					local cls = "-"
					try ( cls = (classOf item.controller) as string ) catch ( cls = (classOf item) as string )
					out += "   [" + (i as string) + "] " + cls + "\n"
					try ( out += "      expr=" + (item.controller.getExpression()) + "\n" ) catch ()
					try ( out += "      wire=" + ((getWiredParams item.controller) as string) + "\n" ) catch ()
				)
			) catch ( out += "  posCtrl ERR\n" )
			try (
				out += "  rotCtrl=" + ((classOf b.rotation.controller) as string) + "\n"
				for i = 1 to b.rotation.controller.count do
				(
					local item2 = b.rotation.controller[i]
					local cls2 = "-"
					try ( cls2 = (classOf item2.controller) as string ) catch ( cls2 = (classOf item2) as string )
					out += "   rot[" + (i as string) + "] " + cls2 + "\n"
					try ( out += "      expr=" + (item2.controller.getExpression()) + "\n" ) catch ()
				)
			) catch ()
			try ( out += "  wire=" + ((getWiredParams b) as string) + "\n" ) catch ()
		)
	)
	out
)
