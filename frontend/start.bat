@echo off
echo ====================================
echo Banana Slides Frontend Start Script
echo ====================================
echo.

echo [1/3] Check dependencies...
if not exist "node_modules\" (
    echo Dependency not detected, installation under way...
    call npm install
    if errorlevel 1 (
        echo Dependency installation failed; run this command manually: npm install
        pause
        exit /b 1
    )
) else (
    echo Dependencies are already installed
)

echo.
echo [2/3] Check environment variables...
echo.
echo [3/3] Start development server...
echo The frontend will run on http://localhost:3011
echo Make sure the back-end service is active. http://localhost:5011
echo.
echo Press Ctrl+C to stop the server.
echo.

call npm run dev

pause
