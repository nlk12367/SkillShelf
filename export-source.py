"""Package only portable tool sources, never a user's scanned Skill contents."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

BASE = Path(__file__).resolve().parent
FILES = [
    'README.md', 'README.zh-TW.md', '使用說明.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore',
    'skills-config.json', 'scan-skills.py', 'build-tool.py', 'launch.py', 'launch-tool.ps1',
    '開啟 SkillShelf 網頁版.cmd', 'tool-shell.html', 'tool.css', 'tool.js',
    'skill-guide.tsv', 'plugin-guide.tsv', 'package.json', 'package-lock.json', 'test_scanner.py',
    'verify-tool.cjs', 'verify-launch.ps1', 'verify-portable.py', 'export-source.py',
    'launch-desktop.ps1', '開啟 SkillShelf.cmd', 'verify-desktop.cjs', 'verify-refresh.cjs', 'Read.md',
    'desktop/start.cjs', 'desktop/main.cjs', 'desktop/preload.cjs', 'desktop/resources.cjs', 'desktop/catalog.cjs',
    'desktop/read-file-clipboard.py', 'desktop/test-file-clipboard.py',
    'assets/app-icon.png', 'assets/app-icon-128.png', 'assets/app-icon-32.png',
    'assets/app-icon.ico', 'assets/icon-prompt.md',
    'create-desktop-shortcut.ps1', '.gitattributes',
    'desktop/runtime.cjs', 'electron-builder.json', 'scripts/prepare-windows.cjs', 'scripts/verify-installer.ps1', 'verify-packaged.cjs',
]


def export():
    destination = BASE / 'dist/skillshelf-source.zip'
    destination.parent.mkdir(exist_ok=True)
    for filename in FILES:
        path = (BASE / filename).resolve()
        if not path.is_relative_to(BASE.resolve()) or not path.is_file():
            raise ValueError(f'Invalid source file: {filename}')
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED) as archive:
        for filename in FILES:
            archive.write(BASE / filename, 'skillshelf/' + filename)
    return {'archive': str(destination), 'sourceFiles': len(FILES)}


if __name__ == '__main__':
    print(json.dumps(export(), ensure_ascii=True))
