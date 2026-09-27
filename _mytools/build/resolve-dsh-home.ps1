# The harness home, resolved the way the harness itself resolves it: a blank
# DSH_HOME is unset, a leading `~` is the user directory, and the result is
# absolute. Shared by the build helpers so both agree with each other and with
# the app they build for.

function Resolve-DshHome {
    $raw = $env:DSH_HOME
    $value = if ($null -eq $raw) { '' } else { $raw.Trim() }
    if ($value -eq '') { return (Join-Path $HOME '.dsh') }
    if ($value -eq '~') { return $HOME }
    if ($value.StartsWith('~/') -or $value.StartsWith('~\')) { return (Join-Path $HOME $value.Substring(2)) }
    return [System.IO.Path]::GetFullPath($value)
}
