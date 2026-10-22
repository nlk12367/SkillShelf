$ErrorActionPreference = 'Stop'
$pythonExecutable = (Get-Command python -ErrorAction Stop).Source
$toolScript = Join-Path $PSScriptRoot 'build-tool.py'
$buildOutput = & $pythonExecutable -X utf8 $toolScript 2>&1
if ($LASTEXITCODE -ne 0) {
    $buildOutput | Out-File -LiteralPath (Join-Path $PSScriptRoot 'tool-error.log') -Encoding utf8
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show('Skills scan failed. See tool-error.log in the tool folder.', 'SkillShelf') | Out-Null
    exit 1
}
Start-Process -FilePath (Join-Path $PSScriptRoot 'Skills查詢工具.html')
