-- SYP 端点：骨骼世界位置 + 四元数
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn qstr q = ("[" + ((q.x) as string) + "," + ((q.y) as string) + "," + ((q.z) as string) + "," + ((q.w) as string) + "]")

	local nR = getNodeByName "SYP_R001"
	local nL = getNodeByName "SYP_L001"
	local bones = #("Bone027","Bone028","Bone029","Bone036","Bone037","Bone038")

	local savedR = nR.transform
	local savedL = nL.transform

	fn dump tag =
	(
		local s = "== " + tag + "\n"
		for b in bones do
		(
			local o = getNodeByName b
			s += "  " + b + " p=" + (pstr ((o.transform).row4)) + " q=" + (qstr ((o.transform).rotation)) + "\n"
		)
		s
	)

	out += dump "base"
	nR.position.controller[2].value = [0,-1.75,0]
	nL.position.controller[2].value = [0,-1.75,0]
	out += dump "endpoint"
	nR.transform = savedR
	nL.transform = savedL
	nR.position.controller[2].value = [0,0,0]
	nL.position.controller[2].value = [0,0,0]
	out
)
