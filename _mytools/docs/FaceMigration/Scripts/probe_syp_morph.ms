-- 查 SYP_L001 拖动时：驱动骨骼、Morpher 通道值、wire 参数、上眼皮顶点权重来源
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o = ( try ( (o.transform).row4 ) catch ( try ( o.pos ) catch ( [0,0,0] ) ) )

	local n = getNodeByName "SYP_L001"
	if n == undefined then ( out += "MISSING SYP_L001\n" ) else
	(
		out += "## SYP_L001 class=" + ((classOf n) as string) + " parent=" + (n.parent.name) + " wpos=" + (pstr (getPos n)) + "\n"

		-- 所有 Morpher 修改器
		out += "== morphers ==\n"
		for o in objects do
		(
			local m = undefined
			try ( m = o.modifiers[#Morpher] ) catch ()
			if m != undefined do
			(
				local mc = 0
				try ( mc = m.numberOfChannels() ) catch ()
				out += "  mesh=" + o.name + " channels=" + (mc as string) + "\n"
				for c = 1 to (amin mc 100) do
				(
					local v = 0.0
					try ( v = m.GetValue c ) catch ()
					if (abs v) > 0.0001 do out += "    ch" + (c as string) + " name=" + (m.GetName c) + " v=" + (v as string) + "\n"
				)
			)
		)

		-- wire 参数
		out += "== wire params on SYP_L001 ==\n"
		local wc = 0
		try ( wc = n.wire.numWires() ) catch ()
		out += "  wires=" + (wc as string) + "\n"

		-- 移动响应
		local base = for o in objects collect (getPos o)
		local saved = n.transform
		move n [0,10,0]
		out += "== changed objects (world Y+10) ==\n"
		local hits = 0
		for i = 1 to objects.count do
		(
			local d = (getPos objects[i]) - base[i]
			if (length d) > 0.0005 do
			(
				hits += 1
				if hits <= 60 do out += "  " + objects[i].name + " (" + ((classOf objects[i]) as string) + ") d=" + (pstr d) + "\n"
			)
		)
		out += "  totalHits=" + (hits as string) + "\n"

		-- Morpher 值是否变化
		out += "== morpher values after move ==\n"
		for o in objects do
		(
			local m = undefined
			try ( m = o.modifiers[#Morpher] ) catch ()
			if m != undefined do
			(
				local mc = 0
				try ( mc = m.numberOfChannels() ) catch ()
				for c = 1 to (amin mc 100) do
				(
					local v = 0.0
					try ( v = m.GetValue c ) catch ()
					if (abs v) > 0.0001 do out += "  " + o.name + " ch" + (c as string) + " v=" + (v as string) + "\n"
				)
			)
		)
		n.transform = saved
	)
	out
)
