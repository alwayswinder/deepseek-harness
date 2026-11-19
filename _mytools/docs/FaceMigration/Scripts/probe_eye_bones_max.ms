-- 对比 Max 与 UE 的眼球/眼睑骨骼世界坐标
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	local names = #("Eye_R","Eye_L","Eye_R01","Eye_L01","yanqiu_R","yanqiu_L","yankuang_R","yankuang_L","Bone027","Bone028","Bone029","Bone036","Bone037","Bone038")
	for nm in names do
	(
		local o = getNodeByName nm
		if o == undefined then out += nm + " MISSING\n" else
		(
			local par = "-"
			try ( par = o.parent.name ) catch ()
			out += nm + " (" + ((classOf o) as string) + ") wpos=" + (pstr (o.transform.row4)) + " parent=" + par + "\n"
		)
	)
	-- 眼球网格对象
	out += "== eye meshes ==\n"
	for o in objects where ((findString (toLower o.name) "yanqiu") != undefined or (findString (toLower o.name) "eye") != undefined or (findString (toLower o.name) "pupil") != undefined) do
		out += "  " + o.name + " (" + ((classOf o) as string) + ") wpos=" + (pstr (o.transform.row4)) + "\n"
	out
)
