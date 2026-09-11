# verify-clean.ps1 — 重启后运行，确认木马与恶意 WDAC 策略是否已清除
#
# 本脚本【只读】，不修改、不删除任何东西。直接右键"使用 PowerShell 运行"即可。
# 用法：
#   powershell -ExecutionPolicy Bypass -File "<仓库路径>\_mytools\reports\incident-2026-09-10\verify-clean.ps1"
#
# 生成背景见同目录的 2026-09-10-malware-incident-report.md

$ErrorActionPreference = 'Continue'
$fail = 0
$warn = 0

function Check($desc, $ok, $detail) {
    if ($ok) { Write-Host ("[通过] " + $desc) -ForegroundColor Green }
    else {
        Write-Host ("[异常] " + $desc + "  ->  " + $detail) -ForegroundColor Red
        $script:fail++
    }
}
function Warn($desc, $detail) {
    Write-Host ("[注意] " + $desc + "  ->  " + $detail) -ForegroundColor Yellow
    $script:warn++
}

Write-Host ""
Write-Host "===== 主机: $env:COMPUTERNAME  用户: $env:USERDOMAIN\$env:USERNAME  时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="
Write-Host ""

# ---------- 1. 计划任务 ----------
Write-Host "--- 1. 计划任务 ---"
$badTasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.TaskName -in @('Eqk9P', 'M2Qrn') -or $_.TaskName -like '*7DkNk*' -or $_.TaskName -like '*Dmnhk*'
})
Check "4 个恶意计划任务已清除" ($badTasks.Count -eq 0) ("仍存在: " + ($badTasks.TaskName -join ', '))

# 所有任务中动作指向可疑路径的
$suspTasks = @(Get-ScheduledTask -ErrorAction SilentlyContinue | ForEach-Object {
    $t = $_; foreach ($a in $t.Actions) {
        if ($a.Execute -match 'Users\\Public\\[A-Za-z0-9]{5,}|Users\\Default\\[A-Za-z0-9]{5,}|AppData\\Local\\Local\\') { "$($t.TaskPath)$($t.TaskName) -> $($a.Execute)" }
    }
})
Check "无其他任务指向可疑路径" ($suspTasks.Count -eq 0) ($suspTasks -join ' | ')

# ---------- 2. 注册表自启动 ----------
Write-Host ""
Write-Host "--- 2. 注册表自启动 (HKLM Run) ---"
$run = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
$badRun = @($run.PSObject.Properties | Where-Object { $_.Name -match 'SecurityHealth' -and $_.Value -notmatch 'system32' })
Check "3 个伪装自启动项已清除" ($badRun.Count -eq 0) ("仍存在: " + ($badRun.Name -join ', '))

# ---------- 3. 服务 ----------
Write-Host ""
Write-Host "--- 3. 服务 ---"
foreach ($s in @('8lvo', 'us43MKZNbD7xEZ9AsTpEGwhEK', 'TCLService')) {
    Check "服务 $s 已删除" (-not (Test-Path "HKLM:\SYSTEM\CurrentControlSet\Services\$s")) "注册表项仍存在"
}
$suspSvc = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services' -ErrorAction SilentlyContinue | ForEach-Object {
    $ip = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).ImagePath
    if ($ip -match 'Users\\Public\\[A-Za-z0-9]{5,}|Users\\Default\\[A-Za-z0-9]{5,}|AppData\\Local\\Local\\') { "$($_.PSChildName) -> $ip" }
})
Check "无其他服务指向可疑路径" ($suspSvc.Count -eq 0) ($suspSvc -join ' | ')

# ---------- 4. WMI 订阅 ----------
Write-Host ""
Write-Host "--- 4. WMI 永久订阅 ---"
$wmi = @(Get-CimInstance -Namespace root\subscription -ClassName __EventFilter -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'CBPUserEventFilter' })
$wmi2 = @(Get-CimInstance -Namespace root\subscription -ClassName CommandLineEventConsumer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'CBPUserCommandLineConsumer' })
Check "WMI 恶意订阅已清除" (($wmi.Count + $wmi2.Count) -eq 0) "订阅仍存在"

# ---------- 5. 文件与目录 ----------
Write-Host ""
Write-Host "--- 5. 恶意文件 / 目录 ---"
foreach ($p in @(
        'C:\Users\Public\mSairk', 'C:\Users\Public\2gZsbf',
        'C:\Program Files (x86)\kDexcm', 'C:\Program Files (x86)\7a27Qo',
        'C:\Users\Default\8arJ',
        "$env:LOCALAPPDATA\Local", "$env:LOCALAPPDATA\CBP",
        'C:\ProgramData\ESnNP40A', 'C:\ProgramData\O9VPr4nA',
        'C:\ProgramData\WindowsInstaller', 'C:\Windows\Temp\ranchserv.jpg'
    )) {
    Check "已清除: $p" (-not (Test-Path -LiteralPath $p)) "仍然存在"
}

