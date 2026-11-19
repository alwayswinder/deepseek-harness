-- Seven_Head 修改器列表
(
	local out = ""
	for nm in #("Seven_Head","Seven_1_3","Seven_Head01") do
	(
		local o = getNodeByName nm
		if o == undefined then out += nm + " MISSING\n"
		else
		(
			out += "== " + nm + " (" + ((classOf o) as string) + ") verts=" + (try ((o.numVerts) as string) catch ("?")) + "\n"
			for m in o.modifiers do out += "  mod: " + ((classOf m) as string) + "\n"
		)
	)
	out
)
