@echo off
setlocal

echo.
echo  POS Dev Environment
echo  ===================
echo.

:: ── Check Node ───────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)

:: ── Copy .env if missing ──────────────────────────────────────────────────────
if not exist "apps\api\.env" (
    echo [SETUP] Creating apps\api\.env from .env.example ...
    copy "apps\api\.env.example" "apps\api\.env" >nul
    echo.
    echo  ** Edit apps\api\.env and set DATABASE_URL before continuing. **
    echo     Default: postgresql://pos:pos@localhost:5432/pos
    echo.
    pause
)

:: ── Install deps ──────────────────────────────────────────────────────────────
if not exist "node_modules" (
    echo [SETUP] Installing dependencies ...
    call npm install
    if errorlevel 1 ( echo [ERROR] npm install failed & pause & exit /b 1 )
)

:: ── Generate Prisma client ────────────────────────────────────────────────────
echo [SETUP] Generating Prisma client ...
call npm run -w apps/api prisma generate
if errorlevel 1 ( echo [ERROR] Prisma generate failed & pause & exit /b 1 )

:: ── Ask: first-time DB setup? ─────────────────────────────────────────────────
if not exist ".db-initialized" (
    echo.
    set /p RUN_MIGRATE="[SETUP] Run database migrations and seed? (y/n): "
    if /i "%RUN_MIGRATE%"=="y" (
        echo [DB] Running migrations ...
        call npm run db:migrate
        if errorlevel 1 ( echo [ERROR] Migration failed & pause & exit /b 1 )

        echo [DB] Seeding database ...
        call npm run db:seed
        if errorlevel 1 ( echo [ERROR] Seed failed & pause & exit /b 1 )

        echo. > .db-initialized

        echo.
        echo  Default credentials:
        echo    Admin:   admin@demo.com   / admin1234
        echo    Manager: manager@demo.com / manager1234
        echo    Cashier: cashier@demo.com / cashier1234  (PIN: 1234)
        echo.
    )
)

:: ── Start dev servers ─────────────────────────────────────────────────────────
echo [START] Launching API (http://localhost:3001) and Web (http://localhost:5173) ...
echo         Press Ctrl+C to stop.
echo.
call npm run dev

endlocal
