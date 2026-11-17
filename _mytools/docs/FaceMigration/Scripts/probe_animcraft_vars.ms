-- 找出表达式变量的实际绑定对象
(
	local out = ""
	fn dumpVars oName =
	(
		local s = "## " + oName + "\n"
		local o = getNodeByName oName
		if o == undefined then return (s + "  MISSING\n")
		local pc = o.position.controller
		local expr = undefined
		if ((classOf pc) as string) == "position_list" then
		(
			for i = 1 to pc.count do
			(
				local cs = "-"
				try ( cs = (classOf pc[i].controller) as string ) catch ()
				if (findString cs "Expression") != undefined do expr = pc[i].controller
			)
		)
		else if (findString ((classOf pc) as string) "Expression") != undefined do expr = pc
		if expr == undefined then return (s + "  no expr\n")

		s += "  PROPS: "
		try ( s += (getPropNames expr) as string ) catch ( s += "<none>" )
		s += "\n"
		try ( s += "  methods: " + (getPropNames expr true) as string + "\n" ) catch ()

		-- 多种可能的 API
		try (
			local nv = expr.numVariables
			s += "  numVariables=" + (nv as string) + "\n"
		) catch ( s += "  numVariables=<n/a>\n" )
		try (
			local nv = expr.getNumVariables()
			s += "  getNumVariables=" + (nv as string) + "\n"
		) catch ( s += "  getNumVariables=<n/a>\n" )
		try (
			s += "  variableList=" + (expr.variableList) as string + "\n"
		) catch ( s += "  variableList=<n/a>\n" )
		try (
			s += "  objects=" + (expr.objects) as string + "\n"
		) catch ( s += "  objects=<n/a>\n" )
		s
	)

	for nm in #("meibu_R","KPoint051","KPoint052","KPoint053") do out += dumpVars nm

	out += "== K_SXM004 / R004 structure ==\n"
	for nm in #("K_SXM004","K_SXM003","K_SX_MeiMao_R004","K_SX_MeiMao_R003") do
	(
		local o = getNodeByName nm
		if o == undefined then out += "  " + nm + " MISSING\n"
		else
		(
			local par = if o.parent != undefined then o.parent.name else "-"
			local pc = (classOf o.position.controller) as string
			out += "  " + nm + " (" + ((classOf o) as string) + ") parent=" + par + " posCtrl=" + pc + " pos=" + ((o.pos) as string) + "\n"
			local w = "-"
			try ( w = (get_wired_params o) as string ) catch ()
			out += "      wire=" + w + "\n"
		)
	)

	out
)
