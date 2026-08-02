@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 启动本地服务: http://localhost:8000  (Ctrl+C 停止)
start "" http://localhost:8000
python -m http.server 8000
