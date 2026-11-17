-- 用世界空间位移精确量化两个右眉控制器对骨骼的驱动（父级缩放不影响读数）
(
	local out = ""
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)
	fn fmt v = ( "[" + (v.x as string) + ", " + (v.y as string) + ", " + (v.z as string) + "]" )

	local bones = #("meibu_L","meibu_R","Bone007","Bone008","Bone009","Bone010","Bone011","Bone012")

	fn probeCtrl ctrlName axis amt =
	(
		local n = getNodeByName ctrlName
		if n == undefined then return ("MISSING " + ctrlName + "\n")
		local base = for b in bones collect (getPos (getNodeByName b))
		local ctrlBase = getPos n
		local s = "### " + ctrlName + " move " + (axis as string) + " " + (amt as string) + " (world)\n"
		case axis of
		(
			#x: ( move n [amt,0,0] )
			#y: ( move n [0,amt,0] )
			#z: ( move n [0,0,amt] )
		)
		local ctrlDelta = (getPos n) - ctrlBase
		s += "  ctrl moved " + (fmt ctrlDelta) + "\n"
		local dl = [0,0,0]
		local dr = [0,0,0]
		for i = 1 to bones.count do
		(
			local o = getNodeByName bones[i]
			local d = (getPos o) - base[i]
			s += "  " + bones[i] + " d=" + (fmt d) + "\n"
			if bones[i] == "meibu_L" do dl = d
			if bones[i] == "meibu_R" do dr = d
		)
		-- 相对 meibu 的形状差
		s += "  -- relative to meibu_R:"
		for i = 1 to bones.count where (findString bones[i] "Bone") != undefined do
		(
			local o = getNodeByName bones[i]
			local d = (getPos o) - base[i]
			local rel = d - dr
			s += " " + bones[i] + "=" + (fmt rel)
		)
		s += "\n"
		-- 复位
		n.transform = transMatrix (-ctrlDelta) * n.transform
		s
	)

	out += probeCtrl "Animcraft_Right_Brow_Z_Ctrl" #x 10
	out += probeCtrl "Animcraft_Right_Brow_Z_Ctrl" #z 10
	out += probeCtrl "Animcraft_Right_Brow_Ctrl" #x 10
	out += probeCtrl "Animcraft_Right_Brow_Ctrl" #z 10

	-- 左侧对应控制器是否同样驱动左眉
	out += "### Left_Z_Ctrl x 10\n"
	local ln = getNodeByName "Animcraft_Left_Brow_Z_Ctrl"
	if ln == undefined then out += "  MISSING\n"
	else
	(
		local base2 = for b in #("meibu_L","meibu_R","Bone008","Bone011") collect (getPos (getNodeByName b))
		local cb = getPos ln
		move ln [10,0,0]
		local cd = (getPos ln) - cb
		out += "  ctrl moved " + (fmt cd) + "\n"
		local idx = 0
		for b in #("meibu_L","meibu_R","Bone008","Bone011") do
		(
			idx += 1
			local o = getNodeByName b
			out += "  " + b + " d=" + (fmt ((getPos o) - base2[idx])) + "\n"
		)
		ln.transform = transMatrix (-cd) * ln.transform
	)

	out
)
