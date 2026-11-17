-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
(
  local out = ""
  local n = getNodeByName "SYP_L001"
  local p2 = n.position.controller[2]
  local orig = p2.value
  out += "orig=" + ((orig) as string) + "\n"
  p2.value = [0, -1.75, 0]
  redrawViews()
  try (
    local dib = gw.getViewportDib()
    dib.filename = (FaceMigrationTempDir + "max_viewport_closed.png")
    save dib
    out += "saved closed\n"
  ) catch ( out += "ERR " + (getCurrentException()) + "\n" )
  p2.value = orig
  redrawViews()
  out
)
