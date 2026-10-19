
global vrSeen
fn vrWalkControllers c arr = (
 if c==undefined or findItem vrSeen c>0 then return arr
 append vrSeen c;append arr c
 for i=1 to c.numSubs do(local sc=(getSubAnim c i).controller;if sc!=undefined do vrWalkControllers sc arr)
 arr
)
global vrControlNames
fn vrCollectNames n=(appendIfUnique vrControlNames n.name;for ch in n.children do vrCollectNames ch)
fn vrRefreshControlNames = (vrControlNames=#();vrCollectNames (getNodeByName "BIPRoot");vrControlNames)
fn vrMappedNode n = (
 if isValidNode n and matchPattern n.name pattern:"SV_*" then getNodeByName (substring n.name 4 200) else n
)
