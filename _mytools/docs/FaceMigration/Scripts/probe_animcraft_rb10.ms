-- 找原始基准：试 z=0 与 z=-1
(
	local out = ""
	local n = getNodeByName "Animcraft_Right_Brow_Ctrl"
	for v in #([0,0,0],[0,0,-1],[0,0,1]) do
	(
		n.position.controller[2].value = v
		local b = getNodeByName "Bone010"
		local kp = getNodeByName "KPoint051"
		out += "v=" + ((v) as string) + " b=" + (((b.transform).row4) as string) + " kp=" + (((kp.transform).row4) as string) + "\n"
	)
	n.position.controller[2].value = [0,0,0]
	out
)
