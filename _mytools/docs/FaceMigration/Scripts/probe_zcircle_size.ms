-- zCircle 形状尺寸（圆环半径）
(
	local out = ""
	for nm in #("zCircle051","zCircle052","zCircle053","zCircle049","zCircle050","zCircle048","Circle113") do
	(
		local o = getNodeByName nm
		if o == undefined then out += nm + " MISSING\n"
		else
		(
			out += nm + " class=" + ((classOf o) as string)
			try (
				local nv = numKnots o 1
				out += " knots=" + (nv as string) + " scale=" + ((o.scale) as string)
				local mn = [1e9,1e9,1e9]
				local mx = [-1e9,-1e9,-1e9]
				for i = 1 to nv do
				(
					local p = getKnotPoint o 1 i
					mn.x = amin mn.x p.x; mn.y = amin mn.y p.y; mn.z = amin mn.z p.z
					mx.x = amax mx.x p.x; mx.y = amax mx.y p.y; mx.z = amax mx.z p.z
				)
				out += " bboxLocal=" + ((mx-mn) as string)
			) catch ( out += " knotERR" )
			out += "\n"
		)
	)
	out
)
