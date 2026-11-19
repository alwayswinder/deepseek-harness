-- 对照：拖 n 时 K 点/骨骼的变化，以及手动改 K 点是否驱动骨骼
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
	local kp = getNodeByName "KPoint051"
	local b = getNodeByName "Bone010"

	fn state tag =
	(
		local s = tag
		try ( s += " n.p2=" + (pstr (n.position.controller[2].value)) ) catch ()
		try ( s += " kp.p2=" + (pstr (kp.position.controller[2].value)) ) catch ()
		try ( s += " kp.wpos=" + (pstr (getPos kp)) ) catch ()
		try ( s += " b.wpos=" + (pstr (getPos b)) ) catch ()
		s += "\n"
		s
	)

	out += state "base"
	local savedN = n.transform
	local savedK = kp.transform

	move n [0,0,10]
	out += state "n Z+10"
	move n [0,0,-20]
	out += state "n Z-20"
	n.transform = savedN

	-- 手动改 K 点 XYZ 层，看骨骼是否跟随
	for v in #([0.5,0.5,0.5], [2,2,2], [-2,-2,-2]) do
	(
		kp.transform = savedK
		kp.position.controller[2].value = v
		out += state ("kp.p2=" + (pstr v))
	)
	kp.transform = savedK
	out
)
