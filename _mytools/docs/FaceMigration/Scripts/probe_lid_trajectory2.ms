-- 采样上眼皮闭合过程：左眼(SYP_L001→Bone037)、右眼(SYP_R001→Bone028) 的世界位置轨迹
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	fn sample ctrlName boneName eyeName =
	(
		local s = ""
		local n = getNodeByName ctrlName
		local p2 = n.position.controller[2]
		local orig = p2.value
		local b = getNodeByName boneName
		local e = getNodeByName eyeName
		s += "== " + ctrlName + " -> " + boneName + "  eye=" + (pstr e.transform.row4) + "  pivot=" + (pstr b.pivot) + "\n"
		for v in #(0.0, -0.25, -0.5, -0.75, -1.0, -1.25, -1.5, -1.75) do
		(
			p2.value = [0, v, 0]
			local t = b.transform.row4
			s += "  p2=" + (v as string) + " pos=" + (pstr t) + " d=" + (pstr (t - b.transform.row4)) + "\n"
		)
		p2.value = orig
		s
	)
	out += sample "SYP_L001" "Bone037" "Eye_L"
	out += sample "SYP_R001" "Bone028" "Eye_R"
	out
)
