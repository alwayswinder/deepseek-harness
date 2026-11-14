#Requires -Version 5.1
<#
.SYNOPSIS
    把本地音频文件作为 QQ **语音气泡**（而不是文件附件）发给已绑定的用户。

.DESCRIPTION
    dsh-qq-plugin 的 `send_to_qq` 只把图片/视频之外的一切走文件通道，所以 `.wav`
    到了手机上是一个要点开的附件，不是能直接播放的语音条。

    这个脚本绕过插件，直接调 QQ 官方机器人 API 三步：

      1. `POST https://bots.qq.com/app/getAppAccessToken` 换 access_token（约 2 小时有效）
      2. `POST https://api.sgroup.qq.com/v2/users/{openid}/files` 用 `file_type=3`（语音）上传
      3. `POST https://api.sgroup.qq.com/v2/users/{openid}/messages` 用 `msg_type=7`（媒体）发送

    凭据全部取自 DSH 自己的存储，脚本不接受、也不打印任何密钥：

      - `$DSH_HOME/.credentials.yaml`
        `records."dsh-qq-plugin/app-<appId>".payload.appSecret`
      - `$DSH_HOME/qq/state.json`
        `accounts.<appId>.userOpenid`（绑定的那个用户）

.PARAMETER Path
    音频文件绝对路径。wav / mp3 / silk 都能直接上传，不需要先转码。

.PARAMETER FileName
    上传时用的文件名，纯展示用；省略则取源文件名。

.EXAMPLE
    pwsh -File send-qq-voice.ps1 -Path D:\AI\Tmp\tts.wav

.NOTES
    主动消息受 QQ 平台额度限制（不是无限制推送）。日常回复仍走插件，
    这个脚本只用于「想让对方听到声音」的场合。
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Path,

    [string]$FileName
)

$ErrorActionPreference = 'Stop'

function Resolve-DshHome {
    $raw = if ($env:DSH_HOME -and $env:DSH_HOME.Trim() -ne '') { $env:DSH_HOME.Trim() } else { '~/.dsh' }
    if ($raw.StartsWith('~')) {
        $raw = Join-Path $HOME ($raw.Substring(1).TrimStart('\', '/'))
    }
    return [IO.Path]::GetFullPath($raw)
}

function Read-QqCredential {
    <#
      YAML 不做通用解析：只在 records 里定位 `dsh-qq-plugin/app-<appId>` 那一段，
      逐行找它的第一个 appSecret。段的结束以「顶格的新键」为准。
    #>
    param([string]$CredPath, [string]$AppId)

    $lines = Get-Content -LiteralPath $CredPath
    $start = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "dsh-qq-plugin/app-$([regex]::Escape($AppId))") { $start = $i; break }
    }
    if ($start -lt 0) { throw "凭据里没有 dsh-qq-plugin/app-$AppId（先在插件设置页登录一次）" }

    for ($i = $start + 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\S[^:]*:') { break }
        if ($lines[$i] -match '^\s*appSecret:\s*(\S+)') {
            return $matches[1].Trim("'", '"')
        }
    }
    throw "凭据里 dsh-qq-plugin/app-$AppId 段没有 appSecret"
}

function Read-QqBinding {
    <# 返回 @{ AppId; UserOpenid }，取 state.json 里第一个已登录的账号。 #>
    param([string]$StatePath)

    if (-not (Test-Path -LiteralPath $StatePath)) {
        throw "找不到 QQ 插件状态：$StatePath（插件还没登录过）"
    }
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    $account = $state.accounts.PSObject.Properties | Select-Object -First 1
    if ($null -eq $account) { throw 'QQ 插件状态里没有已登录的账号' }

    $openid = $account.Value.userOpenid
    if ([string]::IsNullOrWhiteSpace($openid)) { throw "账号 $($account.Name) 没有 userOpenid" }
    return @{ AppId = $account.Name; UserOpenid = $openid }
}

function Invoke-QqApi {
    param(
        [string]$Uri,
        [string]$Token,
        [string]$AppId,
        [string]$JsonBody
    )
    $headers = @{
        Authorization   = "QQBot $Token"
        'X-Union-Appid' = $AppId
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($JsonBody)
    return Invoke-RestMethod -Uri $Uri -Method Post -Headers $headers -Body $bytes `
        -ContentType 'application/json; charset=utf-8' -TimeoutSec 120
}

# ---- 前置检查 ---------------------------------------------------------------

if (-not (Test-Path -LiteralPath $Path)) { throw "音频文件不存在：$Path" }
$source = Get-Item -LiteralPath $Path
if ($source.Length -eq 0) { throw "音频文件是空的：$Path" }

$dshHome = Resolve-DshHome
$binding = Read-QqBinding -StatePath (Join-Path $dshHome 'qq\state.json')
$secret = Read-QqCredential -CredPath (Join-Path $dshHome '.credentials.yaml') -AppId $binding.AppId
$appId = $binding.AppId
$openid = $binding.UserOpenid
$name = if ([string]::IsNullOrWhiteSpace($FileName)) { $source.Name } else { $FileName }

# ---- 1. access token --------------------------------------------------------

$tokenBody = @{ appId = $appId; clientSecret = $secret } | ConvertTo-Json -Compress
$tokenResponse = Invoke-RestMethod -Uri 'https://bots.qq.com/app/getAppAccessToken' -Method Post `
    -Body ([Text.Encoding]::UTF8.GetBytes($tokenBody)) -ContentType 'application/json' -TimeoutSec 30
$token = $tokenResponse.access_token
if ([string]::IsNullOrWhiteSpace($token)) { throw '取 access_token 失败：返回里没有 access_token' }

# ---- 2. 按语音类型上传 ------------------------------------------------------

$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($source.FullName))
$uploadBody = @{
    file_type    = 3          # 1 图片 / 2 视频 / 3 语音 / 4 文件
    file_data    = $base64
    srv_send_msg = $false     # 只上传，发送交给下一步
    file_name    = $name
} | ConvertTo-Json -Compress

$upload = Invoke-QqApi -Uri "https://api.sgroup.qq.com/v2/users/$openid/files" `
    -Token $token -AppId $appId -JsonBody $uploadBody
$fileInfo = $upload.file_info
if ([string]::IsNullOrWhiteSpace($fileInfo)) { throw '上传语音失败：返回里没有 file_info' }

# ---- 3. 发语音消息 ----------------------------------------------------------

$messageBody = @{
    content  = ''
    msg_type = 7              # 7 = 富媒体
    media    = @{ file_info = $fileInfo }
    msg_seq  = 1
} | ConvertTo-Json -Depth 5 -Compress

$sent = Invoke-QqApi -Uri "https://api.sgroup.qq.com/v2/users/$openid/messages" `
    -Token $token -AppId $appId -JsonBody $messageBody

[pscustomobject]@{
    Sent      = $true
    MessageId = $sent.id
    Bytes     = $source.Length
    FileName  = $name
}
