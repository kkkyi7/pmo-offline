@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。
  echo 请先安装 LTS 版本：https://nodejs.org/
  echo 安装时勾选 "Add to PATH"，装完后重新双击本文件。
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo 还没有构建结果，正在准备（只需这一次，需要能上网）...
  if not exist "node_modules\" call npm install
  if errorlevel 1 (
    echo 依赖安装失败。
    pause
    exit /b 1
  )
  call npm run build
  if errorlevel 1 (
    echo 构建失败。
    pause
    exit /b 1
  )
)

start "" "http://127.0.0.1:4173/"
node scripts\serve.mjs
if errorlevel 1 pause
endlocal
