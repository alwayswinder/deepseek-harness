# 给 CUA helper 的输出目录设置 High 完整性标签。
#
# 背景：DSH 的 Windows 沙箱把工作区目录标记为 Low（S-1-16-4096）以便限制写入。
# NTFS 的完整性标签会被可执行文件继承：从带 Low 标签的目录启动的 exe 会以 Low
# 运行，而 UIPI 不允许 Low 进程读取或操作 Medium/High 的目标应用窗口。
# cua-windows 的 helper 恰好构建在工作区内，于是拿不到目标窗口（截图被拒、
# ShellWindows 激活失败）。
#
# 做法：给 native/bin 目录本身设置显式 High 标签并向下继承，这样之后每次
# dotnet publish 覆盖生成的文件都会继承 High，而不是仓库根目录的 Low。
[CmdletBinding()]
param(
    # 仓库根目录；默认从脚本位置（_mytools/build）向上两级推导。
    [string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'

if (-not $RepositoryRoot) {
    $RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

if ($env:OS -ne 'Windows_NT') {
    Write-Verbose 'fix-cua-integrity: not Windows, nothing to do'
    return
}

$bin = Join-Path $RepositoryRoot 'packages/experimental/cua-windows/native/bin'
if (-not (Test-Path -LiteralPath $bin)) {
    Write-Verbose "fix-cua-integrity: no helper output at $bin, skipping"
    return
}

# 显式设置会在已有继承 ACE 之外写入一条 ACE；重复执行是幂等的。
$output = & icacls $bin /setintegritylevel '(OI)(CI)High' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warning "fix-cua-integrity: icacls failed for ${bin}: $output"
}
