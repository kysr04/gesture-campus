# ASCII-only on purpose: PowerShell 5.1 reads .ps1 as ANSI, so a non-ASCII
# path inside this file would get mangled. Use relative paths + inherited cwd.
$ErrorActionPreference = "Continue"

$out = "work\hand_landmarker.task"
$url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

if (Test-Path $out) {
  $len = (Get-Item $out).Length
  if ($len -ge 7819105) { Write-Output ("already complete: " + $len); exit 0 }
  Remove-Item $out -Force
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& curl.exe -sL --max-time 1800 -o $out $url
$sw.Stop()

if (Test-Path $out) {
  $len = (Get-Item $out).Length
  Write-Output ("downloaded " + $len + " bytes in " + [math]::Round($sw.Elapsed.TotalSeconds,1) + "s")
} else {
  Write-Output "download failed"
}
