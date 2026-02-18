' ============================================================
' Timezone Kiosk Silent Launcher
' Double-click this to start the kiosk without any command window
' ============================================================

Option Explicit

Dim objShell, objFSO, strScriptPath, strBatPath, strAppPath

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the path where this VBS file is located
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Check if we're in the scripts folder or app folder
strBatPath = strScriptPath & "\START_KIOSK.bat"

If Not objFSO.FileExists(strBatPath) Then
    ' Try parent folder
    strBatPath = objFSO.GetParentFolderName(strScriptPath) & "\START_KIOSK.bat"
End If

If Not objFSO.FileExists(strBatPath) Then
    MsgBox "START_KIOSK.bat not found!", vbCritical, "Timezone Kiosk Error"
    WScript.Quit
End If

' Run the batch file in hidden mode (0 = hidden)
objShell.Run """" & strBatPath & """", 0, False

Set objShell = Nothing
Set objFSO = Nothing
