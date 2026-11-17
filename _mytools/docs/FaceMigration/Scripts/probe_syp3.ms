-- SYP 控制：p2 结构、轴角、有效行程
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn getRot o = ( try ( (o.transform).rotation ) catch ( quat 0 0 0 1 ) )

	local n = getNodeByName "SYP_R001"
	local p2 = n.position.controller[2]
	out += "p2 ctrl=" + ((classOf p2) as string) + " value=" + (pstr (p2.value)) + "\n"
	for i = 1 to 3 do
	(
		local sa = p2[i]
		local cls = "-"
		try ( cls = (classOf sa.controller) as string ) catch ()
		out += "  axis" + (i as string) + "=" + cls
		try ( out += " value=" + ((sa.value) as string) ) catch ()
		out += "\n"
	)

	local bones = #("Bone027","Bone028","Bone029")
	local q0 = #()
	local p0 = #()
	for b in bones do
	(
		local o = getNodeByName b
		append q0 (getRot o)
		append p0 (getPos o)
	)

	local saved = n.transform
	for dy in #(10, 20, 50, 100, -10) do
	(
		n.transform = saved
		move n [0, dy, 0]
		out += "== Y " + (dy as string) + " p2=" + (pstr (p2.value)) + " wpos=" + (pstr (getPos n)) + "\n"
		for i = 1 to bones.count do
		(
			local o = getNodeByName bones[i]
			local q1 = getRot o
			local dq = q1 * (inverse q0[i])
			local ax = dq.axis
			out += "  " + bones[i] + " dP=" + (pstr ((getPos o) - p0[i])) + " angle=" + ((dq.angle) as string) + " axis=" + (pstr ax) + "\n"
		)
	)
	n.transform = saved

	-- 左眉对照
	local nl = getNodeByName "SYP_L001"
	local ql0 = #()
	local pl0 = #()
	local lbones = #("Bone036","Bone037","Bone038")
	for b in lbones do
	(
		local o = getNodeByName b
		append ql0 (getRot o)
		append pl0 (getPos o)
	)
	local savedL = nl.transform
	nl.transform = savedL
	move nl [0, 10, 0]
	out += "== L Y 10 p2=" + (pstr (nl.position.controller[2].value)) + "\n"
	for i = 1 to lbones.count do
	(
		local o = getNodeByName lbones[i]
		local q1 = getRot o
		local dq = q1 * (inverse ql0[i])
		out += "  " + lbones[i] + " dP=" + (pstr ((getPos o) - pl0[i])) + " angle=" + ((dq.angle) as string) + " axis=" + (pstr dq.axis) + "\n"
	)
	nl.transform = savedL
	out
)