# ---------- 6. 进程 ----------
Write-Host ""
Write-Host "--- 6. 运行中的进程 ---"
$badProc = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(BGGmG1|4zZkWf|IfpsR9|2x6neoBA|mtEgC|1XAlUKV|cbvchost|SunIogincIient)$' -or
    $_.ExecutablePath -match 'mSairk|2gZsbf|kDexcm|7a27Qo|Users\\Default\\8arJ|AppData\\Local\\Local\\|AppData\\Local\\CBP'
})
Check "无恶意进程运行" ($badProc.Count -eq 0) (($badProc | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', ')

# ---------- 7. hosts ----------
Write-Host ""
Write-Host "--- 7. hosts 文件 ---"
$h = 'C:\Windows\System32\drivers\etc\hosts'
$hl = @(Get-Content -LiteralPath $h -ErrorAction SilentlyContinue)
$badH = @($hl | Where-Object { $_ -match 'adobestats\.io|hstatic\.io|^\s*127\.0\.0\.1\s+.*360\.cn' })
Check "hosts 无恶意屏蔽项 (当前 $($hl.Count) 行)" ($badH.Count -eq 0) ("仍有 $($badH.Count) 条")

# ---------- 8. 恶意 WDAC 策略 ----------
Write-Host ""
Write-Host "--- 8. WDAC / Device Guard 策略 ---"
Check "恶意 SiPolicy.p7b 已移除" (-not (Test-Path 'C:\Windows\System32\CodeIntegrity\SiPolicy.p7b')) "文件仍然存在"
try {
    $dg = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop
    $ciState = $dg.UsermodeCodeIntegrityPolicyEnforcementStatus
    # 0=关闭 1=仅审核 2=强制
    Check "用户态 CI 策略未处于强制执行 (当前=$ciState)" ($ciState -ne 2) "仍为强制执行，策略可能未卸载干净或被重新下发"
}
catch { Warn "无法读取 Device Guard 状态" $_.Exception.Message }

# ---------- 9. Defender ----------
Write-Host ""
Write-Host "--- 9. Windows Defender ---"
$svc = Get-Service WinDefend -ErrorAction SilentlyContinue
Check "WinDefend 服务正在运行" ($svc -and $svc.Status -eq 'Running') ("当前状态: " + $(if ($svc) { $svc.Status } else { '不存在' }))
try {
    $st = Get-MpComputerStatus -ErrorAction Stop
    Check "Defender 实时保护已开启" ($st.RealTimeProtectionEnabled -eq $true) ("AMRunningMode=" + $st.AMRunningMode)
    Write-Host ("        病毒库更新于: " + $st.AntivirusSignatureLastUpdated)
}
catch { Warn "无法读取 Defender 状态 (0x800106ba 表示服务未运行)" $_.Exception.Message }

# ---------- 10. 近期新投放检测 ----------
Write-Host ""
Write-Host "--- 10. 近期可疑投放检测 (最近 7 天, 隐藏+系统属性的可执行文件) ---"
$since = (Get-Date).AddDays(-7)
$recent = @()
foreach ($root in @('C:\Users\Public', 'C:\ProgramData', 'C:\Windows\Temp', 'C:\Program Files (x86)', 'C:\Users\Default')) {
    if (Test-Path -LiteralPath $root) {
        $recent += Get-ChildItem -LiteralPath $root -Force -Recurse -Depth 4 -ErrorAction SilentlyContinue |
        Where-Object { $_.CreationTime -ge $since -and -not $_.PSIsContainer -and $_.Extension -match '^\.(exe|dll|sys|dat|jpg|png|ico|tb|tmp)$' -and $_.Attributes -match 'Hidden|System' } |
        Select-Object -First 20 -ExpandProperty FullName
    }
}
if ($recent.Count -eq 0) { Check "最近 7 天无可疑隐藏可执行文件投放" $true "" }
else { Warn "发现 $($recent.Count) 个近期隐藏文件，请人工确认" ($recent -join ' | ') }

# ---------- 汇总 ----------
Write-Host ""
Write-Host "===================== 汇总 ====================="
if ($fail -eq 0 -and $warn -eq 0) { Write-Host "全部检查通过。" -ForegroundColor Green }
else {
    if ($fail -gt 0) { Write-Host "异常项: $fail  (需要处理)" -ForegroundColor Red }
    if ($warn -gt 0) { Write-Host "注意项: $warn  (需要人工确认)" -ForegroundColor Yellow }
}
Write-Host ""
Write-Host "提示: 无论如何，本机凭据（域账号、浏览器密码、Git/SVN/SSH、API Key）"
Write-Host "      都应视为已泄露，请在【另一台干净设备】上全部轮换。"
Write-Host ""
