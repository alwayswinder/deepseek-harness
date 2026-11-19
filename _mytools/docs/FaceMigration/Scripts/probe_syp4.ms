-- SYP 左右完整行程 + limiter 范围
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn getRot o = ( try ( (o.transform).rotation ) catch ( quat 0 0 0 1 ) )

	local nR = getNodeByName "SYP_R001"
	local p2 = nR.position.controller[2]
	out += "R limiter: "
	for i = 1 to 3 do
	(
		local sa = p2[i].controller
		local lo = "-"
		local hi = "-"
		try ( lo = (sa.lower_limit) as string ) catch ()
		try ( hi = (sa.upper_limit) as string ) catch ()
		out += "axis" + (i as string) + "[" + lo + "," + hi + "] "
	)
	out += "\n"

	local bonesR = #("Bone027","Bone028","Bone029")
	local qR = #()
	local pR = #()
	for b in bonesR do ( append qR (getRot (getNodeByName b)); append pR (getPos (getNodeByName b)) )

	local nL = getNodeByName "SYP_L001"
	local bonesL = #("Bone036","Bone037","Bone038")
	local qL = #()
	local pL = #()
	for b in bonesL do ( append qL (getRot (getNodeByName b)); append pL (getPos (getNodeByName b)) )

	local savedR = nR.transform
	local savedL = nL.transform

	for dy in #(20, 50, 100, 150, 200) do
	(
		nR.transform = savedR
		move nR [0, dy, 0]
		out += "== R Y " + (dy as string) + " p2=" + (pstr (p2.value)) + "\n"
		for i = 1 to 3 do
		(
			local o = getNodeByName bonesR[i]
			local dq = (getRot o) * (inverse qR[i])
			out += "  " + bonesR[i] + " dP=" + (pstr ((getPos o) - pR[i])) + " ang=" + ((dq.angle) as string) + " ax=" + (pstr dq.axis) + "\n"
		)
		nL.transform = savedL
		move nL [0, dy, 0]
		out += "== L Y " + (dy as string) + " p2=" + (pstr (nL.position.controller[2].value)) + "\n"
		for i = 1 to 3 do
		(
			local o2 = getNodeByName bonesL[i]
			local dq2 = (getRot o2) * (inverse qL[i])
			out += "  " + bonesL[i] + " dP=" + (pstr ((getPos o2) - pL[i])) + " ang=" + ((dq2.angle) as string) + " ax=" + (pstr dq2.axis) + "\n"
		)
	)
	nR.transform = savedR
	nL.transform = savedL
	out
)

