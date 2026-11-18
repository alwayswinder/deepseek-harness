<#
.SYNOPSIS
    从「豆包工作」的 Chromium HTTP 缓存里取出它生成的图片原图。

.DESCRIPTION
    豆包不提供下载入口：点缩略图不打开大图，悬停没有下载浮层，右键菜单被页面禁用，
    下载目录里也不会落文件。但渲染用的 PNG 会进 Chromium 缓存，
    且这些缓存条目从文件偏移 0 起就是完整的 PNG，可以直接复制出来用。

    只读缓存，不修改、不删除任何缓存文件。

.PARAMETER Count
    取最近几张，默认 1。

.PARAMETER OutDir
    输出目录，默认 $env:TEMP\doubao-images。

.PARAMETER After
    只要这个时间之后写入的缓存条目，默认一天内。

.EXAMPLE
    .\grab-doubao-image.ps1 -Count 3 -OutDir D:\AI\Tmp\doubao
#>
[CmdletBinding()]
param(
    [int]$Count = 1,
    [string]$OutDir,
    [datetime]$After = (Get-Date).AddDays(-1)
)

$ErrorActionPreference = 'Stop'

$cacheRoot = Join-Path $env:LOCALAPPDATA 'DoubaoWork\User Data\Default\Cache\Cache_Data'
if (-not (Test-Path $cacheRoot)) {
    throw "找不到豆包的缓存目录：$cacheRoot"
}
if (-not $OutDir) {
    $OutDir = Join-Path $env:TEMP 'doubao-images'
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Get-PngSize {
    param([System.IO.FileInfo]$File)
    $stream = [System.IO.File]::Open($File.FullName, 'Open', 'Read', 'ReadWrite')
    try {
        $header = New-Object byte[] 24
        $read = $stream.Read($header, 0, 24)
        if ($read -lt 24) { return $null }
        if ($header[0] -ne 0x89 -or $header[1] -ne 0x50 -or $header[2] -ne 0x4E -or $header[3] -ne 0x47) { return $null }
        $width = ([int]$header[16] -shl 24) -bor ([int]$header[17] -shl 16) -bor ([int]$header[18] -shl 8) -bor [int]$header[19]
        $height = ([int]$header[20] -shl 24) -bor ([int]$header[21] -shl 16) -bor ([int]$header[22] -shl 8) -bor [int]$header[23]
        return @{ Width = $width; Height = $height }
    } finally {
        $stream.Dispose()
    }
}

$candidates = Get-ChildItem $cacheRoot -File |
    Where-Object { $_.Length -gt 200KB -and $_.LastWriteTime -gt $After } |
    Sort-Object LastWriteTime -Descending

$taken = 0
foreach ($file in $candidates) {
    if ($taken -ge $Count) { break }
    $size = Get-PngSize -File $file
    if (-not $size) { continue }
    # 豆包生成的插画是 1536x1536；小图是界面图标，跳过。
    if ($size.Width -lt 512 -or $size.Height -lt 512) { continue }

    # 同一秒可能写入多条不同尺寸的缓存，序号保证不互相覆盖。
    $name = 'doubao-{0}-{1}x{2}-{3}.png' -f $file.LastWriteTime.ToString('yyyyMMdd-HHmmss'), $size.Width, $size.Height, ($taken + 1)
    $dest = Join-Path $OutDir $name
    $stream = [System.IO.File]::Open($file.FullName, 'Open', 'Read', 'ReadWrite')
    try {
        $target = [System.IO.File]::Create($dest)
        try { $stream.CopyTo($target) } finally { $target.Dispose() }
    } finally {
        $stream.Dispose()
    }

    $taken++
    [pscustomobject]@{
        File     = $dest
        Width    = $size.Width
        Height   = $size.Height
        Bytes    = (Get-Item $dest).Length
        CachedAt = $file.LastWriteTime
    }
}

if ($taken -eq 0) {
    Write-Warning "在 $After 之后没有找到可用的缓存图片。"
}
