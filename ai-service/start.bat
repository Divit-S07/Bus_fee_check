@echo off
REM Start the local DeepFace face-recognition service (CPU only, fully offline).
cd /d "%~dp0"
python main.py
