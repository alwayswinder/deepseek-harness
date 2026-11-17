-- 采样上眼皮闭合过程：Bone028 的世界位置与旋转轨迹，判断是不是绕固定点（虚拟体）旋转
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	local n = getNodeByName "SYP_L001"
	local p2 = n.position.controller[2]
	local orig = p2.value
	local b = getNodeByName "Bone028"
	local e = getNodeByName "Eye_R"
	out += "Eye_R=" + (pstr e.transform.row4) + "\n"
	out += "t,pos,quat(axis,angle)\n"
	for v in #(0.0, -0.25, -0.5, -0.75, -1.0, -1.25, -1.5, -1.75) do
	(
		p2.value = [0, v, 0]
		local t = b.transform.row4
		local q = b.transform.rotation
		out += (v as string) + "  pos=" + (pstr t) + "  ang=" + ((q.angle) as string) + "  ax=" + (pstr q.axis) + "\n"
	)
	p2.value = orig
	out
)
