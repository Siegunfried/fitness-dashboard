' Sync Servers - Silent Launcher (diet + training)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

servers = Array( _
    Array("diet_sync_server.py", 17532), _
    Array("training_sync_server.py", 17533) _
)

Function FindPythonw()
    For Each py In Array("C:\Program Files\Python311\pythonw.exe", "C:\Program Files\Python312\pythonw.exe", "C:\Program Files\Python310\pythonw.exe", "C:\Program Files\Python39\pythonw.exe", "C:\Program Files\Python38\pythonw.exe")
        If FSO.FileExists(py) Then FindPythonw = py : Exit Function
    Next
    FindPythonw = "pythonw.exe"
End Function

pythonw = FindPythonw()
For i = 0 To UBound(servers)
    script = scriptDir & "\" & servers(i)(0)
    If FSO.FileExists(script) Then WshShell.Run """" & pythonw & """ """ & script & """", 0, False
Next
