@echo off
setlocal
cd /d "%~dp0"
if not defined PHP_EXE if exist "%~dp0..\..\php\php.exe" set "PHP_EXE=%~dp0..\..\php\php.exe"
if not defined PHP_EXE set "PHP_EXE=php"
if not defined LOCALAPPDATA set "LOCALAPPDATA=%TEMP%"
if not exist "%LOCALAPPDATA%\IECMS" mkdir "%LOCALAPPDATA%\IECMS"
set "REPORT_LOG=%LOCALAPPDATA%\IECMS\reports_scheduler.log"
echo [%date% %time%] Starting scheduled reports.>>"%REPORT_LOG%"
"%PHP_EXE%" "%~dp0monthly_report.php" --run-scheduled >>"%REPORT_LOG%" 2>&1
set "REPORT_EXIT=%ERRORLEVEL%"
echo [%date% %time%] Report runner exit code: %REPORT_EXIT%.>>"%REPORT_LOG%"
if not "%REPORT_EXIT%"=="0" exit /b %REPORT_EXIT%
endlocal
