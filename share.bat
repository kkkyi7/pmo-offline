@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。
  pause
  exit /b 1
)
if not exist "node_modules\" call npm install
call npm run build
if errorlevel 1 (
  echo 构建失败。
  pause
  exit /b 1
)
node scripts\make-singlefile.mjs
node scripts\publish-site.mjs
if errorlevel 1 pause
endlocal
