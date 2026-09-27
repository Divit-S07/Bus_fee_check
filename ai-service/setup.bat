@echo off
REM One-time setup for the local DeepFace face-recognition service.
cd /d "%~dp0"
python -m pip install -r requirements.txt
python -m pip install --no-deps deepface
echo.
echo Setup finished. Start the service with start.bat
pause
