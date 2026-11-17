-- 简化：n 的 position 子控制器探测
(
	local out = ""
	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	if n == undefined then out += "MISSING\n"
	else
	(
		local p2 = n.position.controller[2]
		out += "p2 class=" + ((classOf p2) as string) + "\n"
		out += "p2 value=" + ((p2.value) as string) + "\n"
		try ( out += "p2.numSubs=" + (p2.numSubs as string) + "\n" ) catch ()
		try ( out += "p2.getSubCtrl 1=" + ((classOf (p2.getSubCtrl 1)) as string) + "\n" ) catch ( out += "getSubCtrl ERR\n" )
		try ( out += "p2.x=" + ((p2.x) as string) + "\n" ) catch ( out += "p2.x ERR\n" )
		try ( out += "p2[1]=" + ((p2[1]) as string) + "\n" ) catch ( out += "p2[1] ERR\n" )
		try ( out += "p2.controller=" + ((classOf p2.controller) as string) + "\n" ) catch ()
		try ( out += "p2.ctrl=" + ((classOf p2.ctrl) as string) + "\n" ) catch ()

		local r2 = n.rotation.controller[2]
		out += "r2 class=" + ((classOf r2) as string) + "\n"
		out += "r2 value=" + ((r2.value) as string) + "\n"

		try ( out += "wire=" + ((getWiredParams n) as string) + "\n" ) catch ()

		local saved = n.transform
		move n [0,0,10]
		out += "after Z+10 pos=" + ((n.position) as string) + " wpos=" + (((n.transform).row4) as string) + "\n"
		n.transform = saved
	)
	out
)

