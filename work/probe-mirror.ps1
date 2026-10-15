# Look for a China-reachable mirror of hand_landmarker.task.
$urls = @(
  "https://registry.npmmirror.com/-/binary/mediapipe/hand_landmarker.task",
  "https://cdn.jsdelivr.net/gh/google-ai-edge/mediapipe@master/mediapipe/models/hand_landmarker.task",
  "https://gitee.com/api/v5/search/repositories?q=hand_landmarker"
)
foreach ($u in $urls) {
  $code = & curl.exe -sL --max-time 20 -o NUL -w "%{http_code}" $u
  Write-Output ("$code  $u")
}
Write-Output "--- npmmirror binary categories ---"
& curl.exe -sL --max-time 25 "https://registry.npmmirror.com/-/binary/" |
  Select-String -Pattern '"name":"[^"]*"' -AllMatches |
  ForEach-Object { $_.Matches } |
  ForEach-Object { $_.Value } |
  Select-String -Pattern "media|model|mp|google" |
  Select-Object -First 20
