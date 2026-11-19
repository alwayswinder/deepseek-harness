-- 扫描 n 的局部位置值，测 K 点/骨骼响应
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)

	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	local b = getNodeByName "Bone010"
	local kp = getNodeByName "KPoint051"
	local savedN = n.transform
	local baseB = getPos b
	local baseK = getPos kp

	out += "base b=" + (pstr baseB) + " k=" + (pstr baseK) + "\n"
	for v in #([0,0,0],[0,1,0],[0,2,0],[0,3,0],[0,-1,0],[0,-2,0],[0,-3,0],[0,0,1],[0,0,-1],[0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1],[0,2,1],[0,2,-1],[0,-2,1],[0,-2,-1]) do
	(
		n.transform = savedN
		n.position.controller[2].value = v
		local curB = getPos b
		local curK = getPos kp
		local dB = curB - baseB
		local dK = curK - baseK
		out += "  v=" + (pstr v) + " dB=" + (pstr dB) + " dK=" + (pstr dK) + " actual=" + (pstr (n.position.controller[2].value)) + "\n"
	)
	n.transform = savedN
	out
)
