@echo off
setlocal

title NeuroWatch Launcher

echo.
echo ========================================================
echo                 NEUROWATCH LAUNCHER
echo ========================================================
echo.
echo Project: %~dp0
echo.

REM ========================================================
REM CONFIGURATION
REM ========================================================

set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"
set "PATIENT_DIR=%PROJECT_DIR%patient-app"

set "PYTHON=C:\Users\Karthick Raaja\AppData\Local\Programs\Python\Python310\python.exe"

REM ========================================================
REM CHECK PYTHON
REM ========================================================

echo [CHECK] Checking Python...

if not exist "%PYTHON%" (
    echo.
    echo ERROR: Python 3.10 was not found at:
    echo %PYTHON%
    echo.
    pause
    exit /b 1
)

echo [OK] Python found.
echo.

REM ========================================================
REM CHECK BACKEND DIRECTORY
REM ========================================================

if not exist "%BACKEND_DIR%" (
    echo.
    echo ERROR: Backend directory not found:
    echo %BACKEND_DIR%
    echo.
    pause
    exit /b 1
)

echo [OK] Backend directory found.
echo.

REM ========================================================
REM CHECK PATIENT APP DIRECTORY
REM ========================================================

if not exist "%PATIENT_DIR%" (
    echo.
    echo ERROR: Patient app directory not found:
    echo %PATIENT_DIR%
    echo.
    pause
    exit /b 1
)

echo [OK] Patient app directory found.
echo.

REM ========================================================
REM START BACKEND
REM ========================================================

echo ========================================================
echo [1/3] STARTING FASTAPI BACKEND
echo ========================================================
echo.
echo Backend:
echo http://127.0.0.1:8000
echo.

start "NeuroWatch - Backend" cmd /k "cd /d "%BACKEND_DIR%" && echo ======================================== && echo      NEUROWATCH FASTAPI BACKEND && echo ======================================== && echo. && echo Starting Uvicorn... && echo. && "%PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

REM Give backend a moment to start
timeout /t 3 /nobreak >nul

REM ========================================================
REM START CAREGIVER DASHBOARD
REM ========================================================

echo ========================================================
echo [2/3] STARTING CAREGIVER DASHBOARD
echo ========================================================
echo.
echo Caregiver:
echo http://localhost:5173
echo.

start "NeuroWatch - Caregiver" cmd /k "cd /d "%PROJECT_DIR%" && echo ======================================== && echo     NEUROWATCH CAREGIVER DASHBOARD && echo ======================================== && echo. && echo Starting Vite... && echo. && npm run dev"

REM ========================================================
REM START PATIENT APP
REM ========================================================

echo ========================================================
echo [3/3] STARTING PATIENT APP
echo ========================================================
echo.
echo Patient:
echo http://localhost:5174
echo.

start "NeuroWatch - Patient" cmd /k "cd /d "%PATIENT_DIR%" && echo ======================================== && echo         NEUROWATCH PATIENT APP && echo ======================================== && echo. && echo Starting Vite... && echo. && npm run dev"

REM ========================================================
REM FINISHED
REM ========================================================

echo.
echo ========================================================
echo              NEUROWATCH STARTED
echo ========================================================
echo.
echo   BACKEND
echo   http://127.0.0.1:8000
echo.
echo   CAREGIVER DASHBOARD
echo   http://localhost:5173
echo.
echo   PATIENT APP
echo   http://localhost:5174
echo.
echo ========================================================
echo.
echo Three separate terminal windows have been opened.
echo Keep them running while using NeuroWatch.
echo.
echo You can close this launcher window.
echo ========================================================
echo.

pause

endlocal