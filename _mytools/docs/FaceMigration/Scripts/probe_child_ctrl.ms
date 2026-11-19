-- 子控制器 Animcraft_Right_Brow_Ctrl 的表达式与锁定来源
(
	local out = ""
	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	local pc = n.position.controller
	out += "posCtrl=" + ((classOf pc) as string) + " count=" + ((pc.count) as string) + " active=" + ((pc.active) as string) + "\n"
	for i = 1 to pc.count do
	(
		local cs = "-"
		try ( cs = (classOf pc[i].controller) as string ) catch ( cs = (classOf pc[i]) as string )
		out += "  [" + (i as string) + "] " + cs + "\n"
		local code = ""
		try ( code = pc[i].controller.getExpression() ) catch ( code = "-" )
		if code != "-" do out += "       EXPR: " + code + "\n"
	)

	-- 位置锁定 / 约束看看
	local tl = "-"
	try ( tl = (n.isFrozen) as string ) catch ()
	out += "frozen=" + tl + "\n"
	try ( out += "transformLock=" + ((getTransformLockFlags n) as string) + "\n" ) catch ()

	-- 父控制器 Z_Ctrl 的表达式
	local p = getNodeByName "Animcraft_Right_Brow_Z_Ctrl"
	local ppc = p.position.controller
	out += "== Z_Ctrl ==\n"
	for i = 1 to ppc.count do
	(
		local cs2 = "-"
		try ( cs2 = (classOf ppc[i].controller) as string ) catch ()
		local code2 = ""
		try ( code2 = ppc[i].controller.getExpression() ) catch ()
		out += "  [" + (i as string) + "] " + cs2 + " " + code2 + "\n"
	)

	-- 是否有 script controller
	out += "== transform controller ==\n"
	try ( out += "  " + ((classOf n.transform.controller) as string) + "\n" ) catch ()

	out
)
