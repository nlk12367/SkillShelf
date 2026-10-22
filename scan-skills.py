"""Discover local and plugin skills. Config paths are relative to this tool or ~."""
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
EXCLUDED = {'.git', 'node_modules', '.trash', 'tests', 'test', 'fixtures', 'examples', 'references', 'assets', 'docs'}
LIMITS = {'maxSkillBytes': 1024 * 1024, 'maxTotalBytes': 64 * 1024 * 1024,
          'maxFiles': 10000, 'maxEntries': 100000, 'maxDepth': 16}
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
    supplied_limits = config.get('scanLimits', {})
    if not isinstance(supplied_limits, dict) or supplied_limits.keys() - LIMITS.keys():
        raise ValueError('scanLimits 含有不支援的設定。')
    config['scanLimits'] = {**LIMITS, **supplied_limits}
    for key, value in config['scanLimits'].items():
        if type(value) is not int or value < (0 if key == 'maxDepth' else 1):
            raise ValueError(f'{key} 必須是有效的整數限制。')
    excluded = config.get('excludeDirectories', [])
    if not isinstance(excluded, list) or not all(isinstance(v, str) and v.strip() for v in excluded):
        raise ValueError('excludeDirectories 必須是目錄名稱字串陣列。')
    return config


def atomic_outputs(outputs):
    """Stage every output before replacing complete files on the same volume.

    Each replacement is atomic; multiple filenames are not one transaction.
    HTML is self-contained, so an older HTML remains independently usable.
    """
    staged = []
    try:
        for target, text in outputs:
            fd, name = tempfile.mkstemp(prefix='.' + target.name + '-', suffix='.tmp', dir=target.parent)
            staged.append((target, Path(name)))
            with os.fdopen(fd, 'w', encoding='utf-8', newline='') as stream:
                stream.write(text)
                stream.flush()
                os.fsync(stream.fileno())
        for target, temporary in staged:
            os.replace(temporary, target)
    finally:
        for _, temporary in staged:
            temporary.unlink(missing_ok=True)


def bounded_text(file, limit):
    """Bound the read itself, including files which grow after stat()."""
    with file.open('rb') as stream:
        content = stream.read(limit + 1)
    if len(content) > limit:
        raise ValueError(f'檔案超過 {limit} bytes 限制。')
    return content.decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n'), len(content)


class ScanBudget:
    def __init__(self, config):
        self.limits = config['scanLimits']
        self.entries = self.files = self.bytes = 0
        self.warnings = []

    def warn(self, code, label, error):
        if len(self.warnings) < 1000:
            self.warnings.append({'kind': 'warning', 'code': code, 'label': str(label), 'error': str(error)})

    def children(self, folder):
        try:
            with os.scandir(folder) as entries:
                for entry in entries:
                    if self.entries >= self.limits['maxEntries']:
                        self.warn('entry-limit', folder, '已達掃描項目數上限，剩餘項目未掃描。')
                        return
                    self.entries += 1
                    yield Path(entry.path)
        except OSError as error:
            self.warn('directory-read', folder, error)


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


