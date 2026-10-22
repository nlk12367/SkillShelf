$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$installer = Join-Path $projectRoot "dist\windows\SkillShelf-Setup-$($package.version)-x64.exe"
$testRoot = Join-Path $projectRoot ('dist\installer-test-' + [Guid]::NewGuid().ToString('N'))
$install = Join-Path $testRoot 'installed'
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$existing = Get-ChildItem $registry -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'SkillShelf*' }
if ($existing) { throw 'SkillShelf is already installed. Use a clean Windows user for installer verification.' }
New-Item -ItemType Directory -Path $testRoot | Out-Null
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'SkillShelf.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'SkillShelf.lnk')
)
$backups = @{}
foreach ($shortcut in $shortcuts) {
    if (Test-Path -LiteralPath $shortcut) { $backups[$shortcut] = [IO.File]::ReadAllBytes($shortcut) }
}
$nodeExecutable = (Get-Command node).Source
$oldProfile = $env:SKILLS_TOOL_USER_DATA
$oldPackaged = $env:SKILLS_TOOL_PACKAGED_EXE
$oldPath = $env:PATH
$oldRunAsNode = $env:ELECTRON_RUN_AS_NODE
$smoke = $null
try {
    $setup = Start-Process -FilePath $installer -ArgumentList "/S /D=$install" -WindowStyle Hidden -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
    $executable = Join-Path $install 'SkillShelf.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable is missing.' }
    $entry = Get-ChildItem $registry | Get-ItemProperty | Where-Object { $_.DisplayName -like 'SkillShelf*' }
    if (-not $entry -or $entry.DisplayVersion -ne $package.version) { throw 'Uninstall registration is missing or incorrect.' }
    Write-Output 'PASS: actual NSIS installation and uninstall registration'
    $env:SKILLS_TOOL_PACKAGED_EXE = $executable
    & $nodeExecutable (Join-Path $projectRoot 'verify-packaged.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Installed App integration test failed.' }
    $env:SKILLS_TOOL_USER_DATA = Join-Path $testRoot 'visible-profile'
    $env:PATH = Join-Path $env:SystemRoot 'System32'
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $smoke = Start-Process -FilePath $executable -WindowStyle Normal -PassThru
    Start-Sleep -Seconds 5
    $smoke.Refresh()
    if ($smoke.HasExited -or $smoke.MainWindowTitle -ne 'SkillShelf' -or $smoke.MainWindowHandle -eq 0) { throw 'Installed App did not display a SkillShelf window.' }
    Write-Output 'PASS: installed App displays a visible window without Node/Python on PATH'
} finally {
    $env:PATH = $oldPath
    $env:SKILLS_TOOL_USER_DATA = $oldProfile
    $env:SKILLS_TOOL_PACKAGED_EXE = $oldPackaged
    $env:ELECTRON_RUN_AS_NODE = $oldRunAsNode
    if ($smoke -and -not $smoke.HasExited) { $smoke.CloseMainWindow() | Out-Null; if (-not $smoke.WaitForExit(5000)) { $smoke.Kill() } }
    $uninstaller = Join-Path $install 'Uninstall SkillShelf.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$install" -WindowStyle Hidden -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) { throw "Uninstaller failed: $($uninstall.ExitCode)" }
    }
    foreach ($shortcut in $shortcuts) {
        if ($backups.ContainsKey($shortcut)) { [IO.File]::WriteAllBytes($shortcut, $backups[$shortcut]) }
    }
}
if (Test-Path -LiteralPath (Join-Path $install 'SkillShelf.exe')) { throw 'Uninstall did not remove the installed executable.' }
$remaining = Get-ChildItem $registry | Get-ItemProperty | Where-Object { $_.DisplayName -like 'SkillShelf*' }
if ($remaining) { throw 'Uninstall registration remains after uninstall.' }
Write-Output 'PASS: actual uninstall and restoration of pre-existing shortcuts'
