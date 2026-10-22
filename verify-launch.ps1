$ErrorActionPreference = 'Stop'
$global:skillLaunchTestTarget = $null
function Start-Process {
    param([string]$FilePath)
    if (-not (Test-Path -LiteralPath $FilePath)) { throw 'Launcher target is missing.' }
    $global:skillLaunchTestTarget = $FilePath
}
& (Join-Path $PSScriptRoot 'launch-tool.ps1')
if (-not $global:skillLaunchTestTarget -or [System.IO.Path]::GetExtension($global:skillLaunchTestTarget) -ne '.html') {
    throw 'Launcher did not request an existing HTML file.'
}
Write-Output 'PASS: Windows PowerShell rebuilt the index and requested the HTML file. Browser opening was intercepted.'
Remove-Variable -Scope Global -Name skillLaunchTestTarget
