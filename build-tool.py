"""Build a portable offline HTML file using only Python's standard library."""
import importlib.util
import base64
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
CATEGORIES = ['簡報與文件', '網頁與介面', '圖片與設計', '3D 與場景', '動畫與互動',
              '遊戲開發', 'Godot', 'Unity', 'Unreal', 'Roblox', '研究與寫作', '工具與程式',
              '程式與架構', '資料與 API', '測試與資安', '部署與維運', 'AI 與 Agents', '商務與營運']


def build():
    spec = importlib.util.spec_from_file_location('skill_scanner', BASE / 'scan-skills.py')
    scanner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scanner)
    raw = scanner.scan(verbose=False)
    guides = {}
    guide_text = '\n'.join((BASE / filename).read_text(encoding='utf-8')
                           for filename in ('skill-guide.tsv', 'plugin-guide.tsv'))
    for line in guide_text.splitlines():
        if not line or line.startswith('#'):
            continue
        category, name, title, summary, keywords = line.split('|', 4)
        guides[name] = dict(category=category, title=title, summary=summary, keywords=keywords.split())
    for skill in raw['skills']:
        guide = guides.get(skill['name'])
        skill.update(guide or dict(category='工具與程式', title=skill['name'],
                                  summary='新加入的 Skill，可展開查看原始用途說明。', keywords=[]))
        skill['hasGuide'] = guide is not None
        skill['isTemplate'] = skill['name'] == 'template-skill'
        skill['keywords'] = list(skill['keywords'])
        skill['keywords'].extend([skill.get('plugin', ''), skill.get('baseName', skill['name'])])
        skill['engine'] = next((engine for engine in ('Godot', 'Unity', 'Unreal', 'Roblox')
                                if skill['name'].startswith(engine.lower() + '-')), '')
        if skill['name'].startswith('threejs-'):
            skill['engine'] = 'Three.js'
        elif skill['name'] in ('lighting', 'sky-box', 'world-environment', 'procedural-scene-props',
                               'player-controllers', 'diegetic-world-text'):
            skill['engine'] = 'Babylon.js'
        if skill['engine']:
            skill['keywords'].append(skill['engine'])
    raw['skills'].sort(key=lambda skill: (skill['isTemplate'], skill['name'], skill['path']))
    raw['categories'] = CATEGORIES
    raw['uniqueNames'] = len({s['name'] for s in raw['skills']})
    raw.pop('excluded', None)
    data = json.dumps(raw, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    html = (BASE / 'tool-shell.html').read_text(encoding='utf-8')
    for filename in ('app-icon-32.png', 'app-icon-128.png'):
        encoded = base64.b64encode((BASE / 'assets' / filename).read_bytes()).decode('ascii')
        html = html.replace('assets/' + filename, 'data:image/png;base64,' + encoded)
    html = html.replace('/*__STYLES__*/', (BASE / 'tool.css').read_text(encoding='utf-8'))
    html = html.replace('/*__DATA__*/', data)
    html = html.replace('/*__APP__*/', (BASE / 'tool.js').read_text(encoding='utf-8'))
    (BASE / 'Skills查詢工具.html').write_text(html, encoding='utf-8')
    (BASE / 'skills-index.json').write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'files': len(raw['skills']), 'uniqueNames': raw['uniqueNames'], 'scannedAt': raw['scannedAt'],
            'guideCoverage': sum(s['hasGuide'] for s in raw['skills'])}


if __name__ == '__main__':
    print(json.dumps(build(), ensure_ascii=False))
