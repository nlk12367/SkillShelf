$ErrorActionPreference = 'Stop'
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$starter = Join-Path $PSScriptRoot 'desktop\start.cjs'
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\electron\index.js'))) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show('Please run npm install in the tool folder first.', 'SkillShelf') | Out-Null
    exit 1
}
Start-Process -FilePath $nodeExecutable -ArgumentList ('"{0}"' -f $starter) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'desktop.log') -RedirectStandardError (Join-Path $PSScriptRoot 'desktop-error.log')
