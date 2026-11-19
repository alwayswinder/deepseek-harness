-- 只读探测：zCircle049/050/051/052/053/048 的结构与拖动响应
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)

	local names = #("zCircle051","zCircle052","zCircle053","zCircle049","zCircle050","zCircle048")

	fn dumpOne nm =
	(
		local s = ""
		local o = getNodeByName nm
		if o == undefined then return ("MISSING " + nm + "\n")
		local p = getPos o
		s += "## " + nm + " (" + ((classOf o) as string) + ") wpos=" + (pstr p) + "\n"
		local par = o.parent
		if par != undefined do
		(
			s += "  parent=" + par.name + " (" + ((classOf par) as string) + ") wpos=" + (pstr (getPos par)) + "\n"
			if par.parent != undefined do s += "  grandparent=" + par.parent.name + " (" + ((classOf par.parent) as string) + ")\n"
			local pc0 = par.position.controller
			s += "  parent.posCtrl=" + ((classOf pc0) as string) + "\n"
			try (
				s += "    count=" + ((pc0.count) as string) + "\n"
				for i = 1 to pc0.count do
				(
					local sc = "-"
					try ( sc = (classOf pc0[i].controller) as string ) catch ( sc = (classOf pc0[i]) as string )
					s += "    [" + (i as string) + "] " + sc
					if (findString sc "Expression") != undefined do
					(
						try ( s += "  expr=" + (pc0[i].controller.getExpression()) ) catch ( s += "  exprERR" )
					)
					s += "\n"
				)
			) catch ()
		)
		local pc = o.position.controller
		s += "  posCtrl=" + ((classOf pc) as string) + "\n"
		try (
			s += "    count=" + ((pc.count) as string) + "\n"
			for i = 1 to pc.count do
			(
				local sc2 = "-"
				try ( sc2 = (classOf pc[i].controller) as string ) catch ( sc2 = (classOf pc[i]) as string )
				s += "    [" + (i as string) + "] " + sc2 + "\n"
			)
		) catch ()
		local w = "-"
		try ( w = (get_wired_params o) as string ) catch ()
		s += "  wire=" + w + "\n"
		s
	)

	for nm in names do out += dumpOne nm
	out
)
