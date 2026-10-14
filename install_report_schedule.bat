@echo off
setlocal
set "REPORT_SCRIPT=%~dp0run_monthly_report.bat"
schtasks /Create /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 17:00 /TN "IECMS Issue Reports" /TR "\"%REPORT_SCRIPT%\"" /F
if errorlevel 1 (
    echo Could not create the schedule. Check the Windows timezone and try running this file as the Windows account that should send the reports.
    exit /b 1
)
echo Scheduled IECMS reports for 5:00 PM Monday through Friday.
echo Ensure Windows is set to the Africa/Harare timezone (UTC+02:00).
endlocal
