$ErrorActionPreference = 'Stop'
$appExecutable = Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe'
$appEntry = Join-Path $PSScriptRoot 'desktop\main.cjs'
$appIcon = Join-Path $PSScriptRoot 'assets\app-icon.ico'
$appPage = Join-Path $PSScriptRoot 'Skills查詢工具.html'
foreach ($file in @($appExecutable, $appEntry, $appIcon, $appPage)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw 'Run npm install and python build-tool.py in the SkillShelf folder first.'
    }
}
$desktopFolder = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopFolder 'SkillShelf.lnk'
$shell = New-Object -ComObject WScript.Shell
$appArguments = '"{0}"' -f $appEntry
if (Test-Path -LiteralPath $shortcutPath) {
    $existing = $shell.CreateShortcut($shortcutPath)
    if ($existing.TargetPath -ne $appExecutable -or $existing.Arguments -ne $appArguments) {
        throw 'A different SkillShelf shortcut already exists. It was not replaced.'
    }
}
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $appExecutable
$shortcut.Arguments = $appArguments
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = $appIcon + ',0'
$shortcut.Description = 'SkillShelf - Discover, organize, and use your agent skills.'
$shortcut.WindowStyle = 1
$shortcut.Save()
$verified = $shell.CreateShortcut($shortcutPath)
if ($verified.TargetPath -ne $appExecutable -or $verified.IconLocation -ne ($appIcon + ',0')) {
    throw 'SkillShelf shortcut verification failed.'
}
# Remove only this project's former shortcut after the new one is verified.
$legacyPath = Join-Path $desktopFolder 'Skills 工具箱.lnk'
if (Test-Path -LiteralPath $legacyPath) {
    $legacy = $shell.CreateShortcut($legacyPath)
    if ($legacy.TargetPath -eq $appExecutable -and $legacy.Arguments -eq $appArguments) {
        Remove-Item -LiteralPath $legacyPath
    }
}
Write-Output ('SkillShelf shortcut created: ' + $shortcutPath)
