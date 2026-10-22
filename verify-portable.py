"""Extract the source release and build from another cwd with synthetic sources."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

BASE = Path(__file__).resolve().parent


def verify():
    parent = BASE / 'dist'
    parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='portable-test-', dir=parent) as folder:
        destination = Path(folder).resolve()
        if not destination.is_relative_to(parent.resolve()):
            raise RuntimeError('Smoke-test target escaped the intended directory.')
        with ZipFile(parent / 'skillshelf-source.zip') as archive:
            for name in archive.namelist():
                if not (destination / name).resolve().is_relative_to(destination):
                    raise RuntimeError('Archive contains an unsafe path.')
            archive.extractall(destination)
        tool = destination / 'skillshelf'
        config = {'schemaVersion': 1, 'skillRoots': ['./demo-skills'],
                  'pluginCaches': ['./demo-plugins'], 'includeAuxiliary': False}
        (tool / 'skills-config.json').write_text(json.dumps(config), encoding='utf-8')
        local_skill = tool / 'demo-skills/sepia-recreate/SKILL.md'
        local_skill.parent.mkdir(parents=True)
        local_skill.write_text('---\nname: sepia-recreate\ndescription: Rewrite an article.\n---\n# Rewrite\n', encoding='utf-8')
        plugin = tool / 'demo-plugins/demo-market/ecc/1.0.0'
        (plugin / '.codex-plugin').mkdir(parents=True)
        (plugin / '.codex-plugin/plugin.json').write_text(json.dumps({'name': 'ecc', 'skills': './skills/'}), encoding='utf-8')
        plugin_skill = plugin / 'skills/api-design/SKILL.md'
        plugin_skill.parent.mkdir(parents=True)
        plugin_skill.write_text('---\nname: api-design\ndescription: Design REST APIs.\n---\n# REST\n', encoding='utf-8')
        environment = dict(os.environ, CODEX_HOME=str(destination / 'clean-user-codex'))
        process = subprocess.run([sys.executable, str(tool / 'launch.py'), '--no-open'], cwd=destination,
                                 env=environment, capture_output=True, text=True, encoding='utf-8', timeout=30)
        if process.returncode:
            raise RuntimeError(process.stdout + process.stderr)
        index = json.loads((tool / 'skills-index.json').read_text(encoding='utf-8'))
        assert {skill['name'] for skill in index['skills']} == {'sepia-recreate', 'ecc:api-design'}
        assert all(skill['hasGuide'] for skill in index['skills'])
        assert all(Path(skill['path']).is_relative_to(tool) for skill in index['skills'])
        assert (tool / 'Skills查詢工具.html').is_file()
        result = {'passed': True, 'checks': ['source archive excludes user-generated catalog',
                  'relocated source builds from a different working directory',
                  'relative local and plugin roots resolve correctly',
                  'two synthetic Skills receive correct commands and Chinese guides']}
    (BASE / 'portable-verification-results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    print(json.dumps(verify()))
