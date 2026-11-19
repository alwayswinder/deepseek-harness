-- 只读探测：MeiMao_SX 主控 + K 点驱动关系 + 拖动响应
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn getPos o =
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		p
	)

	-- MeiMao_SX 是否存在
	local mx = getNodeByName "MeiMao_SX"
	out += "MeiMao_SX: "
	if mx == undefined then out += "MISSING\n"
	else
	(
		out += mx.name + " (" + ((classOf mx) as string) + ") parent="
		try ( out += mx.parent.name ) catch ( out += "-" )
		out += " wpos=" + (pstr (getPos mx)) + "\n"
		try ( for i = 1 to mx.position.controller.count do out += "  posCtrl[" + (i as string) + "] " + ((classOf mx.position.controller[i].controller) as string) + "\n" ) catch ( out += "  posCtrl=" + ((classOf mx.position.controller) as string) + "\n" )
		try ( out += "  rotCtrl=" + ((classOf mx.rotation.controller) as string) + "\n" ) catch ()
	)

	-- 所有名字含 MeiMao 的对象
	out += "== MeiMao* ==\n"
	for o in objects where (matchPattern o.name pattern:"MeiMao*") do
		out += "  " + o.name + " | " + ((classOf o) as string) + " | wpos=" + (pstr (getPos o)) + "\n"

	-- K 点修改器 & 约束
	for nm in #("KPoint051","KPoint052","KPoint053","KPoint049","KPoint050","KPoint048") do
	(
		local o = getNodeByName nm
		if o == undefined then out += nm + " MISSING\n"
		else
		(
			out += nm + " (" + ((classOf o) as string) + ")\n"
			try (
				for m in o.modifiers do out += "  mod: " + ((classOf m) as string) + "\n"
			) catch ()
			try (
				for c in o.transform.controller.position.controller do
					out += "  positem: " + ((classOf c.controller) as string) + "\n"
			) catch ()
		)
	)

	-- 网格对象上是否有 Morpher
	local meshes = for o in objects where (classOf o == Editable_mesh or classOf o == Editable_Poly or classOf o == PolyMeshObject) collect o
	out += "== mesh objects with Morpher ==\n"
	for o in meshes do
	(
		try (
			for m in o.modifiers where (classOf m == Morpher) do
				out += "  " + o.name + " morpher channels=" + (m.numChannels() as string) + "\n"
		) catch ()
	)

	out
)
