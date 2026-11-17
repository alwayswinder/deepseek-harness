-- 恢复：逐条 try
(
	local out = ""
	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	try ( out += "n.p2=" + ((n.position.controller[2].value) as string) + "\n" ) catch ( out += "n.p2 ERR\n" )
	try (
		for nm in #("KPoint051","KPoint052","KPoint053") do
		(
			local kp = getNodeByName nm
			kp.position.controller[2].value = [0,0,0]
			out += nm + " reset\n"
		)
	) catch ( out += "kp reset ERR\n" )
	try ( n.position.controller[2].value = [0,0,-1] ) catch ( out += "n set ERR\n" )
	try ( out += "n.p2 after=" + ((n.position.controller[2].value) as string) + "\n" ) catch ( out += "n.p2 after ERR\n" )
	try (
		for nm in #("Bone010","Bone011","Bone012") do
		(
			local o = getNodeByName nm
			local p = (o.transform).row4
			out += nm + " p=" + ((p) as string) + "\n"
		)
	) catch ( out += "bones ERR\n" )
	out
)
