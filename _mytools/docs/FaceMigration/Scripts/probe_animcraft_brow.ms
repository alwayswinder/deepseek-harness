-- 探测 Animcraft_Right_Brow_Z_Ctrl 及其附属控制器的结构与驱动关系
(
	local out = ""

	fn nm o = ( o.name )
	fn cls o = ( (classOf o) as string )
	fn posstr o = ( (o.pos) as string )

	fn dumpNode n =
	(
		local s = ""
		local par = "-"
		local pc = "-"
		if n.parent != undefined do ( par = n.parent.name; pc = (classOf n.parent) as string )
		local pctrl = "-"
		local rctrl = "-"
		local sctrl = "-"
		try ( pctrl = ((classOf n.position.controller) as string) ) catch ()
		try ( rctrl = ((classOf n.rotation.controller) as string) ) catch ()
		try ( sctrl = ((classOf n.scale.controller) as string) ) catch ()
		local wirestr = "-"
		try ( wirestr = (get_wired_params n) as string ) catch ()

		s += "NAME=" + n.name + " CLASS=" + (cls n) + "\n"
		s += "  PARENT=" + par + " (" + pc + ")\n"
		s += "  POS=" + ((n.pos) as string) + "\n"
		s += "  ROT=" + ((n.rotation) as string) + "\n"
		s += "  SCALE=" + ((n.scale) as string) + "\n"
		s += "  CTRL pos=" + pctrl + " rot=" + rctrl + " scale=" + sctrl + "\n"
		s += "  WIRE=" + wirestr + "\n"
		s += "  NCHILDREN=" + ((n.children.count) as string) + "\n"
		for c in n.children do
			s += "    CHILD " + c.name + " (" + ((classOf c) as string) + ")\n"
		s
	)

	local names = #("Animcraft_Right_Brow_Z_Ctrl", "Animcraft_Right_Brow_Ctrl")
	for i = 1 to names.count do
	(
		local n = getNodeByName names[i]
		if n == undefined then out += "MISSING " + names[i] + "\n"
		else out += dumpNode n
	)

	out += "== OBJECTS WITH 'BROW' IN NAME ==\n"
	for o in objects where findString (toLower o.name) "brow" != undefined do
	(
		local pc2 = "-"
		try ( pc2 = ((classOf o.position.controller) as string) ) catch ()
		out += "  " + o.name + " (" + (cls o) + ") pos=" + ((o.pos) as string) + " ctrl=" + pc2 + "\n"
	)

	out += "== OBJECTS WITH CONSTRAINT CONTROLLERS ==\n"
	for o in objects do
	(
		local posc = ""
		try ( posc = ((classOf o.position.controller) as string) ) catch ()
		if (findString posc "Constraint") != undefined do
			out += "  " + o.name + " (" + (cls o) + ") posCtrl=" + posc + "\n"
	)

	out
)
