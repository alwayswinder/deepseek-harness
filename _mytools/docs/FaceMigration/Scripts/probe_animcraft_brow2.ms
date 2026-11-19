-- 探测 Animcraft_Right_Brow_Z_Ctrl 的控制器结构 + 三轴/三转的实际驱动目标
(
	local out = ""
	local targetName = "Animcraft_Right_Brow_Z_Ctrl"
	local n = getNodeByName targetName
	if n == undefined then
	(
		"TARGET MISSING"
	)
	else
	(
		fn getPos o =
		(
			local p = [0,0,0]
			try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
			p
		)

		local pc = n.position.controller
		out += "== POSITION CONTROLLER ==\n"
		out += "  class=" + ((classOf pc) as string) + "\n"
		try ( out += "  count=" + ((pc.count) as string) + " active=" + ((pc.active) as string) + "\n" ) catch ( out += "  count=<n/a>\n" )
		try (
			for i = 1 to pc.count do
			(
				local sc = "-"
				try ( sc = (classOf pc[i].controller) as string ) catch ( sc = (classOf pc[i]) as string )
				out += "   [" + (i as string) + "] " + sc + "\n"
			)
		) catch ( out += "  list items <n/a>\n" )

		local startPos = n.pos
		local startRot = n.rotation
		local names = for o in objects collect o.name
		local base = for o in objects collect (getPos o)

		fn doMove ax =
		(
			n.pos = startPos
			n.rotation = startRot
			case ax of
			(
				#x: ( n.pos += [10, 0, 0] )
				#y: ( n.pos += [0, 10, 0] )
				#z: ( n.pos += [0, 0, 10] )
				#rx: ( n.rotation = startRot * ((eulerangles 10 0 0) as quat) )
				#ry: ( n.rotation = startRot * ((eulerangles 0 10 0) as quat) )
				#rz: ( n.rotation = startRot * ((eulerangles 0 0 10) as quat) )
			)
			local cur = for o in objects collect (getPos o)
			local s = "== " + (ax as string) + " +10 ==\n"
			local hits = 0
			for i = 1 to objects.count do
			(
				local d = cur[i] - base[i]
				if (length d) > 0.001 do
				(
					hits += 1
					s += "   " + names[i] + " (" + ((classOf objects[i]) as string) + ") d=" + ((d as string)) + "\n"
				)
			)
			if hits == 0 do s += "   <no change>\n"
			s
		)

		for ax in #(#x, #y, #z, #rx, #ry, #rz) do out += doMove ax

		n.pos = startPos
		n.rotation = startRot

		out += "== SKELETON NEAR BROW ==\n"
		for b in #("meibu_L","meibu_R","Bone006","Bone007","Bone008","Bone009","Bone010","Bone011","Bone012","Bone013") do
		(
			local o = getNodeByName b
			if o == undefined then out += "  " + b + " MISSING\n"
			else out += "  " + b + " pos=" + ((getPos o) as string) + " parent=" + (if o.parent != undefined then o.parent.name else "-") + "\n"
		)

		out
	)
)
