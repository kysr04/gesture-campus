# Create the GitHub repo (if missing) and print its clone URL.
# ASCII-only on purpose. The token is never printed.
$ErrorActionPreference = "Stop"

$git = "C:\Users\kysr\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
$repoName = "gesture-campus"
$description = "Gesture-controlled 3D campus scene (BUCT Changping) + globe version. Pure frontend, three.js + MediaPipe."

$probe = "protocol=https`nhost=github.com`n`n"
$out = $probe | & $git credential fill 2>&1
$token = ($out | Where-Object { $_ -like "password=*" } | Select-Object -First 1) -replace "^password=", ""
if (-not $token) { Write-Output "NO_CREDENTIAL"; exit 1 }

$headers = @{
    Authorization          = "Bearer " + $token
    Accept                 = "application/vnd.github+json"
    "User-Agent"           = "codex-campus"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$body = @{ name = $repoName; description = $description; private = $false; auto_init = $false } | ConvertTo-Json

try {
    $repo = Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" -Headers $headers -Body $body -ContentType "application/json"
    Write-Output "CREATED"
    Write-Output $repo.clone_url
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Output ("CREATE_FAILED status=" + $status)
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $msg = $reader.ReadToEnd()
        if ($msg.Length -gt 400) { $msg = $msg.Substring(0, 400) }
        Write-Output $msg
    } catch { }
    Write-Output ("FALLBACK_URL=https://github.com/kysr04/" + $repoName + ".git")
}
