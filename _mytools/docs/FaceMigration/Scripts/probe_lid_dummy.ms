-- 找虚拟体：扫描 p2 变化时旋转（而非位移）的对象，并打印 Point004 结构
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn getRot o = ( try ( (o.transform).rotation ) catch ( quat 0 0 0 1 ) )

	local n = getNodeByName "SYP_L001"
	local p2 = n.position.controller[2]
	local orig = p2.value

	-- 结构
	local p4 = getNodeByName "Point004"
	if p4 != undefined then
	(
		out += "Point004 wpos=" + (pstr (getPos p4)) + " parent=" + (p4.parent.name) + "\n"
		local ch = ""
		for c in p4.children do ch += c.name + " "
		out += "  children=" + ch + "\n"
		local anc = ""
		local q = p4
		for i = 1 to 5 while q != undefined do ( anc += q.name + " <- "; q = q.parent )
		out += "  chain=" + anc + "\n"
	)

	local objs = for o in objects collect o
	local baseQ = for o in objs collect (getRot o)
	local baseP = for o in objs collect (getPos o)
	p2.value = [0,-1.75,0]
	out += "== rotated objects (not translated) at p2=-1.75 ==\n"
	for i = 1 to objs.count do
	(
		local dq = (getRot objs[i]) * (inverse baseQ[i])
		local dp = (getPos objs[i]) - baseP[i]
		if (abs dq.angle) > 1.0 then
			out += "  " + objs[i].name + " (" + ((classOf objs[i]) as string) + ") ang=" + ((dq.angle) as string) + " ax=" + (pstr dq.axis) + " dP=" + (pstr dp) + " wpos=" + (pstr (getPos objs[i])) + "\n"
	)
	p2.value = orig
	out
)
