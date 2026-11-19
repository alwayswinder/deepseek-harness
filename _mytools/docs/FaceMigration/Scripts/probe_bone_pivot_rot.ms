-- 验证 Max 骨骼旋转枢轴：绕世界 X 轴旋转 Bone028，看骨骼世界位置是否移动
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
	local o = getNodeByName "Bone028"
	local saved = o.transform
	out += "pos=" + (pstr o.pos) + " wpos=" + (pstr o.transform.row4) + " pivot=" + (pstr o.pivot) + "\n"
	out += "transform=\n" + (o.transform as string) + "\n"
	out += "parent=" + o.parent.name + " parentW=" + (pstr o.parent.transform.row4) + "\n"

	local p0 = o.transform.row4
	rotate o (angleaxis 10 [1,0,0])
	out += "after rot10 worldX: wpos=" + (pstr o.transform.row4) + " dP=" + (pstr (o.transform.row4 - p0)) + "\n"
	o.transform = saved

	local p1 = o.transform.row4
	rotate o (angleaxis 45 [1,0,0])
	out += "after rot45 worldX: wpos=" + (pstr o.transform.row4) + " dP=" + (pstr (o.transform.row4 - p1)) + "\n"
	o.transform = saved
	out
)
