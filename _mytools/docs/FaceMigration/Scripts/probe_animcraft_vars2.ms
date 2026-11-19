-- 尝试多种方式读取表达式变量绑定
(
	local out = ""
	local o = getNodeByName "meibu_R"
	local pc = o.position.controller
	local expr = pc[2].controller
	out += "expr class=" + ((classOf expr) as string) + "\n"

	for i = 1 to 6 do
	(
		local line = "  [" + (i as string) + "] "
		try ( line += "getVariableName=" + (expr.getVariableName i) ) catch ( line += "getVariableName=<err>" )
		try ( line += " getVariableTarget=" + ((expr.getVariableTarget i) as string) ) catch ( line += " getVariableTarget=<err>" )
		out += line + "\n"
	)

	for nm in #("K_SXM004","MeiMao_SX") do
	(
		try ( out += "  byName " + nm + " -> " + ((expr.getVariableTarget nm) as string) + "\n" )
		catch ( out += "  byName " + nm + " <err>\n" )
	)

	-- 场景里是否有同名对象
	out += "== scene has ==\n"
	for nm in #("K_SXM004","MeiMao_SX","K_SX_MeiMao_R004") do
	(
		local n2 = getNodeByName nm
		out += "  " + nm + " = " + (if n2 == undefined then "MISSING" else ((classOf n2) as string)) + "\n"
	)

	-- 表达式依赖：直接看 meibu_R 表达式被谁触发
	out += "== parent chain of brow ctrls ==\n"
	for nm in #("Animcraft_Right_Brow_Z_Ctrl","Animcraft_Right_Brow_Ctrl","Point471") do
	(
		local n3 = getNodeByName nm
		if n3 != undefined do
		(
			local chain = ""
			local p = n3.parent
			while p != undefined do
			(
				chain += p.name + " < "
				p = p.parent
			)
			out += "  " + nm + " : " + chain + "\n"
		)
	)

	out
)
