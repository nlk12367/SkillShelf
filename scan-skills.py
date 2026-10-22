"""Discover local and plugin skills. Config paths are relative to this tool or ~."""
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
EXCLUDED = {'.git', 'node_modules', '.trash', 'tests', 'test', 'fixtures', 'examples', 'references', 'assets', 'docs'}
DEFAULT_CONFIG = {
    'schemaVersion': 1,
    'skillRoots': ['~/.codex/skills', '~/.agents/skills', '~/.claude/skills', '~/.cursor/skills',
                   '~/.config/opencode/skills', './.codex/skills', './.agents/skills', './.claude/skills'],
    'pluginCaches': ['~/.codex/plugins/cache', '~/.claude/plugins/cache'],
    'includeAuxiliary': False,
}


def resolve_source(value, base=BASE):
    """Relative sources resolve against the tool folder, never the shell cwd."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError('掃描來源必須是非空白路徑字串。')
    if value == '~/.codex' or value.startswith('~/.codex/'):
        codex_home = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))).expanduser()
        return (codex_home / value[len('~/.codex/'):]).resolve() if value.startswith('~/.codex/') else codex_home.resolve()
    path = Path(os.path.expandvars(value)).expanduser()
    return (path if path.is_absolute() else base / path).resolve()


def load_config(base=BASE):
    file = base / 'skills-config.json'
    config = dict(DEFAULT_CONFIG)
    if file.exists():
        supplied = json.loads(file.read_text(encoding='utf-8-sig'))
        if not isinstance(supplied, dict):
            raise ValueError('skills-config.json 必須是 JSON 物件。')
        config.update(supplied)
    for field in ('skillRoots', 'pluginCaches'):
        if not isinstance(config[field], list) or not all(isinstance(v, str) and v.strip() for v in config[field]):
            raise ValueError(f'{field} 必須是路徑字串陣列。')
    if not isinstance(config['includeAuxiliary'], bool):
        raise ValueError('includeAuxiliary 必須是 true 或 false。')
    return config


def metadata(text):
    match = re.match(r'\A\ufeff?---\s*\n(.*?)\n---(?:\s*\n|$)', text, re.S)
    if not match:
        return {}, text
    header, result = match.group(1), {}
    for field in ('name', 'description'):
        value = re.search(r'^' + field + r':[ \t]*(.*)(?:\n|$)', header, re.M)
        if not value:
            continue
        raw = value.group(1).strip()
        if raw in ('|', '>', '|-', '>-'):
            block = []
            for line in header[value.end():].splitlines():
                if line and not line[0].isspace():
                    break
                block.append(line.strip())
            raw = ' '.join(block)
        result[field] = raw.strip('"\'')
    return result, text[match.end():]


def version_key(path):
    return tuple((1, int(part)) if part.isdigit() else (0, part.lower())
                 for part in re.findall(r'\d+|[^\d]+', path.name))


def plugin_states():
    """Read only plugin enable flags; never include credentials or full config."""
    file = resolve_source('~/.codex/config.toml')
    if not file.exists():
        return {}
    states = {}
    for match in re.finditer(r'^\[plugins\."([^"\n]+)"\]\s*\n([^\[]*)', file.read_text(encoding='utf-8-sig'), re.M):
        enabled = re.search(r'^enabled\s*=\s*(true|false)\s*$', match.group(2), re.M)
        if enabled:
            states[match.group(1)] = enabled.group(1) == 'true'
    return states


def skill_sources(config, base=BASE):
    sources, diagnostics = [], []
    for value in config['skillRoots']:
        root = resolve_source(value, base)
        diagnostics.append({'label': value, 'exists': root.exists(), 'kind': 'skill-root'})
        if root.exists():
            group = '共用 Skills' if '/.agents/' in root.as_posix() else '使用者 Skills'
            sources.append({'root': root, 'namespace': '', 'group': group, 'version': '',
                            'label': value, 'status': 'local', 'marketplace': ''})
    states = plugin_states()
    for value in config['pluginCaches']:
        cache = resolve_source(value, base)
        diagnostics.append({'label': value, 'exists': cache.exists(), 'kind': 'plugin-cache'})
        if not cache.exists():
            continue
        for marketplace in sorted(cache.iterdir()):
            if not marketplace.is_dir():
                continue
            for plugin in sorted(marketplace.iterdir()):
                if not plugin.is_dir():
                    continue
                versions = [folder for folder in plugin.iterdir() if folder.is_dir() and
                            ((folder / '.codex-plugin/plugin.json').is_file() or
                             (folder / '.claude-plugin/plugin.json').is_file() or
                             (folder / 'plugin.json').is_file())]
                if not versions:
                    continue
                latest = max(versions, key=version_key)
                manifest = next(path for path in (latest / '.codex-plugin/plugin.json',
                                latest / '.claude-plugin/plugin.json', latest / 'plugin.json') if path.exists())
                manifest_data = json.loads(manifest.read_text(encoding='utf-8-sig'))
                namespace = manifest_data.get('name', plugin.name)
                declared = manifest_data.get('skills', './skills/')
                declared = [declared] if isinstance(declared, str) else (declared or [])
                roots = []
                for entry in declared:
                    if not isinstance(entry, str):
                        raise ValueError(f'Unsupported skill source in {manifest}: {entry!r}')
                    candidate = (latest / entry).resolve()
                    if not candidate.is_relative_to(latest.resolve()):
                        raise ValueError(f'Skill source escapes plugin root: {manifest}')
                    if candidate.exists() and candidate not in roots:
                        roots.append(candidate)
                migrated = latest / '.codex-plugin/migrated-command-skills'
                if namespace == 'ecc' and migrated.exists():
                    roots.append(migrated)
                enabled = states.get(namespace + '@' + marketplace.name)
                for root in roots:
                    sources.append({'root': root, 'namespace': namespace,
                                    'group': 'ECC' if namespace == 'ecc' else '其他 Plugins',
                                    'version': latest.name, 'marketplace': marketplace.name,
                                    'label': value + '/' + root.relative_to(cache).as_posix(),
                                    'status': 'enabled' if enabled is True else 'disabled' if enabled is False else 'unknown'})
    return sources, diagnostics


def scan(verbose=True, base=BASE):
    config = load_config(base)
    sources, diagnostics = skill_sources(config, base)
    items, skipped, seen_paths, read_errors = [], [], set(), []
    for spec in sources:
        root, namespace = spec['root'], spec['namespace']
        files = [root] if root.is_file() else sorted(root.rglob('SKILL.md'))
        for file in files:
            relative = file.relative_to(root) if file != root else Path(file.name)
            auxiliary = any(part.lower() in EXCLUDED for part in relative.parts)
            if auxiliary and not config['includeAuxiliary']:
                skipped.append(str(file))
                continue
            canonical = str(file.resolve()).casefold()
            if canonical in seen_paths:
                continue
            seen_paths.add(canonical)
            try:
                text = file.read_text(encoding='utf-8-sig')
            except (OSError, UnicodeError) as error:
                read_errors.append({'file': spec['label'] + '/' + relative.as_posix(), 'error': str(error)})
                continue
            meta, body = metadata(text)
            base_name = meta.get('name', file.parent.name)
            name = f'{namespace}:{base_name}' if namespace else base_name
            source = namespace + (' 指令轉換' if root.name == 'migrated-command-skills' else ' plugin') if namespace else '使用者安裝'
            if not namespace:
                if spec['group'] == '共用 Skills':
                    source = '共用 .agents Skills'
                elif relative.parts[0] == '.system':
                    source = '系統內建'
                elif '.claude' in relative.parts:
                    source = '套件內附 Claude Skill'
                elif len(relative.parts) > 2:
                    source = relative.parts[0]
            stable_key = spec['label'].split('/' + spec['version'] + '/', 1)[0] if namespace else spec['label']
            stable_key += '/' + relative.as_posix()
            items.append({'id': hashlib.sha256(stable_key.encode()).hexdigest()[:12],
                          'legacyId': hashlib.sha256(str(file).encode()).hexdigest()[:12],
                          'name': name, 'baseName': base_name, 'plugin': namespace,
                          'sourceGroup': spec['group'], 'source': source, 'version': spec['version'],
                          'status': spec['status'], 'auxiliary': auxiliary, 'path': str(file),
                          'relativePath': relative.as_posix(), 'sourceLabel': spec['label'],
                          'headings': re.findall(r'^#{1,3}\s+(.+)', body, re.M)[:24], 'body': text,
                          'sha256': hashlib.sha256(text.encode()).hexdigest(), 'size': len(text)})
    roots = [{k: (str(v) if isinstance(v, Path) else v) for k, v in spec.items()} for spec in sources]
    payload = {'root': '~/.codex/skills', 'roots': roots, 'diagnostics': diagnostics,
               'config': config, 'readErrors': read_errors, 'scannedAt': datetime.now().astimezone().isoformat(),
               'skills': items, 'excluded': skipped}
    (base / 'skills-raw.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    if verbose:
        print(json.dumps({'filesRead': len(items), 'uniqueNames': len({x['name'] for x in items}),
                          'charactersRead': sum(x['size'] for x in items), 'excluded': len(skipped),
                          'readErrors': read_errors}, ensure_ascii=False))
    return payload


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    scan()
