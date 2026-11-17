-- 诊断上眼皮：Morpher 通道 + p2 全行程变化骨骼（顶点权重另跑）
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )
	fn getRot o = ( try ( (o.transform).rotation ) catch ( quat 0 0 0 1 ) )

	local head = getNodeByName "Seven_Head"
	out += "head base class=" + ((classOf head.baseobject) as string) + "\n"
	local mor = undefined
	try ( mor = head.modifiers[#Morpher] ) catch ()
	out += "== Morpher on Seven_Head ==\n"
	if mor == undefined then out += "  none\n" else
	(
		local nch = -1
		try ( nch = mor.numberOfChannels() ) catch ( out += "  numberOfChannels ERR\n" )
		out += "  numberOfChannels=" + (nch as string) + "\n"
		for i = 1 to 80 do
		(
			local nm = undefined
			try ( nm = mor.GetName i ) catch ( nm = undefined )
			if nm != undefined do
			(
				local v = 0.0
				try ( v = mor.GetValue i ) catch ()
				out += "  ch" + (i as string) + " name=" + nm + " value=" + (v as string) + "\n"
			)
		)
	)

	out += "== p2 scan ==\n"
	local n = getNodeByName "SYP_L001"
	local p2 = n.position.controller[2]
	local orig = p2.value
	out += "  orig p2=" + (pstr orig) + "\n"

	local objs = for o in objects collect o
	p2.value = [0,0,0]
	local openP = for o in objs collect (getPos o)
	local openQ = for o in objs collect (getRot o)

	p2.value = [0,-1.75,0]
	out += "== changed by closing (p2 -1.75) ==\n"
	local hits = 0
	for i = 1 to objs.count do
	(
		local dp = (getPos objs[i]) - openP[i]
		local dq = (getRot objs[i]) * (inverse openQ[i])
		if (length dp) > 0.0005 or (abs dq.angle) > 0.01 do
		(
			hits += 1
			local cr = "-"
			try ( cr = (classOf objs[i]) as string ) catch ()
			out += "  " + objs[i].name + " (" + cr + ") dP=" + (pstr dp) + " ang=" + ((dq.angle) as string) + " ax=" + (pstr dq.axis) + "\n"
		)
	)
	out += "  totalHits=" + (hits as string) + "\n"

	p2.value = orig
	out
)
