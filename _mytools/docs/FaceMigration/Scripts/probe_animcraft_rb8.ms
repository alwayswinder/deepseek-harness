-- 恢复 n 的初始位置值，核对骨骼基线
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn eulerOf o = ( try ( (o.transform).rotation as eulerangles ) catch ( [0,0,0] ) )

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	local b = getNodeByName "Bone010"

	out += "before: n.p2=" + (pstr (n.position.controller[2].value)) + " b.wpos=" + (pstr (getPos b)) + "\n"
	n.position.controller[2].value = [0,0,-1]
	out += "after set [0,0,-1]: n.p2=" + (pstr (n.position.controller[2].value)) + " b.wpos=" + (pstr (getPos b)) + "\n"
	for nm in #("Bone010","Bone011","Bone012") do
	(
		local o = getNodeByName nm
		out += "  " + nm + " p=" + (pstr (getPos o)) + " e=" + ((eulerOf o) as string) + "\n"
	)
	out
)
