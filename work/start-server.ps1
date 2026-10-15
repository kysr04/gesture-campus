$ErrorActionPreference = "Stop"

$node = "C:\Users\kysr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

# 先切到站点根目录，再只用 ASCII 相对路径启动，绕开中文参数的编码问题
Set-Location "F:\项目\前端交互网页"

$proc = Start-Process -FilePath $node `
    -ArgumentList "work\serve.cjs" `
    -WindowStyle Hidden -PassThru

Start-Sleep -Milliseconds 900

Write-Output ("pid=" + $proc.Id)
$code = curl.exe -s -o NUL -w "%{http_code} %{size_download}" "http://127.0.0.1:8765/index.html"
Write-Output ("index=" + $code)
