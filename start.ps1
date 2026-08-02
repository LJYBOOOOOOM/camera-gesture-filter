$ErrorActionPreference = "Stop"
$port = 8000
Write-Host "启动本地服务: http://localhost:$port  (Ctrl+C 停止)"
Start-Process "http://localhost:$port"
python -m http.server $port