def skill_sources(config, base=BASE, budget=None):
    budget = budget or ScanBudget(config)
    sources, diagnostics = [], []
    for value in config['skillRoots']:
        root = resolve_source(value, base)
        diagnostics.append({'label': value, 'exists': root.exists(), 'kind': 'skill-root'})
        if root.exists():
            group = '共用 Skills' if '/.agents/' in root.as_posix() else '使用者 Skills'
            sources.append({'root': root, 'namespace': '', 'group': group, 'version': '',
                            'label': value, 'status': 'local', 'marketplace': ''})
    try:
        states = plugin_states()
    except (OSError, UnicodeError) as error:
        budget.warn('plugin-settings', '~/.codex/config.toml', error)
        states = {}
    for value in config['pluginCaches']:
        cache = resolve_source(value, base)
        diagnostics.append({'label': value, 'exists': cache.exists(), 'kind': 'plugin-cache'})
        if not cache.exists():
            continue
        for marketplace in budget.children(cache):
            if not marketplace.is_dir():
                continue
            for plugin in budget.children(marketplace):
                if not plugin.is_dir():
                    continue
                try:
                    versions = (folder for folder in budget.children(plugin) if folder.is_dir() and
                                any((folder / name).is_file() for name in
                                    ('.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'plugin.json')))
                    latest = max(versions, key=version_key, default=None)
                    if latest is None:
                        continue
                    manifest = next(path for path in (latest / '.codex-plugin/plugin.json',
                                    latest / '.claude-plugin/plugin.json', latest / 'plugin.json') if path.is_file())
                    if not manifest.resolve().is_relative_to(latest.resolve()):
                        raise ValueError('Plugin manifest 路徑超出來源範圍。')
                    manifest_data = json.loads(bounded_text(manifest, 256 * 1024)[0])
                    if not isinstance(manifest_data, dict):
                        raise ValueError('Plugin manifest 必須是 JSON 物件。')
                    namespace = manifest_data.get('name', plugin.name)
                    if not isinstance(namespace, str) or not namespace.strip() or len(namespace) > 200:
                        raise ValueError('Plugin name 必須是非空白名稱字串。')
                    declared = manifest_data.get('skills', './skills/')
                    declared = [declared] if isinstance(declared, str) else declared
                    if not isinstance(declared, list) or len(declared) > 100:
                        raise ValueError('Plugin skills 必須是路徑字串或陣列，最多 100 個。')
                    roots = []
                    for entry in declared:
                        if not isinstance(entry, str) or not entry.strip():
                            raise ValueError('Plugin skill 路徑必須是非空白字串。')
                        candidate = (latest / entry).resolve()
                        if not candidate.is_relative_to(latest.resolve()):
                            raise ValueError('Skill source escapes plugin root.')
                        if candidate.exists() and candidate not in roots:
                            roots.append(candidate)
                    migrated = latest / '.codex-plugin/migrated-command-skills'
                    if namespace == 'ecc' and migrated.exists():
                        roots.append(migrated.resolve())
                    enabled = states.get(namespace + '@' + marketplace.name)
                    plugin_sources = []
                    for root in roots:
                        if not root.is_relative_to(latest.resolve()):
                            raise ValueError('Skill source escapes plugin root.')
                        plugin_sources.append({'root': root, 'namespace': namespace, 'boundary': latest.resolve(),
                                        'group': 'ECC' if namespace == 'ecc' else '其他 Plugins',
                                        'version': latest.name, 'marketplace': marketplace.name,
                                        'label': value + '/' + root.relative_to(cache.resolve()).as_posix(),
                                        'status': 'enabled' if enabled is True else 'disabled' if enabled is False else 'unknown'})
                    sources.extend(plugin_sources)
                except (OSError, ValueError, TypeError, RuntimeError) as error:
                    budget.warn('plugin-invalid', plugin, error)
    return sources, diagnostics


def skill_files(spec, config, budget, skipped):
    root = spec['root']
    excluded = EXCLUDED | {v.lower() for v in config.get('excludeDirectories', [])}
    visited = set()
    stack = [(root, 0)]
    while stack:
        folder, depth = stack.pop()
        try:
            canonical = folder.resolve()
            if spec.get('boundary') and not canonical.is_relative_to(spec['boundary']):
                budget.warn('plugin-path', folder, '連結路徑超出 Plugin 範圍，已略過。')
                continue
            if canonical in visited:
                continue
            visited.add(canonical)
            if folder.is_file():
                yield folder
                continue
            for child in budget.children(folder):
                if child.is_dir():
                    if not config['includeAuxiliary'] and child.name.lower() in excluded:
                        skipped.append(str(child))
                    elif depth >= budget.limits['maxDepth']:
                        budget.warn('depth-limit', child, '超過掃描深度限制。')
                    else:
                        stack.append((child, depth + 1))
                elif child.name == 'SKILL.md':
                    if spec.get('boundary') and not child.resolve().is_relative_to(spec['boundary']):
                        budget.warn('plugin-path', child, '檔案連結超出 Plugin 範圍，已略過。')
                    else:
                        yield child
        except (OSError, RuntimeError) as error:
            budget.warn('directory-read', folder, error)


def scan(verbose=True, base=BASE, write_output=True):
    config = load_config(base)
    budget = ScanBudget(config)
    sources, diagnostics = skill_sources(config, base, budget)
    items, skipped, seen_paths, read_errors = [], [], set(), []
    for spec in sources:
        root, namespace = spec['root'], spec['namespace']
        for file in skill_files(spec, config, budget, skipped):
            relative = file.relative_to(root) if file != root else Path(file.name)
            auxiliary = any(part.lower() in EXCLUDED for part in relative.parts)
            if auxiliary and not config['includeAuxiliary']:
                skipped.append(str(file))
                continue
            try:
                canonical = str(file.resolve()).casefold()
            except (OSError, RuntimeError) as error:
                read_errors.append({'file': str(file), 'error': str(error)})
                continue
            if canonical in seen_paths:
                continue
            seen_paths.add(canonical)
            if budget.files >= budget.limits['maxFiles'] or budget.bytes >= budget.limits['maxTotalBytes']:
                budget.warn('scan-limit', spec['label'], '已達檔案數或總讀取量上限，剩餘 Skills 未掃描。')
                break
            budget.files += 1
            try:
                limit = min(budget.limits['maxSkillBytes'], budget.limits['maxTotalBytes'] - budget.bytes)
                if file.stat().st_size > limit:
                    raise ValueError(f'檔案超過 {limit} bytes 限制。')
                text, size_bytes = bounded_text(file, limit)
                budget.bytes += size_bytes
            except (OSError, UnicodeError, ValueError) as error:
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
                          'originalDescription': meta.get('description', ''),
                          'sourceGroup': spec['group'], 'source': source, 'version': spec['version'],
                          'status': spec['status'], 'auxiliary': auxiliary, 'path': str(file),
                          'relativePath': relative.as_posix(), 'sourceLabel': spec['label'],
                          'headings': re.findall(r'^#{1,3}\s+(.+)', body, re.M)[:24], 'body': text,
                          'sha256': hashlib.sha256(text.encode()).hexdigest(), 'size': len(text)})
    roots = [{k: (str(v) if isinstance(v, Path) else v) for k, v in spec.items()} for spec in sources]
    payload = {'root': '~/.codex/skills', 'roots': roots, 'diagnostics': diagnostics + budget.warnings,
               'scanStats': {'entries': budget.entries, 'filesAttempted': budget.files, 'bytesRead': budget.bytes},
               'config': config, 'readErrors': read_errors, 'scannedAt': datetime.now().astimezone().isoformat(),
               'skills': items, 'excluded': skipped}
    if write_output:
        atomic_outputs([(base / 'skills-raw.json', json.dumps(payload, ensure_ascii=False, indent=2))])
    if verbose:
        print(json.dumps({'filesRead': len(items), 'uniqueNames': len({x['name'] for x in items}),
                          'charactersRead': sum(x['size'] for x in items), 'excluded': len(skipped),
                          'readErrors': read_errors}, ensure_ascii=False))
    return payload


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    scan()
