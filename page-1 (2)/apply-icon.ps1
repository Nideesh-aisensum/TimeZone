# PowerShell script to apply icon to exe
$exePath = Join-Path $PSScriptRoot "TimezoneServer.exe"
$iconPath = Join-Path $PSScriptRoot "timezone-icon.ico"

Write-Host "Applying icon to TimezoneServer.exe..."
Write-Host "EXE: $exePath"
Write-Host "Icon: $iconPath"

# Download and use ResourceHacker
$rhUrl = "https://www.angusj.com/resourcehacker/resource_hacker.zip"
$rhZip = Join-Path $PSScriptRoot "rh.zip"
$rhExe = Join-Path $PSScriptRoot "ResourceHacker.exe"

if (-not (Test-Path $rhExe)) {
    Write-Host "Downloading ResourceHacker..."
    Invoke-WebRequest -Uri $rhUrl -OutFile $rhZip
    Expand-Archive -Path $rhZip -DestinationPath $PSScriptRoot -Force
    Remove-Item $rhZip
}

# Create a resource script
$script = @"
[FILENAMES]
Exe=$exePath
SaveAs=$exePath
Log=NUL
[COMMANDS]
-addoverwrite $iconPath, ICONGROUP, MAINICON, 0
"@

$scriptPath = Join-Path $PSScriptRoot "icon_script.txt"
$script | Out-File -FilePath $scriptPath -Encoding ASCII

# Run ResourceHacker
& $rhExe -script $scriptPath

Remove-Item $scriptPath

Write-Host "✅ Icon applied successfully!"
