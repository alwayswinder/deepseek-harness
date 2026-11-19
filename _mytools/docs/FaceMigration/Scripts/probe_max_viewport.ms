-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
(
  local out = ""
  try (
    local dib = gw.getViewportDib()
    dib.filename = (FaceMigrationTempDir + "max_viewport.png")
    save dib
    out += "saved " + ((getFileSize (FaceMigrationTempDir + "max_viewport.png")) as string) + "\n"
  ) catch ( out += "ERR " + (getCurrentException()) + "\n" )
  out
)
