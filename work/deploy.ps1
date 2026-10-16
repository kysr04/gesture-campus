# 把最新的 index.html 同步到 dist，然后发布到 Cloudflare Pages。
# 直接跑: powershell -NoProfile -ExecutionPolicy Bypass -File work\deploy.ps1
$ErrorActionPreference = "Stop"

# 注意：这个脚本里不能写中文路径字面量。PowerShell 5.1 按 ANSI 读 .ps1，
# 中文会变成乱码。所以先切目录，后面一律用相对路径。
Set-Location "F:\项目\前端交互网页"

Copy-Item -LiteralPath "index.html" -Destination "dist\index.html" -Force
Copy-Item -LiteralPath "hand_landmarker.task" -Destination "dist\hand_landmarker.task" -Force

Write-Output "已同步 dist，开始发布..."
& "work\deploy\node_modules\.bin\wrangler.cmd" pages deploy dist --project-name=gesture-globe --branch=main --commit-dirty=true
