@echo off
echo Applying custom icon to TimezoneServer.exe...

REM Download ResourceHacker if not present
if not exist "ResourceHacker.exe" (
    echo Downloading ResourceHacker...
    powershell -Command "Invoke-WebRequest -Uri 'http://www.angusj.com/resourcehacker/resource_hacker.zip' -OutFile 'rh.zip'"
    powershell -Command "Expand-Archive -Path 'rh.zip' -DestinationPath '.' -Force"
    del rh.zip
)

REM Apply icon
echo Setting icon...
ResourceHacker.exe -open "TimezoneServer.exe" -save "TimezoneServer.exe" -action addoverwrite -res "timezone-icon.ico" -mask ICONGROUP,MAINICON,

echo Done!
pause
