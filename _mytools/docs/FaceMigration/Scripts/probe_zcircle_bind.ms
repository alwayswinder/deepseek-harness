-- 只读探测：查找 MeiMao_SX 绑定目标 / 相关命名
(
	local out = ""
	local pats = #("*Mei*", "*SX*", "*眉*", "*Brow*", "*brow*")
	for p in pats do
	(
		out += "== " + p + " ==\n"
		for o in objects where (matchPattern o.name pattern:p) do
			out += "  " + o.name + " | " + ((classOf o) as string) + "\n"
	)

	-- 表达式控制器变量信息尝试
	local kp = getNodeByName "KPoint051"
	if kp != undefined do
	(
		local e = kp.position.controller[3].controller
		out += "== expr props ==\n"
		try ( out += "  vars=" + (e.getNumVariables() as string) + "\n" ) catch ( out += "  getNumVariables ERR\n" )
		try ( out += "  var1name=" + (e.getVariableName 1) + "\n" ) catch ( out += "  getVariableName ERR\n" )
		try ( out += "  var1target=" + (e.getVariableTarget 1) as string + "\n" ) catch ( out += "  getVariableTarget ERR\n" )
		try ( showProperties e ) catch ()
	)

	-- 所有 Point 类的对象里找带 cust attributes 的
	out += "== scene roots ==\n"
	for o in rootNode.children do
		out += "  " + o.name + " | " + ((classOf o) as string) + " children=" + (o.children.count as string) + "\n"

	out
)
