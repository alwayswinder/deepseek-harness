-- SYP 端点时骨骼世界四元数（右眼与左眼）
(
	local out = ""
	fn qstr q = ("[" + ((q.x) as string) + "," + ((q.y) as string) + "," + ((q.z) as string) + "," + ((q.w) as string) + "]")

	local nR = getNodeByName "SYP_R001"
	local nL = getNodeByName "SYP_L001"
	local bones = #("Bone027","Bone028","Bone029","Bone036","Bone037","Bone038")

	local base = #()
	for b in bones do append base ((getNodeByName b).transform.rotation)

	out += "base:\n"
	for i = 1 to bones.count do out += "  " + bones[i] + " " + (qstr base[i]) + "\n"

	local savedR = nR.transform
	local savedL = nL.transform
	nR.position.controller[2].value = [0,-1.75,0]
	nL.position.controller[2].value = [0,-1.75,0]
	out += "endpoint:\n"
	for i = 1 to bones.count do out += "  " + bones[i] + " " + (qstr ((getNodeByName bones[i]).transform.rotation)) + "\n"
	nR.transform = savedR
	nL.transform = savedL
	nR.position.controller[2].value = [0,0,0]
	nL.position.controller[2].value = [0,0,0]
	out
)
