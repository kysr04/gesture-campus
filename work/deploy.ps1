# Sync the latest files into dist/ and publish to Cloudflare Pages.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File work\deploy.ps1
#
# Keep this file ASCII-only. PowerShell 5.1 reads .ps1 as ANSI/GBK, so non-ASCII
# bytes get mangled -- and mangled bytes inside a comment can swallow the next
# statement. That is exactly how the campus data copy silently broke once.
$ErrorActionPreference = "Stop"

Set-Location -LiteralPath ([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")))

New-Item -ItemType Directory -Force -Path "dist" | Out-Null

Copy-Item -LiteralPath "index.html" -Destination "dist\index.html" -Force
Copy-Item -LiteralPath "particle.html" -Destination "dist\particle.html" -Force
Copy-Item -LiteralPath "portrait.html" -Destination "dist\portrait.html" -Force
Copy-Item -LiteralPath "hand_landmarker.task" -Destination "dist\hand_landmarker.task" -Force

# Portrait assets used by particle.html
New-Item -ItemType Directory -Force -Path "dist\assets" | Out-Null
Copy-Item -LiteralPath "assets\portrait.png" -Destination "dist\assets\portrait.png" -Force
Copy-Item -LiteralPath "assets\portrait-particles.json" -Destination "dist\assets\portrait-particles.json" -Force

Write-Output "synced dist:"
Get-ChildItem -Recurse dist | Where-Object { -not $_.PSIsContainer } |
    ForEach-Object { "  {0}  {1}" -f $_.Name, $_.Length }

& "work\deploy\node_modules\.bin\wrangler.cmd" pages deploy dist --project-name=gesture-globe --branch=main --commit-dirty=true
