# Trigger Git Credential Manager auth for github.com, then list the account's
# repositories so we know where to push.
#
# The token is NEVER printed. Only the username and repo names are written out.
# Keep this file ASCII-only (PowerShell 5.1 reads .ps1 as ANSI/GBK).
$ErrorActionPreference = "Stop"

$git = "C:\Users\kysr\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"

$probe = "protocol=https`nhost=github.com`n`n"
$out = $probe | & $git credential fill 2>&1

$user = ($out | Where-Object { $_ -like "username=*" } | Select-Object -First 1) -replace "^username=", ""
$token = ($out | Where-Object { $_ -like "password=*" } | Select-Object -First 1) -replace "^password=", ""

if (-not $token) {
    Write-Output "NO_CREDENTIAL"
    Write-Output (($out | Select-Object -First 6) -join " | ")
    exit 1
}

Write-Output ("account=" + $user)

$headers = @{
    Authorization          = "Bearer " + $token
    Accept                 = "application/vnd.github+json"
    "User-Agent"           = "codex-campus"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$repos = Invoke-RestMethod -Uri "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner" -Headers $headers
Write-Output ("repo_count=" + $repos.Count)
$repos | Select-Object -First 40 | ForEach-Object {
    $vis = if ($_.private) { "private" } else { "public" }
    Write-Output ("  {0,-45} {1,-8} {2}" -f $_.full_name, $vis, $_.updated_at)
}
