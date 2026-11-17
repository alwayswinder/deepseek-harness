(
  local o = ""
  o += "maxFile=" + maxFileName + "\n"
  o += "maxFilePath=" + maxFilePath + "\n"
  local f = maxFilePath + maxFileName
  try ( o += "size=" + ((getFileSize f) as string) + " time=" + ((getFileTime f #modify) as string) + "\n" ) catch ( o += "file time err\n" )
  o
)
