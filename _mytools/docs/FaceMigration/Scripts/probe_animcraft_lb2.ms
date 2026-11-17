-- 左眉控制实际拖动后的 p2 值与骨骼位移
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )

	local n = getNodeByName "Animcraft_Left_Brow_Ctrl"
	local names = #("Bone007","Bone008","Bone009")
	local base = #()
	for nm in names do append base (getPos (getNodeByName nm))

	fn dump tag =
	(
		local s = "== " + tag + "  p2=" + (pstr (n.position.controller[2].value)) + "\n"
		for i = 1 to names.count do
		(
			local o = getNodeByName names[i]
			local d = (getPos o) - base[i]
			s += "  " + names[i] + " dP=" + (pstr d) + "\n"
		)
		s
	)

	n.position.controller[2].value = [0,0,0]
	out += dump "base"
	local saved = n.transform
	move n [0,0,10]
	out += dump "move +10Z"
	move n [0,0,-20]
	out += dump "move -20Z (stacked from +10)"
	n.transform = saved
	n.position.controller[2].value = [0,0,0]
	out += dump "restored"
	out
)
