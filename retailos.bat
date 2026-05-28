@echo off
title RetailOS

:menu
cls
echo ==========================================
echo   RetailOS POS System
echo ==========================================
echo.
echo   1. Run  (start API + launch app)
echo   2. Dev  (start API + hot-reload window)
echo   3. Build installer
echo   4. Exit
echo.
set /p choice=Choose an option [1-4]:

if "%choice%"=="1" goto :run
if "%choice%"=="2" goto :dev
if "%choice%"=="3" goto :build
if "%choice%"=="4" goto :end
goto :menu

:: ── Run production ────────────────────────────────────────────────────────────
:run
set EXE=apps\web\src-tauri\target\release\retailos.exe
if not exist "%EXE%" (
  echo.
  echo  [!] No build found. Run option 3 first to build the installer.
  echo.
  pause
  goto :menu
)
echo.
echo  Starting API server...
start "RetailOS API" cmd /k "npm run dev -w apps/api"
echo  Waiting for API to start...
timeout /t 4 /nobreak >nul
echo  Launching RetailOS...
start "" "%EXE%"
goto :end

:: ── Dev mode ──────────────────────────────────────────────────────────────────
:dev
echo.
echo  Starting API server...
start "RetailOS API" cmd /k "npm run dev -w apps/api"
echo  Waiting for API to start...
timeout /t 3 /nobreak >nul
echo  Starting Tauri dev window (hot reload)...
npm run desktop:dev -w apps/web
goto :end

:: ── Build ─────────────────────────────────────────────────────────────────────
:build
echo.
echo  Building RetailOS installer...
echo  (This takes a few minutes on first run)
echo.
npm run desktop:build -w apps/web
if %errorlevel% neq 0 (
  echo.
  echo  [!] Build failed. Check the output above for errors.
  pause
  goto :menu
)
echo.
echo  Build complete. Installers are in:
echo    apps\web\src-tauri\target\release\bundle\msi\
echo    apps\web\src-tauri\target\release\bundle\nsis\
echo.
pause
goto :menu

:end
