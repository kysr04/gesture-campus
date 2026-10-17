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
Copy-Item -LiteralPath "campus.html" -Destination "dist\campus.html" -Force
Copy-Item -LiteralPath "particle.html" -Destination "dist\particle.html" -Force
Copy-Item -LiteralPath "hand_landmarker.task" -Destination "dist\hand_landmarker.task" -Force

# Campus data must ship too. heights.json travels with it so building heights can
# be corrected later by editing that one file and redeploying -- no code change.
New-Item -ItemType Directory -Force -Path "dist\campus" | Out-Null
Copy-Item -LiteralPath "campus\campus.json" -Destination "dist\campus\campus.json" -Force
Copy-Item -LiteralPath "campus\heights.json" -Destination "dist\campus\heights.json" -Force

Write-Output "synced dist:"
Get-ChildItem -Recurse dist | Where-Object { -not $_.PSIsContainer } |
    ForEach-Object { "  {0}  {1}" -f $_.Name, $_.Length }

& "work\deploy\node_modules\.bin\wrangler.cmd" pages deploy dist --project-name=gesture-globe --branch=main --commit-dirty=true
