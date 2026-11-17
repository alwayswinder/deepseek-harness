-- 查 Skin 修改器属性（是否 DQ）、Morpher 可用接口、Bone028 附近顶点权重与 DQ 权重
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")

	local head = getNodeByName "Seven_Head"
	local sm = head.modifiers[#Skin]
	out += "== Skin properties ==\n"
	local props = getPropNames sm
	for p in props do
	(
		local v = "-"
		try ( v = (getProperty sm p) as string ) catch ()
		if (findString (toLower (p as string)) "dq") != undefined or (findString (toLower (p as string)) "dual") != undefined or (findString (toLower (p as string)) "boneaffect") != undefined do
			out += "  " + (p as string) + " = " + v + "\n"
	)
	out += "  boneAffectLimit=" + ((try ((sm.boneAffectLimit) as string) catch ("-")) ) + "\n"
	out += "  allPropCount=" + (props.count as string) + "\n"

	out += "== Morpher methods ==\n"
	local mor = head.modifiers[#Morpher]
	local mprops = getPropNames mor
	local mout = ""
	for p in mprops do
	(
		local pn = toLower (p as string)
		if (findString pn "channel") != undefined or (findString pn "name") != undefined or (findString pn "value") != undefined or (findString pn "morph") != undefined do
			mout += "  " + (p as string) + "\n"
	)
	out += mout
	out += "  methodNames="
	try ( out += ((getPropNames mor) as string) ) catch ()
	out += "\n"

	-- 顶点：Bone028 附近
	local bp = (getNodeByName "Bone028").transform.row4
	local nv = polyop.getNumVerts head
	out += "== verts near Bone028 (total " + (nv as string) + ") ==\n"
	local near = #()
	for v = 1 to nv do
	(
		local vp = polyop.getVert head v
		local d = distance vp bp
		if d < 2.5 do append near #(v, d)
	)
	out += "  near=" + (near.count as string) + "\n"
	local shown = 0
	for item in near do
	(
		if shown < 5 do
		(
			shown += 1
			local v = item[1]
			out += "  v" + (v as string) + " d=" + (item[2] as string) + "\n"
			local nb = 0
			try ( nb = skinOps.GetVertexWeightCount sm v ) catch ()
			for b = 1 to nb do
			(
				local bi = 0
				local bw = 0.0
				try ( bi = skinOps.GetVertexWeightBoneID sm v b ) catch ()
				try ( bw = skinOps.GetVertexWeight sm v b ) catch ()
				local bn = "?"
				try ( bn = (skinOps.GetBoneName sm bi 0) ) catch ( bn = ("id" + (bi as string)) )
				out += "     " + bn + " w=" + (bw as string) + "\n"
			)
			local dqw = "-"
			try ( dqw = (skinOps.getVertexDQWeight sm v) as string ) catch ()
			out += "     DQweight=" + dqw + "\n"
		)
	)
	out
)
