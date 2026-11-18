<#
.SYNOPSIS
    去掉豆包生成图右下角的「豆包AI生成」水印。

.DESCRIPTION
    水印是服务端烙进像素的，没有无水印原图可取；这里用周围画面把它补上。
    背景均匀（天空、地面、桌面）时几乎看不出，压在人脸或密集细节上会糊一块。

    依赖 Pillow 与 numpy（系统 python 自带即可）。

.PARAMETER Path
    单个图片，或一个包含图片的目录。

.PARAMETER OutDir
    输出目录，默认写在源文件旁边，文件名后缀 -nowm。

.EXAMPLE
    .\remove-doubao-watermark.ps1 -Path D:\AI\Tmp\doubao-cache -OutDir D:\AI\Tmp\doubao-nowm
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'remove-doubao-watermark.py'
if (-not (Test-Path $script)) {
    throw "找不到实现脚本：$script"
}

$cliArgs = @($script, '--path', $Path)
if ($OutDir) {
    $cliArgs += @('--out', $OutDir)
}

& python @cliArgs
exit $LASTEXITCODE
