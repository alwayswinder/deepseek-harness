-- 读取驱动右眉的 Position Expression 公式与变量绑定
(
	local out = ""
	fn dumpExpr oName =
	(
		local s = "## " + oName + "\n"
		local o = getNodeByName oName
		if o == undefined then return (s + "  MISSING\n")
		local pc = o.position.controller
		s += "  posCtrl=" + ((classOf pc) as string) + "\n"
		local expr = undefined
		try (
			if ((classOf pc) as string) == "position_list" then
			(
				for i = 1 to pc.count do
				(
					 local c = pc[i].controller
					 local cs = (classOf c) as string
					 s += "   [" + (i as string) + "] " + cs + "\n"
					 if (findString cs "Expression") != undefined do expr = c
				)
			)
			else if (findString ((classOf pc) as string) "Expression") != undefined do expr = pc
		) catch ( s += "   (list walk failed)\n" )

		if expr == undefined then ( s + "  no expression found\n" )
		else
		(
			local code = ""
			try ( code = expr.getExpression() ) catch ( code = "<getExpression failed>" )
			s += "  EXPR:\n" + code + "\n"
			try (
				local nv = expr.getNumVariables()
				s += "  vars=" + (nv as string) + "\n"
				for i = 1 to nv do
				(
					local vn = "?"
					local vt = "?"
					try ( vn = expr.getVariableName i ) catch ()
					try ( vt = (expr.getVariableTarget i) as string ) catch ()
					s += "    " + (i as string) + ": " + vn + " -> " + vt + "\n"
				)
			) catch ( s += "  (var api failed)\n" )
			s
		)
	)

	for nm in #("meibu_R","KPoint051","KPoint052","KPoint053","ZPoint051") do
		out += dumpExpr nm

	-- Rider: 骨骼到底跟谁
	out += "== DEPENDENTS ==\n"
	for nm in #("Animcraft_Right_Brow_Z_Ctrl","Animcraft_Right_Brow_Ctrl","KPoint051") do
	(
		local o = getNodeByName nm
		if o != undefined do
		(
			local deps = ""
			try ( deps = (refs.dependentNodes o) as string ) catch ( deps = "-" )
			out += "  " + nm + " -> " + deps + "\n"
		)
	)
	out
)
